# Feature support

Updated 2026-10-23. "Tested" means covered by automated tests in CI, mostly Chromium on Linux. Anything else is **unverified**. Real phones, Safari, Edge, HDR output and audible multitrack audio are unverified unless a line says otherwise.

## Status

| Feature | Status | Limits |
| --- | --- | --- |
| Sign in with Nuvio, refresh, sign out | Works; tested with mocks and fixtures. Startup survives server errors and retries when back online. QR sign-in shows a code for Nuvio's approval page and, on a computer, a link to open it; the QR start was checked against the live service | QR approval with a real account unverified. Natural token expiry on real accounts not observed |
| Profiles, library, watch progress sync | Works; Library changes queue in a saved outbox and retry on startup, reconnect and the sync cycle | Same-item edits on two devices: last write wins. No cross-tab coordination. See [sync policy](LIBRARY_SYNC_POLICY.md) |
| Guest mode | Works; tested | Data stays on this device |
| HTTP/Stremio add-ons | Install by URL, catalogs, details, sources, subtitles; tested with a fixture add-on | Each add-on must allow browser CORS |
| Source list | Keeps add-on order. A card shows at most one hint: "Needs headers" or "Link expired", from declared metadata. Every source stays selectable | No per-card playback prediction |
| Native video, HLS, DASH | Plays in Chromium; legal fixtures tested for play, pause, seek, resume and subtitles | Firefox/WebKit run on demand only. 4K, HDR and high-frame-rate output unverified |
| Audio track choice | The Audio button lists the source's audio tracks (languages, commentary) and switches them for HLS and DASH streams and for single files in browsers that expose their tracks (Safari, unverified). The choice is remembered per title for each profile. Tested with mocked track lists: unit tests for hls.js, dash.js and native lists, and the picker in Chromium with a mocked HLS list | Chromium and Firefox cannot list or switch the tracks inside a single MP4 or MKV file; the picker says so and suggests an external player. No multi-audio fixture yet, so a real switch and audible output are unverified |
| Failure explanations | Shown on playback failure; names the real cause when known (debrid, headers, HTTP status, format) | Unknown causes are labelled unknown. Optional details and diagnostics export contain no URLs or tokens |
| External player hand-off | Android: system "Open with" chooser or VLC. iPhone: Lenna, Outplayer, Infuse or VLC. Windows: VLC (playlist file), PotPlayer or Copy link. Mac: IINA, Infuse, VLC (playlist file) or Copy link. Other desktops: VLC (playlist file) or Copy link. App launches unverified on real devices | Sources that need request headers are labelled "Needs headers" and cannot be handed off by URL |
| PWA install and offline shell | Installable; pinch-zoom allowed. Precaches the app shell and English (other languages cache when used). New versions show an "Update ready – Reload" prompt instead of reloading. Offline notice; saved Library stays visible offline. Tested in Chromium | Install and update unverified on a real iPhone or Android device. No manifest screenshots yet |
| JS plugins | Nuvio plugin repositories run in a browser Web Worker; per-scraper on/off; optional user proxy. Tested in CI with an original fixture plugin; the owner checked real repositories on desktop Edge and iPhone | Sites that block browsers (CORS) show "Needs proxy" and need the user's own proxy; most plugins do. Header-locked streams show "Needs headers". See [proxy decision](PLUGIN_PROXY_DECISION.md) |
| Links and reload | Home, Search, Library, Settings, a title and its source list have their own address (`#/detail/movie/tt…`). Reloading stays on the screen, a shared title link opens it after sign-in and profile choice, and Back works. Tested in Chromium | The address holds content IDs only, so a search term or the exact Settings section is not kept. The player reloads to its source list. Reload after iOS removes the app from memory unverified on a real iPhone |
| Supported browsers | Built for Chrome/Edge 100+ and Safari/iOS 15+. Screens load on first use; the shell, fonts and every screen are precached, so offline still opens them. Tested in Chromium | Older browsers show a start-up error screen instead of the app. Safari 15 and a real iPhone are unverified |
| Trakt and Simkl | Sign-in runs in the browser with the site's public app ids (Trakt device code, Simkl PIN). Each device signs in for itself; the sign-in is not shared through the Nuvio account. Tested with mocks | On only where the deploy sets the app ids. Live sign-in unverified until the ids are registered |
| Sidecar features (debrid bridges, external-player return) | Off on the public site; Settings explains why and hides external-player progress options | Need a server. Static hosting has no server-side debrid bridge, and none is planned |
| Problem reports | No telemetry. Users open a GitHub issue; a source that fails to start offers "Export redacted diagnostics" (no URLs or tokens) to attach | App start-up errors and other screens have no export button |

## By platform

| Platform | What works | Unverified or limited |
| --- | --- | --- |
| Desktop Chrome and Edge | The features in the status table, within their limits. CI runs Chromium; the owner used plugins on Edge | Edge is not in CI. HEVC, Dolby Vision and MKV depend on the OS and hardware |
| iPhone Safari and the Home Screen app | The same app, built for Safari/iOS 15+. External hand-off offers Lenna, Outplayer, Infuse or VLC. The owner checked plugins with real repositories | Sign-in, playback, install, update, offline and app launches on a real iPhone are unverified until the release walkthrough. Safari 15 untested |
| Android Chrome | Same app as desktop Chrome; external hand-off through the system "Open with" chooser or VLC | Not yet tested on a real device: install, playback and hand-off are unverified until the release walkthrough |

## Known limits

- **No server-side debrid bridge.** The site is static, so debrid sign-in and resolving need a server we do not run. Sources that need one fail with an explanation.
- **Header-bound sources ("Needs headers").** Browsers cannot send custom headers with media requests, so these sources stay selectable but usually fail in the browser. The URL-only external hand-off cannot pass headers either, so it refuses them. Pick another source.
- **Plugins blocked by CORS** need a proxy the user runs and sets in Settings. The project runs none.
- **Codecs and containers.** See the browser limits below: HEVC, Dolby Vision, MKV, TrueHD and DTS often fail in browsers. Use an external player for those.
- **Modern browsers only.** The build targets Chrome/Edge 100+ and Safari/iOS 15+; older browsers show a start-up error screen.
- **Latin-only bundled font.** The self-hosted Inter font covers Latin scripts. Other scripts use the system font. The optional DM Sans and Open Sans themes load from Google Fonts when chosen.

## Browser limits users may hit

- **Required request headers.** Some sources only play when the player sends specific headers. Browsers cannot set them for media, and URL-only hand-off cannot pass them. Pick another source, or use a player that accepts headers.
- **MKV files.** Browsers cannot reliably open Matroska. Chromium sometimes plays MKV with common codecs; WebKit and Firefox often do not. Try an MP4/HLS source or an external player.
- **TrueHD, DTS and similar audio.** Browsers usually cannot decode these. Prefer a source with AAC, Opus or (where supported) AC-3/E-AC-3 audio, or use an external player.
- **HEVC and Dolby Vision.** Depends on browser, OS and hardware. The app asks the browser for an exact prediction; a positive answer is not a guarantee.
- **Works on laptop, fails on phone.** Different browser engines and decoders. Try another source or external player.
- **HTTP errors.** 401/403 means the host refused; 410 means gone; 416 means the host rejected a seek range. None of these is a codec problem.

## Not in scope

Server transcoding, media proxying, paid features and DRM content. See [PRD](PRD.md).
