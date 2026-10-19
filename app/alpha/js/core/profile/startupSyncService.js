import { AuthManager } from "../auth/authManager.js";
import { addonRepository } from "../../data/repository/addonRepository.js";
import { ProfileManager } from "./profileManager.js";
import { ProfileSyncService } from "./profileSyncService.js";
import { LibrarySyncService } from "./librarySyncService.js";
import { WatchProgressSyncService } from "./watchProgressSyncService.js";
import { SavedLibrarySyncService } from "./savedLibrarySyncService.js";
import { WatchedItemsSyncService } from "./watchedItemsSyncService.js";
import { PluginSyncService } from "./pluginSyncService.js";
import { ProfileSettingsSyncService } from "./profileSettingsSyncService.js";
import { TraktCredentialSyncService } from "./traktCredentialSyncService.js";
import { SimklCredentialSyncService } from "./simklCredentialSyncService.js";
import { ProviderCredentialSyncService } from "./providerCredentialSyncService.js";
import { SimklSyncService } from "../../data/repository/simklSyncService.js";
import { CollectionSyncService } from "./collectionSyncService.js";
import { HomeCatalogSettingsSyncService } from "./homeCatalogSettingsSyncService.js";
import { ThemeManager } from "../../ui/theme/themeManager.js";
import { I18n } from "../../i18n/index.js";
import { SyncHydrationState, SyncPullResult } from "./syncHydrationState.js";

const SYNC_INTERVAL_MS = 120000;
const ADDON_PUSH_DEBOUNCE_MS = 1000;
const MAX_PULL_ATTEMPTS = 3;
const STARTUP_SYNC_PERF_DEBUG = Boolean(globalThis.__NUVIO_DEBUG_STARTUP_PERF__);

function syncNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function logSyncTiming(stage, startedAt) {
  if (!STARTUP_SYNC_PERF_DEBUG) return;
  console.info("[startup-perf]", stage, { ms: Number((syncNow() - startedAt).toFixed(2)) });
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeProfileId(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function isActiveProfile(profileId) {
  return normalizeProfileId(profileId) === normalizeProfileId(ProfileManager.getActiveProfileId());
}

function succeeded(result) {
  return (
    result?.result === SyncPullResult.SUCCESS_WITH_DATA ||
    result?.result === SyncPullResult.SUCCESS_EMPTY
  );
}

function settledValue(settled, fallback = null) {
  return settled?.status === "fulfilled" ? settled.value : fallback;
}

// Async work belongs to one start/stop lifecycle, even when profile IDs repeat.
let lifecycleGeneration = 0;
let pendingCriticalHydration = null; // { profileId, generation, promise }

async function hydrateCriticalHomeUncached(resolvedProfileId) {
  const generation = lifecycleGeneration;
  const startedAt = syncNow();
  if (!resolvedProfileId || !isActiveProfile(resolvedProfileId)) {
    return { profileId: resolvedProfileId, current: false, addons: null };
  }

  // Home must not mount with a temporary catalog layout or add-on list and
  // then visibly replace it. These are the only remote domains on its first
  // render critical path; everything else belongs to background hydration.
  const syncContext = AuthManager.isAuthenticated
    ? await SyncHydrationState.capture(resolvedProfileId)
    : null;
  if (generation !== lifecycleGeneration || !isActiveProfile(resolvedProfileId)) {
    return { profileId: resolvedProfileId, current: false, addons: null };
  }
  const [profileSettings, homeCatalog, addons] = AuthManager.isAuthenticated
    ? await Promise.allSettled([
        ProfileSettingsSyncService.pull(resolvedProfileId),
        HomeCatalogSettingsSyncService.pull(resolvedProfileId),
        LibrarySyncService.pull()
      ])
    : [
        { status: "fulfilled", value: false },
        { status: "fulfilled", value: false },
        { status: "fulfilled", value: null }
      ];

  const currentContext = !syncContext || (await SyncHydrationState.isCurrent(syncContext));
  const current =
    generation === lifecycleGeneration &&
    isActiveProfile(resolvedProfileId) && currentContext;
  if (!current) {
    return { profileId: resolvedProfileId, current: false, addons: null };
  }

  // Theme and language are profile-scoped settings. Apply them only after
  // the active profile's settings pull is settled, never from a stale pull.
  await I18n.init();
  const presentationContextCurrent = !syncContext || (await SyncHydrationState.isCurrent(syncContext));
  if (generation !== lifecycleGeneration || !isActiveProfile(resolvedProfileId) || !presentationContextCurrent) {
    return { profileId: resolvedProfileId, current: false, addons: null };
  }
  ThemeManager.apply();
  I18n.apply();
  logSyncTiming("critical-home-hydration-ready", startedAt);
  return {
    profileId: resolvedProfileId,
    current: true,
    profileSettings: settledValue(profileSettings, false),
    homeCatalog: settledValue(homeCatalog, false),
    addons: settledValue(addons, null)
  };
}

async function collectKnownProfileIds(profiles = []) {
  const ids = [
    normalizeProfileId(ProfileManager.getActiveProfileId()),
    ...(Array.isArray(profiles) ? profiles : []).map((profile) =>
      normalizeProfileId(profile?.id ?? profile?.profileIndex)
    )
  ].filter(Boolean);

  if (ids.length <= 1) {
    const storedProfiles = await ProfileManager.getProfiles().catch(() => []);
    ids.push(
      ...storedProfiles
        .map((profile) => normalizeProfileId(profile?.id ?? profile?.profileIndex))
        .filter(Boolean)
    );
  }

  return Array.from(new Set(ids));
}

export const StartupSyncService = {
  started: false,
  intervalId: null,
  inFlight: false,
  syncRequestedWhileInFlight: false,
  profileScopedSyncEnabled: false,
  addonPushTimer: null,
  addonSyncInFlight: null,
  addonSyncWaiters: [],
  addonSyncPending: false,
  unsubscribeAddonChanges: null,

  async start({ profileScopedSyncEnabled = false, runInitialPull = true } = {}) {
    if (this.started) {
      if (profileScopedSyncEnabled) {
        this.profileScopedSyncEnabled = true;
      }
      return;
    }
    lifecycleGeneration += 1;
    const generation = lifecycleGeneration;
    pendingCriticalHydration = null;
    this.started = true;
    SyncHydrationState.invalidate();
    this.profileScopedSyncEnabled = Boolean(profileScopedSyncEnabled);

    this.unsubscribeAddonChanges = addonRepository.onInstalledAddonsChanged((reason, mutation) => {
      // A completed remote pull updates mounted UI but is not a user mutation.
      // Scheduling a push here could make temporary defaults authoritative.
      if (reason === "remote-pull") {
        return;
      }
      LibrarySyncService.markLocalMutation(null, mutation);
      this.scheduleAddonPush();
    });

    if (runInitialPull) {
      await this.syncPull({ includeProfileScoped: this.profileScopedSyncEnabled });
    }

    if (generation !== lifecycleGeneration || !this.started) return;
    this.intervalId = setInterval(() => {
      this.syncCycle();
    }, SYNC_INTERVAL_MS);
  },

  stop() {
    lifecycleGeneration += 1;
    pendingCriticalHydration = null;
    this.inFlight = false;
    this.syncRequestedWhileInFlight = false;
    this.addonSyncInFlight = null;
    this.started = false;
    SyncHydrationState.invalidate();
    this.profileScopedSyncEnabled = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.addonPushTimer) {
      clearTimeout(this.addonPushTimer);
      this.addonPushTimer = null;
    }
    this.addonSyncWaiters.splice(0).forEach((resolve) => resolve(false));
    this.addonSyncPending = false;
    if (this.unsubscribeAddonChanges) {
      this.unsubscribeAddonChanges();
      this.unsubscribeAddonChanges = null;
    }
  },

  enableProfileScopedSync() {
    this.profileScopedSyncEnabled = true;
    SyncHydrationState.invalidate();
  },

  // Profile activation kicks this off without waiting for it (so the screen
  // transition away from profile selection is instant), and Home's own mount
  // awaits it before fetching catalog rows. Both callers pass the same
  // profileId around the same time, so this dedupes to one in-flight pull
  // instead of two, rather than requiring the callers to coordinate a shared
  // promise reference themselves.
  async hydrateCriticalHome(profileId = ProfileManager.getActiveProfileId()) {
    const resolvedProfileId = normalizeProfileId(profileId);
    if (
      pendingCriticalHydration &&
      pendingCriticalHydration.generation === lifecycleGeneration &&
      pendingCriticalHydration.profileId === resolvedProfileId
    ) {
      return pendingCriticalHydration.promise;
    }
    const promise = hydrateCriticalHomeUncached(resolvedProfileId);
    pendingCriticalHydration = { profileId: resolvedProfileId, generation: lifecycleGeneration, promise };
    promise.finally(() => {
      if (pendingCriticalHydration?.promise === promise) {
        pendingCriticalHydration = null;
      }
    });
    return promise;
  },

  async requestSyncNow({ pushAfterPull = false, criticalHydration = null } = {}) {
    if (!this.started || this.inFlight) {
      if (this.started && this.inFlight) this.syncRequestedWhileInFlight = true;
      return false;
    }
    const generation = lifecycleGeneration;
    this.inFlight = true;
    try {
      const includeProfileScoped = this.profileScopedSyncEnabled;
      const pullResults = await this.syncPull({ includeProfileScoped, criticalHydration });
      if (generation !== lifecycleGeneration || !this.started) return false;
      if (pushAfterPull && includeProfileScoped) {
        await this.syncPush(pullResults);
      }
      return generation === lifecycleGeneration && this.started;
    } finally {
      if (generation === lifecycleGeneration) {
        this.inFlight = false;
        if (this.syncRequestedWhileInFlight && this.started) {
          this.syncRequestedWhileInFlight = false;
          void this.requestSyncNow({ pushAfterPull: false });
        }
      }
    }
  },

  async syncPull({
    includeProfileScoped = this.profileScopedSyncEnabled,
    criticalHydration = null
  } = {}) {
    if (!AuthManager.isAuthenticated) {
      return {};
    }
    const generation = lifecycleGeneration;
    const pullResults = {};
    const syncStartedAt = syncNow();
    const activeProfileId = ProfileManager.getActiveProfileId();
    for (let attempt = 1; attempt <= MAX_PULL_ATTEMPTS; attempt += 1) {
      if (generation !== lifecycleGeneration) return pullResults;
      try {
        const critical =
          criticalHydration?.current &&
          normalizeProfileId(criticalHydration.profileId) === normalizeProfileId(activeProfileId)
            ? criticalHydration
            : await this.hydrateCriticalHome(activeProfileId);
        if (generation !== lifecycleGeneration || !critical.current || !isActiveProfile(activeProfileId)) {
          return pullResults;
        }
        pullResults.addons = critical.addons;

        // Every background branch starts now. SIMKL retains its credential →
        // refresh dependency inside its own branch, so it cannot delay
        // collections, library, watched/progress, plugins, or Home.
        const profilesTask = Promise.resolve().then(() => ProfileSyncService.pull()).then(async (profiles) => {
          logSyncTiming("background-profile-pull", syncStartedAt);
          const profileIds = await collectKnownProfileIds(profiles);
          await Promise.allSettled(
            profileIds
              .filter((profileId) => normalizeProfileId(profileId) !== normalizeProfileId(activeProfileId))
              .map((profileId) => ProfileSettingsSyncService.pull(profileId))
          );
          logSyncTiming("background-inactive-profile-settings-pull", syncStartedAt);
          return profiles;
        });
        const traktCredentialsTask = Promise.resolve().then(() =>
          TraktCredentialSyncService.pullFromRemote(activeProfileId)
        );
        const providerCredentialsTask = Promise.resolve().then(() =>
          ProviderCredentialSyncService.syncFromRemote(activeProfileId)
        );
        const simklTask = Promise.resolve().then(() =>
          SimklCredentialSyncService.pullFromRemote(activeProfileId)
        )
          .then(() => SimklSyncService.refresh())
          .catch((error) => {
            console.warn("Simkl automatic refresh failed", error);
            return false;
          })
          .finally(() => logSyncTiming("background-simkl-refresh", syncStartedAt));
        const watchedItemsTask = includeProfileScoped
          ? Promise.resolve().then(() => WatchedItemsSyncService.pull())
          : null;
        const scopedTasks = includeProfileScoped
          ? {
              collections: Promise.resolve().then(() => CollectionSyncService.pull(activeProfileId)),
              plugins: Promise.resolve().then(() => PluginSyncService.pull()),
              savedLibrary: Promise.resolve().then(() => SavedLibrarySyncService.pull(activeProfileId)),
              watchedItems: watchedItemsTask,
              // Both requests still go out together; only the progress merge
              // waits, because a completion made on another device arrives as a
              // watched record and as the absence of a progress row.
              watchProgress: Promise.resolve().then(() =>
                WatchProgressSyncService.pull({ watchedItemsReady: watchedItemsTask })
              )
            }
          : {};
        const settled = await Promise.allSettled([
          profilesTask,
          traktCredentialsTask,
          providerCredentialsTask,
          simklTask,
          ...Object.values(scopedTasks)
        ]);
        logSyncTiming("background-domains-settled", syncStartedAt);
        if (generation !== lifecycleGeneration || !isActiveProfile(activeProfileId)) {
          return pullResults;
        }
        if (includeProfileScoped) {
          const offset = 4;
          pullResults.collections = settledValue(settled[offset], null);
          pullResults.plugins = settledValue(settled[offset + 1], null);
        }
        if (succeeded(pullResults.addons) && LibrarySyncService.hasPendingLocalMutation()) {
          this.scheduleAddonPush();
        }
        if (
          succeeded(pullResults.collections) &&
          CollectionSyncService.hasPendingLocalMutation(activeProfileId)
        ) {
          CollectionSyncService.triggerPush(activeProfileId);
        }
        if (succeeded(pullResults.plugins) && PluginSyncService.hasPendingLocalMutation()) {
          void PluginSyncService.push({ automatic: true });
        }
        logSyncTiming("background-profile-scoped-pull", syncStartedAt);
        return pullResults;
      } catch (error) {
        if (generation !== lifecycleGeneration) return pullResults;
        console.warn(`Startup sync pull failed (attempt ${attempt}/${MAX_PULL_ATTEMPTS})`, error);
        if (attempt < MAX_PULL_ATTEMPTS) {
          await sleep(3000);
        }
      }
    }
    return pullResults;
  },

  async syncPush(pullResults = {}) {
    const generation = lifecycleGeneration;
    if (!AuthManager.isAuthenticated) {
      return;
    }
    try {
      const allow = (result) =>
        result?.result === SyncPullResult.SUCCESS_WITH_DATA ||
        result?.result === SyncPullResult.SUCCESS_EMPTY;
      if (allow(pullResults.collections)) {
        await CollectionSyncService.push(null, { automatic: true });
      }
      if (generation !== lifecycleGeneration || !AuthManager.isAuthenticated) return;
      if (allow(pullResults.plugins)) {
        await PluginSyncService.push({ automatic: true });
      }
      if (generation !== lifecycleGeneration || !AuthManager.isAuthenticated) return;
      if (allow(pullResults.addons)) {
        await LibrarySyncService.push({ automatic: true });
      }
    } catch (error) {
      console.warn("Startup sync push failed", error);
    }
  },

  async syncCycle() {
    return this.requestSyncNow({ pushAfterPull: true });
  },

  scheduleAddonPush() {
    void this.requestAddonSync();
  },

  requestAddonSync() {
    if (!this.started || !this.profileScopedSyncEnabled || !AuthManager.isAuthenticated) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      this.addonSyncWaiters.push(resolve);
      if (this.addonSyncInFlight) {
        this.addonSyncPending = true;
        return;
      }
      if (this.addonPushTimer) {
        clearTimeout(this.addonPushTimer);
      }
      this.addonPushTimer = setTimeout(() => {
        this.addonPushTimer = null;
        void this.flushAddonSync();
      }, ADDON_PUSH_DEBOUNCE_MS);
    });
  },

  async flushAddonSync() {
    if (this.addonSyncInFlight) {
      this.addonSyncPending = true;
      return this.addonSyncInFlight;
    }
    if (!this.started || !this.profileScopedSyncEnabled) {
      return false;
    }
    const generation = lifecycleGeneration;
    const run = async () => {
      let synced = true;
      do {
        this.addonSyncPending = false;
        try {
          synced = (await LibrarySyncService.push()) && synced;
        } catch (error) {
          if (generation !== lifecycleGeneration) return false;
          console.warn("Addon auto push failed", error);
          synced = false;
        }
        if (generation !== lifecycleGeneration) return false;
      } while (this.addonSyncPending);

      this.addonSyncWaiters.splice(0).forEach((resolve) => resolve(synced));
      return synced;
    };
    const task = run();
    this.addonSyncInFlight = task;
    try {
      return await task;
    } finally {
      if (this.addonSyncInFlight === task) {
        this.addonSyncInFlight = null;
        if (this.addonSyncPending && generation === lifecycleGeneration && this.started) {
          void this.flushAddonSync();
        }
      }
    }
  }
};
