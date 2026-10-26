import { AuthManager } from "../auth/authManager.js";
import { LocalStore } from "../storage/localStore.js";
import { SupabaseApi } from "../../data/remote/supabase/supabaseApi.js";
import { PluginRuntime } from "../player/pluginRuntime.js";
import { isRepoUrl } from "../plugins/pluginRepo.js";
import { ProfileManager } from "./profileManager.js";
import { SyncHydrationState, SyncPullResult } from "./syncHydrationState.js";

const TABLE = "plugins";
const PUSH_RPC = "sync_push_plugins";
const pendingLocalChanges = new Map();
// The repository URLs the account held the last time this device read or
// wrote it, by plugin profile. It tells a repository added here and not yet
// sent (absent from it) from one removed on another device (present in it),
// across reloads. Cleared with the rest of the account's local data.
const BASELINE_KEY = "pluginSyncBaseline";

function readBaseline(profileId) {
  const all = LocalStore.get(BASELINE_KEY, null);
  const urls = all && typeof all === "object" ? all[String(profileId)] : null;
  return Array.isArray(urls) ? new Set(urls) : null;
}

function writeBaseline(profileId, sources = []) {
  const all = LocalStore.get(BASELINE_KEY, null);
  LocalStore.set(BASELINE_KEY, {
    ...(all && typeof all === "object" ? all : {}),
    [String(profileId)]: sources.map((source) => sourceKey(source)).filter(Boolean)
  });
}

function resolveProfileId() {
  const raw = Number(ProfileManager.getActiveProfileId() || 1);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.trunc(raw);
  }
  return 1;
}

async function resolvePluginProfileId() {
  const profileId = resolveProfileId();
  if (profileId === 1) {
    return 1;
  }
  const profiles = await ProfileManager.getProfiles();
  const activeProfile = profiles.find((profile) => {
    const id = Number(profile?.profileIndex || profile?.id || 1);
    return Number.isFinite(id) && Math.trunc(id) === profileId;
  });
  const usesPrimaryPlugins =
    typeof activeProfile?.usesPrimaryPlugins === "boolean"
      ? activeProfile.usesPrimaryPlugins
      : typeof activeProfile?.uses_primary_plugins === "boolean"
        ? activeProfile.uses_primary_plugins
        : false;
  return usesPrimaryPlugins ? 1 : profileId;
}

function shouldTryLegacyTable(error) {
  if (!error) {
    return false;
  }
  if (error.status === 404) {
    return true;
  }
  if (typeof error.code === "string" && (error.code === "PGRST205" || error.code === "PGRST202")) {
    return true;
  }
  const message = String(error.message || "");
  return (
    message.includes("PGRST205") ||
    message.includes("PGRST202") ||
    message.includes("Could not find the table") ||
    message.includes("Could not find the function")
  );
}

function sourceIdFromUrl(url, index) {
  const compact = String(url || "")
    .replace(/[^a-z0-9]/gi, "")
    .slice(-18)
    .toLowerCase();
  return `plugin_${index + 1}_${compact || "source"}`;
}

function mapRemoteRowsToSources(rows = []) {
  return (rows || [])
    .map((row, index) => {
      // Only repository URLs are plugins; URL templates written by older
      // web builds are ignored rather than shown as fake streams.
      const url = String(row.url || "").trim();
      if (!isRepoUrl(url)) {
        return null;
      }
      return {
        id: sourceIdFromUrl(url, index),
        name: row.name || `Plugin ${index + 1}`,
        url,
        enabled: row.enabled !== false,
        ...(typeof row.repo_type === "string" && row.repo_type ? { repoType: row.repo_type } : {})
      };
    })
    .filter(Boolean);
}

function sourceKey(source = {}) {
  return String(source.url || "").trim();
}

// Rows the account may receive: real repository URLs only, never templates.
// The push replaces every row, so a repository kind a native app recorded
// (`repo_type`) is sent back as it came; a repository added here has none and
// the native apps detect it.
export function buildPushRows(sources = []) {
  return (sources || [])
    .filter((source) => isRepoUrl(source?.url))
    .map((source, index) => ({
      url: String(source.url).trim(),
      name: source.name || `Plugin ${index + 1}`,
      enabled: source.enabled !== false,
      sort_order: index,
      ...(typeof source.repoType === "string" && source.repoType ? { repo_type: source.repoType } : {})
    }));
}

