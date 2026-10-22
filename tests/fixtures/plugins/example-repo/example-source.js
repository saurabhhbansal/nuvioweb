// Original fixture scraper for NuvioWeb tests. It reads a page from the
// fixture host, parses it with the cheerio shim, signs each link with
// crypto-js and returns Nuvio plugin stream objects.
const cheerio = require("cheerio-without-node-native");
const CryptoJS = require("crypto-js");

const FIXTURE_HOST = "https://media.example.invalid";

async function getStreams(tmdbId, mediaType, season, episode) {
  const path = mediaType === "tv" ? `/tv/${tmdbId}/${season}/${episode}` : `/movie/${tmdbId}`;
  const response = await fetch(`${FIXTURE_HOST}${path}`, { headers: { Referer: `${FIXTURE_HOST}/` } });
  const $ = cheerio.load(await response.text());
  const streams = [];
  $("source[data-quality]").each((_, element) => {
    const url = $(element).attr("src");
    const signature = CryptoJS.MD5(url).toString().slice(0, 8);
    streams.push({
      name: "Example Source",
      title: `${$(element).attr("data-label")} (${signature})`,
      url,
      quality: $(element).attr("data-quality"),
      size: $(element).attr("data-size"),
      headers: $(element).attr("data-referer") ? { Referer: $(element).attr("data-referer") } : undefined
    });
  });
  return streams;
}

module.exports = { getStreams };
