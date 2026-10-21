import test from "node:test";
import assert from "node:assert/strict";
import {
  assessBrowserExternalHandoff,
  buildAndroidVlcLaunchUrl,
  buildBrowserExternalPlayerLaunch,
  buildBrowserExternalPlaylist,
  copyBrowserExternalStreamLink,
  downloadBrowserExternalPlaylist,
  isTransferableExternalMediaUrl,
  launchBrowserExternalPlayer,
  prepareBrowserExternalPlaybackLaunch
} from "./browserExternalPlayer.js";

const mediaUrl = "https://media.example:8443/a%2Fb.mkv?signature=a%2Fb%2Bz&expires=123&part=2";

for (const name of ["Authorization", "Cookie", "Referer", "Origin", "User-Agent", "X-Canary"]) {
  test(`${name} requirement blocks every URL-only export before side effects`, async () => {
    let writes = 0;
    const source = { raw: { behaviorHints: { proxyHeaders: { request: { [name]: "disposable-canary" } } } } };
    const context = { mediaUrl, source };
    const runtime = { navigator: { clipboard: { writeText: () => { writes++; } } }, localStorage: { setItem: () => { writes++; } } };
    assert.equal(assessBrowserExternalHandoff(context).allowed, false);
    for (const [platform, player] of [["ios", "infuse"], ["ios", "vlc"], ["android", "vlc"]]) {
      assert.equal(buildBrowserExternalPlayerLaunch({ ...context, platform, player }), null);
      assert.equal(prepareBrowserExternalPlaybackLaunch({ ...context, platform, player, runtime }), null);
    }
    assert.equal(buildBrowserExternalPlaylist(context), "");
    assert.equal(downloadBrowserExternalPlaylist({ ...context, runtime }), false);
    assert.equal(await copyBrowserExternalStreamLink({ ...context, runtime }), false);
    assert.equal(writes, 0);
    assert.equal(JSON.stringify(assessBrowserExternalHandoff(context)).includes("disposable-canary"), false);
  });
}

test("top-level, normalized, raw, subtitle and malformed requirement maps fail closed", () => {
  for (const source of [
    { headers: { "X-Empty": "" } }, { requestHeaders: { Referer: "canary" } },
    { proxyHeaders: { request: { Origin: "canary" } } },
    { behaviorHints: { proxyHeaders: { request: { Cookie: "canary" } } } },
    { raw: { headers: { Authorization: "canary" } } },
    { sourceDescriptor: { requiredHeaderCount: 1 } }, { requiredHeaderCount: 2 },
    { headers: "malformed" }, { headers: ["malformed"] },
    { behaviorHints: { notWebReady: true } }
  ]) {
    assert.equal(assessBrowserExternalHandoff({ mediaUrl, source }).allowed, false);
    assert.equal(assessBrowserExternalHandoff({ mediaUrl, subtitle: source }).allowed, false);
  }
  assert.equal(assessBrowserExternalHandoff({ mediaUrl, source: { headers: {} } }).allowed, true);
});

test("signed media URL bytes survive iOS, Android and inert playlist without credentials or directives", () => {
  const infuse = buildBrowserExternalPlayerLaunch({ player: "infuse", platform: "ios", mediaUrl });
  assert.equal(new URL(infuse.href).searchParams.get("url"), mediaUrl);
  const intent = buildAndroidVlcLaunchUrl({ mediaUrl });
  assert.equal(intent.slice(0, intent.indexOf("#Intent")), mediaUrl.replace(/^https:/, "intent:"));
  assert.match(intent, /package=org\.videolan\.vlc;action=android\.intent\.action\.VIEW;/);
  assert.equal(buildBrowserExternalPlaylist({ mediaUrl, title: "\n#EXTVLCOPT:http-header=secret" }), `#EXTM3U\n${mediaUrl}\n`);
});

test("extensionless Android media includes MIME type to match VLC's browsable HTTP filter", () => {
  const intent = buildAndroidVlcLaunchUrl({ mediaUrl: "https://media.example:8443/stream?signature=disposable" });
  assert.match(intent, /action=android\.intent\.action\.VIEW;type=video\/\*;/);
});

test("Android URL fragments cannot change intent package or action", () => {
  const intent = buildAndroidVlcLaunchUrl({ mediaUrl: `${mediaUrl}#Intent;package=evil.app;end` });
  assert.equal(intent.split("#Intent").length, 2);
  assert.match(intent, /%23Intent;package=evil\.app;end#Intent;scheme=https;package=org\.videolan\.vlc;/);
});

test("playlist/credential/control injection and local schemes are rejected", () => {
  for (const value of [
    "https://user:password@media.example/a", "https://media.example/a\n#EXTVLCOPT:option=1",
    "https://media.example/a\r\nhttps://evil.example/b", "https://media.example/a\u0000",
    " https://media.example/a", "https://media.example/a b", "blob:https://media.example/a",
    "javascript:alert(1)", "file:///tmp/a", "magnet:?xt=abc"
  ]) {
    assert.equal(isTransferableExternalMediaUrl(value), false);
    assert.equal(buildBrowserExternalPlaylist({ mediaUrl: value }), "");
  }
  assert.equal(assessBrowserExternalHandoff({ mediaUrl, subtitleUrl: "file:///tmp/sub.srt" }).allowed, false);
});

test("clipboard missing, denied, or fallback failure is not reported as copied", async () => {
  assert.equal(await copyBrowserExternalStreamLink({ mediaUrl, runtime: {} }), false);
  assert.equal(await copyBrowserExternalStreamLink({ mediaUrl, runtime: { navigator: { clipboard: { writeText: async () => { throw new Error("denied"); } } } } }), false);
  let removed = false;
  const input = { style: {}, setAttribute() {}, select() {}, remove() { removed = true; } };
  const runtime = { document: { body: { appendChild() {} }, createElement: () => input, execCommand: () => false } };
  assert.equal(await copyBrowserExternalStreamLink({ mediaUrl, runtime }), false);
  assert.equal(removed, true);
  runtime.document.execCommand = () => true;
  assert.equal(await copyBrowserExternalStreamLink({ mediaUrl, runtime }), true);
  assert.equal(input.value, mediaUrl);
});

test("playlist delivery uses a fixed filename and releases its local object URL", () => {
  const observed = [];
  const anchor = { click() { observed.push("click"); }, remove() { observed.push("remove"); } };
  let blob;
  const runtime = {
    Blob,
    document: { body: { appendChild() {} }, createElement: () => anchor },
    URL: { createObjectURL(value) { blob = value; return "blob:local-only"; }, revokeObjectURL(value) { observed.push(value); } },
    setTimeout(callback) { callback(); }
  };
  assert.equal(downloadBrowserExternalPlaylist({ runtime, mediaUrl }), true);
  assert.equal(anchor.download, "nuvio-stream.m3u");
  assert.equal(blob.type, "audio/x-mpegurl");
  assert.deepEqual(observed, ["click", "remove", "blob:local-only"]);
});

test("immediate native navigation errors are handled without claiming playback", () => {
  assert.equal(launchBrowserExternalPlayer({ runtime: { location: { assign() { throw new Error("denied"); } } }, href: "infuse://x-callback-url/play" }), false);
});
