import { AuthManager } from "../auth/authManager.js";
import { SupabaseApi } from "../../data/remote/supabase/supabaseApi.js";
import { savedLibraryRepository } from "../../data/repository/savedLibraryRepository.js";
import { ProfileManager } from "./profileManager.js";
import { LIBRARY_ITEM_LIMIT } from "../../data/local/savedLibraryStore.js";

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
  // Sends waiting changes, then replaces local data with the cloud list and
  // re-applies anything the cloud has not confirmed yet.
  async pull(profileId = null) {
    try {
      if (!AuthManager.isAuthenticated) return [];
      const sessionGeneration = AuthManager.getSessionGeneration();
      const resolvedProfileId = resolveProfileId(profileId);
      await savedLibraryRepository.flushAll();
      return await savedLibraryRepository.withSyncLock(resolvedProfileId, async () => {
        const rows = [];
        while (rows.length < LIBRARY_ITEM_LIMIT) {
          const page = await SupabaseApi.rpc(
            PULL_RPC,
            { p_profile_id: resolvedProfileId, p_limit: PULL_PAGE_SIZE, p_offset: rows.length },
            true,
            { expectedSessionGeneration: sessionGeneration }
          );
          if (!AuthManager.isSessionCurrent(sessionGeneration)) return [];
          if (!Array.isArray(page)) throw new Error("Invalid Library snapshot");
          rows.push(...page);
          if (page.length < PULL_PAGE_SIZE) break;
        }
        const remoteItems = rows.map((row) => mapRemoteItem(row)).filter((item) => item.contentId);
        return savedLibraryRepository.applyRemote(remoteItems, resolvedProfileId);
      });
    } catch {
      console.warn("Saved library sync pull failed");
      return [];
    }
  },

  // Sends outbox operations: saves in one upsert, removals in one exact-key
  // delete. onSent runs for each operation the cloud confirmed.
  async push(profileId = null, ops = [], { onSent = () => {} } = {}) {
    try {
      if (!AuthManager.isAuthenticated) return false;
      const sessionGeneration = AuthManager.getSessionGeneration();
      const resolvedProfileId = resolveProfileId(profileId);
      const valid = (Array.isArray(ops) ? ops : []).filter((op) => typeof op?.item?.contentId === "string" && op.item.contentId.trim());
      const saves = valid.filter((op) => op.kind !== "remove");
      const removes = valid.filter((op) => op.kind === "remove");
      const requests = [
        saves.length && { ops: saves, rpc: UPSERT_RPC, body: { p_profile_id: resolvedProfileId, p_items: saves.map((op) => toRemoteItem(op.item)) } },
        removes.length && { ops: removes, rpc: DELETE_RPC, body: { p_profile_id: resolvedProfileId, p_keys: removes.map((op) => ({ content_id: op.item.contentId, content_type: op.item.contentType || "movie" })) } }
      ].filter(Boolean);
      for (const { ops: sent, rpc, body } of requests) {
        if (!AuthManager.isSessionCurrent(sessionGeneration)) return false;
        await SupabaseApi.rpc(rpc, body, true, { expectedSessionGeneration: sessionGeneration });
        if (!AuthManager.isSessionCurrent(sessionGeneration)) return false;
        sent.forEach((op) => onSent(op));
      }
      return true;
    } catch {
      // No account or item data in diagnostics. Unsent operations stay in the
      // outbox and are retried later.
      console.warn("Saved library sync push failed");
      return false;
    }
  }
};
