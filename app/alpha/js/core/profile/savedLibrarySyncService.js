import { AuthManager } from "../auth/authManager.js";
import { SupabaseApi } from "../../data/remote/supabase/supabaseApi.js";
import { savedLibraryRepository } from "../../data/repository/savedLibraryRepository.js";
import { ProfileManager } from "./profileManager.js";

const PULL_RPC = "sync_pull_library";
const UPSERT_RPC = "sync_push_library_items";
const DELETE_RPC = "sync_delete_library_items";
const PULL_PAGE_SIZE = 500;
const VALID_POSTER_SHAPES = new Set(["POSTER", "LANDSCAPE", "SQUARE"]);

function normalizePosterShape(value) {
  const shape = String(value || "")
    .trim()
    .toUpperCase();
  return VALID_POSTER_SHAPES.has(shape) ? shape : "POSTER";
}

function resolveProfileId(profileId = null) {
  const raw = Number(profileId ?? ProfileManager.getActiveProfileId() ?? 1);
  if (Number.isFinite(raw) && raw > 0) {
    return Math.trunc(raw);
  }
  return 1;
}

function mapRemoteItem(row = {}) {
  const contentId = row.content_id || row.contentId || row.id || "";
  const updatedAtRaw =
    row.added_at ||
    row.addedAt ||
    row.updated_at ||
    row.updatedAt ||
    row.created_at ||
    row.createdAt ||
    null;
  const updatedAt = Number(updatedAtRaw);
  return {
    contentId,
    contentType: row.content_type || row.contentType || "movie",
    title: row.name || row.title || "Untitled",
    poster: row.poster || null,
    posterShape: normalizePosterShape(row.poster_shape || row.posterShape),
    background: row.background || null,
    description: row.description || "",
    releaseInfo: row.release_info || row.releaseInfo || "",
    imdbRating: row.imdb_rating ?? row.imdbRating ?? null,
    genres: Array.isArray(row.genres) ? row.genres : [],
    addonBaseUrl: row.addon_base_url || row.addonBaseUrl || null,
    updatedAt: Number.isFinite(updatedAt) ? updatedAt : Date.now()
  };
}

function toRemoteItem(item = {}) {
  return {
    content_id: item.contentId,
    content_type: item.contentType || "movie",
    name: item.title || item.name || "Untitled",
    poster: item.poster || null,
    poster_shape: normalizePosterShape(item.posterShape || item.poster_shape),
    background: item.background || null,
    description: item.description || "",
    release_info: item.releaseInfo || "",
    imdb_rating: item.imdbRating == null ? null : Number(item.imdbRating),
    genres: Array.isArray(item.genres) ? [...item.genres] : [],
    addon_base_url: item.addonBaseUrl || null,
    added_at: Number(item.updatedAt || item.addedAt || Date.now())
  };
}

export const SavedLibrarySyncService = {
  async pull(profileId = null) {
    try {
      if (!AuthManager.isAuthenticated) {
        return [];
      }
      const sessionGeneration = AuthManager.getSessionGeneration();
      const resolvedProfileId = resolveProfileId(profileId);
      const initialState = savedLibraryRepository.getSyncState(resolvedProfileId);
      const revision = initialState.revision;
      const rows = [];
      for (let offset = 0; ; offset += PULL_PAGE_SIZE) {
        const page = await SupabaseApi.rpc(
          PULL_RPC,
          {
            p_profile_id: resolvedProfileId,
            p_limit: PULL_PAGE_SIZE,
            p_offset: offset
          },
          true,
          { expectedSessionGeneration: sessionGeneration }
        );
        if (!AuthManager.isSessionCurrent(sessionGeneration)) return [];
        if (!Array.isArray(page) || page.some((row) => {
          const id = row?.content_id || row?.contentId || row?.id;
          return typeof id !== "string" || !id.trim();
        })) throw new Error("Invalid Library snapshot");
        rows.push(...page);
        if (page.length < PULL_PAGE_SIZE) {
          break;
        }
      }
      const remoteItems = (rows || [])
        .map((row) => mapRemoteItem(row))
        .filter((item) => Boolean(item.contentId));
      if (!AuthManager.isSessionCurrent(sessionGeneration)) return [];
      const current = savedLibraryRepository.getSyncState(resolvedProfileId);
      if (initialState.pending || current.pending || current.revision !== revision) {
        const localItems = await savedLibraryRepository.getAll(1000, resolvedProfileId);
        return AuthManager.isSessionCurrent(sessionGeneration) ? localItems : [];
      }
      // Validation and the repository's synchronous store write have no await
      // between them, so a newer local edit cannot slip into this publication.
      await savedLibraryRepository.replaceAll(remoteItems, resolvedProfileId);
      return remoteItems;
    } catch (error) {
      console.warn("Saved library sync pull failed");
      return [];
    }
  },

  async push(profileId = null, changes = null, { revision = null, acknowledge = false } = {}) {
    try {
      if (!AuthManager.isAuthenticated) return false;
      // An unknown pending/legacy snapshot has no safe deletion intent. Never
      // fall back to full replacement, even when the per-item API is absent.
      if (!Array.isArray(changes) || !changes.length || changes.some(change =>
        !["save", "remove"].includes(change?.kind) ||
        typeof change?.item?.contentId !== "string" || !change.item.contentId.trim() ||
        !["movie", "series"].includes(change.item.contentType)
      )) return false;
      const sessionGeneration = AuthManager.getSessionGeneration();
      const resolvedProfileId = resolveProfileId(profileId);
      // Copy every request before awaiting. The caller's later edits cannot
      // change an issued operation or leak a different account's snapshot.
      const requests = changes.map(change => ({
        rpc: change.kind === "save" ? UPSERT_RPC : DELETE_RPC,
        body: change.kind === "save"
          ? { p_profile_id: resolvedProfileId, p_items: [toRemoteItem(change.item)] }
          : { p_profile_id: resolvedProfileId, p_keys: [{ content_id: change.item.contentId, content_type: change.item.contentType }] }
      }));
      for (const { rpc, body } of requests) {
        if (!AuthManager.isSessionCurrent(sessionGeneration)) return false;
        await SupabaseApi.rpc(rpc, body, true, { expectedSessionGeneration: sessionGeneration });
        if (!AuthManager.isSessionCurrent(sessionGeneration)) return false;
      }
      if (acknowledge && Number.isSafeInteger(revision)) savedLibraryRepository.acknowledgeSync(resolvedProfileId, revision);
      return true;
    } catch {
      // No provider/account payloads in diagnostics. Failed explicit operations
      // remain pending locally; already-issued remote calls cannot be undone.
      console.warn("Saved library explicit sync failed");
      return false;
    }
  }
};