function mergeSources(localSources = [], remoteSources = []) {
  const localByKey = new Map();
  localSources.forEach((source) => {
    const key = sourceKey(source);
    if (!key) {
      return;
    }
    localByKey.set(key, source);
  });

  const merged = [];
  remoteSources.forEach((remoteSource, index) => {
    const key = sourceKey(remoteSource);
    if (!key) {
      return;
    }
    const localSource = localByKey.get(key);
    merged.push({
      ...(localSource || {}),
      ...remoteSource,
      id: remoteSource.id || localSource?.id || sourceIdFromUrl(key, index)
    });
    localByKey.delete(key);
  });

  // The account list is authoritative, as for add-ons and collections: a
  // repository only this device still has was removed elsewhere. This
  // device's own unsent changes are laid back on by the caller.
  return merged;
}

function sameSource(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// The account list, plus what is this device's own:
// - repositories only this device has that the account never had (baseline)
//   were added here and not sent yet; ones the account had were removed
//   elsewhere and go;
// - this session's unsent changes (pending before/after): its removals, its
//   additions, and the entries it changed. Entries it did not touch keep the
//   account's values.
function mergeWithAccount(localSources = [], remoteSources = [], baseline = null, pending = null) {
  let merged = mergeSources(localSources, remoteSources);
  const remoteKeys = new Set(remoteSources.map(sourceKey));
  localSources.forEach((source) => {
    const key = sourceKey(source);
    if (!key || remoteKeys.has(key)) return;
    // Without a baseline (first sync after an update) nothing can be told
    // apart, so local repositories are kept as before.
    if (!baseline || !baseline.has(key)) merged.push(source);
  });
  if (!pending) return merged;

  const beforeByKey = new Map((pending.before || []).map((source) => [sourceKey(source), source]));
  const afterByKey = new Map((pending.after || []).map((source) => [sourceKey(source), source]));
  merged = merged
    .filter((source) => {
      const key = sourceKey(source);
      return !beforeByKey.has(key) || afterByKey.has(key);
    })
    .map((source) => {
      const key = sourceKey(source);
      const changedHere = afterByKey.has(key) && !sameSource(beforeByKey.get(key), afterByKey.get(key));
      return changedHere ? { ...source, ...afterByKey.get(key) } : source;
    });
  afterByKey.forEach((source, key) => {
    if (!beforeByKey.has(key) && !merged.some((entry) => sourceKey(entry) === key)) merged.push(source);
  });
  return merged;
}

function readLocalSources() {
  return PluginRuntime.listSources();
}

function writeLocalSources(sources) {
  PluginRuntime.saveSources(sources || []);
}

export const PluginSyncService = {
  recordLocalMutation(profileId = null, before = [], after = []) {
    const key = String(resolveProfileId(profileId));
    const existing = pendingLocalChanges.get(key);
    pendingLocalChanges.set(key, {
      before: existing?.before || before,
      after
    });
  },

  hasPendingLocalMutation(profileId = null) {
    return pendingLocalChanges.has(String(resolveProfileId(profileId)));
  },

  async pull({ context = null } = {}) {
    try {
      if (!AuthManager.isAuthenticated) {
        return { result: SyncPullResult.FAILED, items: [] };
      }
      const localSources = readLocalSources();
      const profileId = await resolvePluginProfileId();
      const syncContext = context || (await SyncHydrationState.capture(profileId));
      if (!(await SyncHydrationState.beginPull(syncContext, "plugins"))) {
        return { result: SyncPullResult.FAILED, items: localSources };
      }
      const ownerId = await AuthManager.getEffectiveUserId();
      const rows = await SupabaseApi.select(
        TABLE,
        `user_id=eq.${encodeURIComponent(ownerId)}&profile_id=eq.${profileId}&select=*&order=sort_order.asc`,
        true
      );
      if (!(await SyncHydrationState.isCurrent(syncContext))) {
        return { result: SyncPullResult.FAILED, items: localSources };
      }
      const remoteSources = mapRemoteRowsToSources(rows);
      // An empty account list only means "removed elsewhere" for repositories
      // this device saw on the account before; with no baseline (a new
      // account, or the first sync after an update) local ones are kept.
      const baseline = readBaseline(profileId);
      if (!remoteSources.length && localSources.length && !baseline?.size) {
        await SyncHydrationState.completePull(syncContext, "plugins", SyncPullResult.SUCCESS_EMPTY);
        return { result: SyncPullResult.SUCCESS_EMPTY, items: localSources };
      }
      const pendingKey = [String(resolveProfileId()), String(profileId)].find((key) => pendingLocalChanges.has(key));
      const pending = pendingKey ? pendingLocalChanges.get(pendingKey) : null;
      const mergedSources = mergeWithAccount(localSources, remoteSources, baseline, pending);
      writeLocalSources(mergedSources);
      writeBaseline(profileId, remoteSources);
      // Repositories added here that the account has not got yet are this
      // device's change to send, even after a reload.
      const remoteKeys = new Set(remoteSources.map(sourceKey));
      if (!pending && mergedSources.some((source) => !remoteKeys.has(sourceKey(source)))) {
        this.recordLocalMutation(null, remoteSources, mergedSources);
      }
      const result = remoteSources.length ? SyncPullResult.SUCCESS_WITH_DATA : SyncPullResult.SUCCESS_EMPTY;
      await SyncHydrationState.completePull(syncContext, "plugins", result);
      return { result, items: mergedSources };
    } catch (error) {
      console.warn("Plugin sync pull failed", error);
      return { result: SyncPullResult.FAILED, items: [] };
    }
  },

  async push({ automatic = false, context = null } = {}) {
    try {
      if (!AuthManager.isAuthenticated) {
        return false;
      }
      const profileId = await resolvePluginProfileId();
      const syncContext = context || (await SyncHydrationState.capture(profileId));
      if (automatic && !(await SyncHydrationState.allowsAutomaticPush(syncContext, "plugins"))) {
        console.info("[Sync] plugins automatic push blocked", { hydration: SyncHydrationState.get(syncContext, "plugins") });
        return false;
      }
      // Pull-only by default: the account list is only rewritten after the
      // user changed plugins on this device.
      const pendingKeys = [String(resolveProfileId()), String(profileId)];
      if (automatic && !pendingKeys.some((key) => pendingLocalChanges.has(key))) {
        return false;
      }
      const sentSources = readLocalSources();
      const pushRows = buildPushRows(sentSources);
      // A change made while this push is on the wire records a new pending
      // entry. Only the entries this push carries may be cleared by it; a
      // newer one is kept, measured from what this push sent.
      const sentPending = new Map(pendingKeys.map((key) => [key, pendingLocalChanges.get(key)]));
      const settlePush = () => {
        pendingKeys.forEach((key) => {
          const current = pendingLocalChanges.get(key);
          if (current === sentPending.get(key)) pendingLocalChanges.delete(key);
          else if (current) pendingLocalChanges.set(key, { before: sentSources, after: current.after });
        });
        writeBaseline(profileId, sentSources);
      };
      try {
        await SupabaseApi.rpc(
          PUSH_RPC,
          {
            p_profile_id: profileId,
            p_plugins: pushRows
          },
          true
        );
        settlePush();
        return true;
      } catch (rpcError) {
        if (!shouldTryLegacyTable(rpcError)) {
          throw rpcError;
        }
      }

      const ownerId = await AuthManager.getEffectiveUserId();
      // Deployments without the RPC predate the repo_type column; sending it
      // there would fail after the delete below and leave the list empty.
      const rows = pushRows.map(({ repo_type: _repoType, ...row }) => ({
        user_id: ownerId,
        profile_id: profileId,
        ...row
      }));
      await SupabaseApi.delete(
        TABLE,
        `user_id=eq.${encodeURIComponent(ownerId)}&profile_id=eq.${profileId}`,
        true
      );
      if (rows.length) {
        try {
          await SupabaseApi.upsert(TABLE, rows, "user_id,profile_id,url", true);
        } catch {
          await SupabaseApi.upsert(TABLE, rows, null, true);
        }
      }
      settlePush();
      return true;
    } catch (error) {
      console.warn("Plugin sync push failed", error);
      return false;
    }
  }
};
