import test from "node:test";
import assert from "node:assert/strict";
import {
  buildAndroidChooserLaunchUrl,
  buildAndroidIntentUrl,
  buildAndroidVlcLaunchUrl,
  buildBrowserExternalPlayerLaunch,
  getBrowserExternalPlayerPreference,
  getBrowserExternalPlayerStoreUrl,
  migrateBrowserExternalPlayerPreference,
  prepareBrowserExternalPlaybackLaunch
} from "./browserExternalPlayer.js";

const mediaUrl = "https://media.example:8443/a%20b/video.mkv?sig=x%2Fy&part=2";

function parseIntent(href) {
  const match = /^intent:(.*)#Intent;(.*);end$/.exec(href);
  assert.ok(match, `not an intent URL: ${href}`);
  const fields = Object.fromEntries(match[2].split(";").map((field) => {
    const index = field.indexOf("=");
    return [field.slice(0, index), field.slice(index + 1)];
  }));
  return { data: match[1], fields };
}

test("Android chooser intent has no package, so the system Open with sheet appears", () => {
  const { data, fields } = parseIntent(buildAndroidChooserLaunchUrl({ mediaUrl, title: "Big Buck Bunny" }));
  assert.equal(`${fields.scheme}:${data}`, mediaUrl);
  assert.equal(fields.package, undefined);
  assert.equal(fields.action, "android.intent.action.VIEW");
  assert.equal(fields.type, "video/*");
  assert.equal(decodeURIComponent(fields["S.title"]), "Big Buck Bunny");
  assert.equal(fields["S.browser_fallback_url"], undefined);
});

test("intent title is percent-encoded so it cannot add or end Intent fields", () => {
  const title = "Part 1; package=evil.app;end #Intent ü & 100%";
  const href = buildAndroidChooserLaunchUrl({ mediaUrl, title });
  const { fields } = parseIntent(href);
  assert.equal(fields.package, undefined);
  assert.equal(decodeURIComponent(fields["S.title"]), title);
  assert.doesNotMatch(fields["S.title"], /[;#= ]/);
  assert.equal(href.split("#Intent;").length, 2);
});

test("blank titles are omitted and http keeps its own scheme", () => {
  const { data, fields } = parseIntent(buildAndroidIntentUrl({ mediaUrl: "http://media.example/v.mp4", title: "  " }));
  assert.equal(fields.scheme, "http");
  assert.equal(data, "//media.example/v.mp4");
  assert.equal(fields["S.title"], undefined);
});

test("Android VLC intent keeps its package and store fallback", () => {
  const { fields } = parseIntent(buildAndroidVlcLaunchUrl({ mediaUrl, title: "Clip" }));
  assert.equal(fields.package, "org.videolan.vlc");
  assert.match(decodeURIComponent(fields["S.browser_fallback_url"]), /^https:\/\/play\.google\.com\//);
  assert.equal(fields["S.title"], "Clip");
});

test("Android intents reject fragments and non-HTTP URLs", () => {
  assert.equal(buildAndroidChooserLaunchUrl({ mediaUrl: "https://media.example/v.mp4#t=1" }), "");
  assert.equal(buildAndroidChooserLaunchUrl({ mediaUrl: "file:///sdcard/v.mp4" }), "");
});

test("chooser launches only on Android and carries no store link", () => {
  const launch = buildBrowserExternalPlayerLaunch({ player: "chooser", platform: "android", mediaUrl, title: "T" });
  assert.match(launch.href, /^intent:/);
  assert.doesNotMatch(launch.href, /package=/);
  assert.equal(buildBrowserExternalPlayerLaunch({ player: "chooser", platform: "ios", mediaUrl }), null);
  assert.equal(getBrowserExternalPlayerStoreUrl({ player: "chooser", platform: "android" }), "");
  assert.equal(buildBrowserExternalPlayerLaunch({ player: "chooser", platform: "android", mediaUrl, requestHeaders: { Referer: "x" } }), null);
});

test("chooser hand-off prepares a manual-progress launch", () => {
  const values = new Map();
  const runtime = {
    crypto: globalThis.crypto,
    location: { href: "https://nuvio.example/player" },
    localStorage: { getItem: (k) => values.get(k) || null, setItem: (k, v) => values.set(k, v), removeItem: (k) => values.delete(k) }
  };
  const prepared = prepareBrowserExternalPlaybackLaunch({ player: "chooser", platform: "android", mediaUrl, runtime, profileId: "1" });
  assert.match(prepared.launch.href, /^intent:/);
  assert.equal(prepared.automatic, false);
});

test("iOS preference migration restores Lenna/Outplayer and maps foreign ids to Lenna", () => {
  for (const id of ["lenna", "outplayer", "infuse", "vlc"]) assert.equal(migrateBrowserExternalPlayerPreference(id, "ios"), id);
  assert.equal(migrateBrowserExternalPlayerPreference(" Outplayer ", "ios"), "outplayer");
  assert.equal(migrateBrowserExternalPlayerPreference("chooser", "ios"), "lenna");
  assert.equal(migrateBrowserExternalPlayerPreference("nplayer", "ios"), "lenna");
  assert.equal(migrateBrowserExternalPlayerPreference("disabled", "ios"), "disabled");
  assert.equal(migrateBrowserExternalPlayerPreference("", "ios"), "disabled");
});

test("Android and desktop never turn an iPhone-only preference into an automatic hand-off", () => {
  assert.equal(migrateBrowserExternalPlayerPreference("lenna", "android"), "disabled");
  assert.equal(migrateBrowserExternalPlayerPreference("outplayer", "android"), "disabled");
  assert.equal(migrateBrowserExternalPlayerPreference("vlc", "android"), "vlc");
  assert.equal(migrateBrowserExternalPlayerPreference("chooser", "android"), "chooser");
  const windows = { navigator: { userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", platform: "Win32" } };
  assert.equal(migrateBrowserExternalPlayerPreference("lenna", "other", windows), "disabled");
  assert.equal(migrateBrowserExternalPlayerPreference("chooser", "other", windows), "disabled");
  // Desktop VLC is the playlist file, so a saved VLC choice is kept.
  assert.equal(migrateBrowserExternalPlayerPreference("vlc", "other", windows), "vlc");
  // A Mac-only player is not carried to Windows.
  assert.equal(migrateBrowserExternalPlayerPreference("iina", "other", windows), "disabled");
  const iphone = { navigator: { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)", platform: "iPhone", maxTouchPoints: 5 } };
  assert.equal(getBrowserExternalPlayerPreference("chooser", iphone), "lenna");
});
