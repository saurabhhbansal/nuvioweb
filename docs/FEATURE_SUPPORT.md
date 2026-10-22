# Feature support

Updated 2026-10-22. "Tested" means covered by automated tests in CI, mostly Chromium on Linux. Anything else is **unverified**. Real phones, Safari, Edge, HDR output and audible multitrack audio are unverified unless a line says otherwise.

## Status

| Feature | Status | Limits |
| --- | --- | --- |
| Sign in with Nuvio, refresh, sign out | Works; tested with mocks and fixtures. Startup survives server errors and retries when back online | QR sign-in unsupported (provider rejects the redirect). Natural token expiry on real accounts not observed |
| Profiles, library, watch progress sync | Works; Library changes queue in a saved outbox and retry on startup, reconnect and the sync cycle | Same-item edits on two devices: last write wins. No cross-tab coordination. See [sync policy](LIBRARY_SYNC_POLICY.md) |
| Guest mode | Works; tested | Data stays on this device |
| HTTP/Stremio add-ons | Install by URL, catalogs, details, sources, subtitles; tested with a fixture add-on | Each add-on must allow browser CORS |
| Source list | Keeps add-on order. A card shows at most one hint: "Needs headers" or "Link expired", from declared metadata. Every source stays selectable | No per-card playback prediction |
| Native video, HLS, DASH | Plays in Chromium; legal fixtures tested for play, pause, seek, resume and subtitles | Firefox/WebKit run on demand only. 4K, HDR and high-frame-rate output unverified |
| Failure explanations | Shown on playback failure; names the real cause when known (debrid, headers, HTTP status, format) | Unknown causes are labelled unknown. Optional details and diagnostics export contain no URLs or tokens |
| External player hand-off | Android: system "Open with" chooser or VLC. iPhone: Lenna, Outplayer, Infuse or VLC. Desktop: .m3u download or Copy link. Mobile launches unverified on real devices | Sources that need request headers are labelled "Needs headers" and cannot be handed off by URL |
| PWA install and offline shell | Installable; pinch-zoom allowed. Precaches the app shell and English (other languages cache when used). New versions show an "Update ready – Reload" prompt instead of reloading. Offline notice; saved Library stays visible offline. Tested in Chromium | Install and update unverified on a real iPhone or Android device. No manifest screenshots yet |
| JS plugins | Nuvio plugin repositories run in a browser Web Worker; per-scraper on/off; optional user proxy | Verified with an original fixture plugin only; real repos on desktop Chrome and iPhone are unverified. Sites that block browsers show "Needs proxy"; header-locked streams show "Needs headers". See [proxy decision](PLUGIN_PROXY_DECISION.md) |
| Links and reload | Home, Search, Library, Settings, a title and its source list have their own address (`#/detail/movie/tt…`). Reloading stays on the screen, a shared title link opens it after sign-in and profile choice, and Back works. Tested in Chromium | The address holds content IDs only, so a search term or the exact Settings section is not kept. The player reloads to its source list. Reload after iOS removes the app from memory unverified on a real iPhone |
| Supported browsers | Built for Chrome/Edge 100+ and Safari/iOS 15+. Screens load on first use; the shell, fonts and every screen are precached, so offline still opens them. Tested in Chromium | Older browsers show a start-up error screen instead of the app. Safari 15 and a real iPhone are unverified |
| Sidecar features (Trakt sign-in, debrid bridges, external-player return) | Off on the public preview; Settings explains why and hides external-player progress options | Need a server; not planned for the MVP |

## Browser limits users may hit

- **Required request headers.** Some sources only play when the player sends specific headers. Browsers cannot set them for media, and URL-only hand-off cannot pass them. Pick another source, or use a player that accepts headers.
- **MKV files.** Browsers cannot reliably open Matroska. Chromium sometimes plays MKV with common codecs; WebKit and Firefox often do not. Try an MP4/HLS source or an external player.
- **TrueHD, DTS and similar audio.** Browsers usually cannot decode these. Prefer a source with AAC, Opus or (where supported) AC-3/E-AC-3 audio, or use an external player.
- **HEVC and Dolby Vision.** Depends on browser, OS and hardware. The app asks the browser for an exact prediction; a positive answer is not a guarantee.
- **Works on laptop, fails on phone.** Different browser engines and decoders. Try another source or external player.
- **HTTP errors.** 401/403 means the host refused; 410 means gone; 416 means the host rejected a seek range. None of these is a codec problem.

## Not in scope

Server transcoding, media proxying, paid features and DRM content. See [PRD](PRD.md).
