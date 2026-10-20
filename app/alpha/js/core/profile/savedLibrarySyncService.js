import { AuthManager } from "../auth/authManager.js";
import { SupabaseApi } from "../../data/remote/supabase/supabaseApi.js";
import { savedLibraryRepository } from "../../data/repository/savedLibraryRepository.js";
import { ProfileManager } from "./profileManager.js";

const PULL_RPC = "sync_pull_library";
const PUSH_RPC = "sync_push_library";
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
    genres: Array.isArray(item.genres) ? item.genres : [],
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
      console.warn("Saved library sync pull failed", error);
      return [];
    }
  },

  async push(profileId = null) {
    try {
      if (!AuthManager.isAuthenticated) {
        return false;
      }
      const sessionGeneration = AuthManager.getSessionGeneration();
      const resolvedProfileId = resolveProfileId(profileId);
      const revision = savedLibraryRepository.getSyncState(resolvedProfileId).revision;
      // The cloud RPC is a full replacement. Reading only the first 1000 items
      // would silently drop item 1001 from the next snapshot, so refuse instead
      // and leave the pending revision intact for a later explicit action.
      const items = await savedLibraryRepository.getAll(1001, resolvedProfileId);
      if (!AuthManager.isSessionCurrent(sessionGeneration)) return false;
      if (items.length > 1000) {
        console.warn("Saved library sync push refused: local snapshot exceeds 1000 items");
        return false;
      }
      // An explicit final-item removal is an intentionally empty snapshot.
      await SupabaseApi.rpc(
        PUSH_RPC,
        {
          p_profile_id: resolvedProfileId,
          p_items: items.map((item) => toRemoteItem(item))
        },
        true,
        { expectedSessionGeneration: sessionGeneration }
      );
      if (!AuthManager.isSessionCurrent(sessionGeneration)) return false;
      savedLibraryRepository.acknowledgeSync(resolvedProfileId, revision);
      return true;
    } catch (error) {
      console.warn("Saved library sync push failed", error);
      return false;
    }
  }
};
