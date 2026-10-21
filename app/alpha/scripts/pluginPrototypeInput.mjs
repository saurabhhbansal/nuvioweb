// Trusted caller input projection shared by the unshipped prototype seams.
// Never forward arbitrary account/session metadata or settings into guest code.
export function pluginMediaInput(input = {}) {
  const value = input && typeof input === "object" ? input : {};
  return {
    tmdbId: typeof value.tmdbId === "string" || Number.isSafeInteger(value.tmdbId) ? String(value.tmdbId).slice(0, 40) : "",
    mediaType: value.mediaType === "tv" ? "tv" : "movie",
    season: Number.isSafeInteger(value.season) && value.season > 0 ? value.season : null,
    episode: Number.isSafeInteger(value.episode) && value.episode > 0 ? value.episode : null
  };
}
