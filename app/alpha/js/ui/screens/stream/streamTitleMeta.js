// Title fields for the stream route, taken from add-on meta. The detail screen
// passes these in when it opens the list; a reload or shared link does not, so
// the stream screen rebuilds them from the same meta the detail screen reads.
// Only fields still missing from `params` are filled in.

function text(value) {
  return String(value ?? "").trim();
}

function findEpisode(videos, params) {
  if (!Array.isArray(videos) || !videos.length) {
    return null;
  }
  const videoId = text(params?.videoId);
  if (videoId) {
    const byId = videos.find((video) => text(video?.id) === videoId);
    if (byId) {
      return byId;
    }
  }
  const season = params?.season == null ? null : Number(params.season);
  const episode = params?.episode == null ? null : Number(params.episode);
  if (season == null || episode == null) {
    return null;
  }
  return (
    videos.find(
      (video) =>
        Number(video?.season) === season && Number(video?.episode ?? video?.number) === episode
    ) || null
  );
}

export function buildStreamTitleParams(meta, params = {}) {
  if (!meta || typeof meta !== "object") {
    return {};
  }
  const next = {};
  const fill = (key, value) => {
    if (!text(params?.[key]) && text(value)) {
      next[key] = value;
    }
  };
  fill("itemTitle", text(meta.name));
  fill("logo", meta.logo || "");
  fill("backdrop", meta.background || meta.landscapePoster || meta.poster || "");
  fill("poster", meta.poster || "");
  fill("year", text(meta.releaseInfo).match(/\b(19|20)\d{2}\b/)?.[0] || "");

  const isSeries = text(params?.itemType).toLowerCase() === "series";
  if (isSeries) {
    const video = findEpisode(meta.videos, params);
    if (video) {
      fill("episodeTitle", text(video.title || video.name));
      if (params?.season == null && video.season != null) next.season = Number(video.season);
      const number = video.episode ?? video.number;
      if (params?.episode == null && number != null) next.episode = Number(number);
    }
  } else if (Array.isArray(meta.genres)) {
    fill("genres", meta.genres.slice(0, 3).join(" • "));
  }
  return next;
}
