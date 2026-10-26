# Feature support

Updated 2026-10-26 for the first public beta. "Tested" means covered by automated tests in CI, mostly Chromium on Linux. Anything else is **unverified**. Real phones, Safari, Edge, HDR output and audible multitrack audio are unverified unless a line says otherwise.

## Status

| Feature | Status | Limits |
| --- | --- | --- |
| Sign in with Nuvio, refresh, sign out | Works; tested with mocks and fixtures. Startup survives server errors and retries when back online. QR sign-in shows a code for Nuvio's approval page and, on a computer, a link to open it; the QR start was checked against the live service | QR approval with a real account unverified. Natural token expiry on real accounts not observed |
| Profiles, library, watch progress sync | Works; Library changes queue in a saved outbox and retry on startup, reconnect and the sync cycle | Same-item edits on two devices: last write wins. No cross-tab coordination. See [sync policy](LIBRARY_SYNC_POLICY.md) |
| Guest mode | Works; tested | Data stays on this device |
| Create a Nuvio account | A Sign up button on the sign-in screen opens nuvio.tv's sign-up page in a new tab; tested in Chromium | nuvio.tv has no way to send people back here afterwards, so they return to this tab and sign in |
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
| Trakt and Simkl | Sign-in runs in the browser with the site's public app ids; no client secret. Trakt: Connect goes to trakt.tv and comes back to the site with a one-time code (PKCE). Simkl: a device code; open the link it shows and approve, and the app picks it up. Each device signs in for itself; the sign-in is not shared through the Nuvio account. Tested with mocks; the Simkl endpoints were checked against the live API | On only where the deploy sets the app ids. Trakt sends people back only to addresses listed exactly in the Trakt app's Redirect URIs, so Trakt sign-in fails on any other address, including per-deployment preview links. A full live sign-in on each service is unverified |
| Offline tracking ("Keep track") | **Experimental**, off by default. Trakt and Simkl writes that fail for lack of network are saved per profile and sent when the network returns; a finish keeps the time it was watched. Tested with mocks | Positions can still disagree between devices. A stopping point arrives with the time it was sent. A write the server applied before timing out can be replayed as a second play. Un-watching offline is not saved. Not tried against live Trakt or Simkl |
| Sidecar features (debrid bridges, external-player return) | Off on the public site; Settings explains why and hides external-player progress options | Need a server. Static hosting has no server-side debrid bridge, and none is planned |
| Problem reports | No analytics or error reporting (owner decision for the beta). Users open a GitHub issue; a source that fails to start offers "Export redacted diagnostics" (no URLs or tokens) to attach | App start-up errors and other screens have no export button |

## Account sync with the Nuvio apps

Signed in, these lists live on the Nuvio account and are shared with the Nuvio TV, mobile and desktop apps. The web app pulls them at start-up, on a profile switch and every 2 minutes, and pushes after a change made here. Tested with a fake account (two simulated devices), not against the live service.

| Item | Pulled | Pushed on | Account format |
| --- | --- | --- | --- |
| Add-ons | Yes | Add, remove, reorder, turn on/off | `sync_push_addons` rows: URL, name, on/off, order |
| Plugin repositories | Yes | Add, remove, turn on/off | `sync_push_plugins` rows: URL, name, on/off, order |
| Collections | Yes | Any edit | `sync_push_collections` blob, the native apps' JSON |
| Home catalog layout | Yes | Any change | `sync_push_home_catalog_settings`, shared namespace |
| App settings | Yes | Any change | `sync_push_profile_settings_blob`, `desktop` namespace |

Limits:

- **Each push replaces the whole list.** The account API has no merge. If two devices change the same list within one sync cycle, the later push wins.
- **App settings are shared with the desktop app only.** The account keeps one settings blob per app family. The web app writes the desktop one and never the TV or mobile one, which would overwrite their settings with keys they do not use. It reads the TV one once, to import settings on first use.
- **Plugin settings stay on this device.** Per-plugin on/off, each plugin's own settings and the proxy have no account field, and may hold tokens.
- **Plugin sync is outside the public API reference.** The `plugins` table and `sync_push_plugins` are what the native apps use, not part of the documented public API, so they may change without notice.
- **Only Nuvio plugin repositories run here.** Other repository kinds the native apps support stay in the account list but do not run in the browser.
- **One add-on name.** The account stores one name per add-on; the web app uses it as the display name.
- **Profiles that share the primary profile's add-ons or plugins** read and write profile 1's list.

## By platform

| Platform | What works | Unverified or limited |
| --- | --- | --- |
| Desktop Chrome and Edge | The features in the status table, within their limits. External hand-off: VLC (playlist file), PotPlayer (Windows), IINA or Infuse (Mac), or Copy link. CI runs Chromium; the owner checked sign-in, plugins and playback on Edge | Edge is not in CI. HEVC, Dolby Vision and MKV depend on the OS and hardware |
| Desktop Safari (Mac) | The same app, built for Safari 15+. External hand-off: IINA, Infuse, VLC (playlist file) or Copy link | Not in CI and not checked by hand: everything is unverified. Safari's WebKit engine runs in CI only on demand |
| iPhone Safari and the Home Screen app | The same app, built for Safari/iOS 15+. External hand-off offers Lenna, Outplayer, Infuse or VLC. The owner checked plugins with real repositories | Sign-in, playback, install, update, offline and app launches on a real iPhone are unverified until the release walkthrough. Safari 15 untested |
| Android Chrome | Same app as desktop Chrome; external hand-off through the system "Open with" chooser or VLC | Not yet tested on a real device: install, playback and hand-off are unverified until the release walkthrough |

## Known limits

- **No server-side debrid bridge.** The site is static, so debrid sign-in and resolving need a server we do not run. Sources that need one fail with an explanation.
- **Header-bound sources ("Needs headers").** Browsers cannot send custom headers with media requests, so these sources stay selectable but usually fail in the browser. The URL-only external hand-off cannot pass headers either, so it refuses them. Pick another source.
- **Plugins blocked by CORS** need a proxy the user runs and sets in Settings. The project runs none.
- **Trakt and Simkl sign-in.** Trakt only returns to the site's exact registered addresses (see [DEPLOY_PREVIEW](DEPLOY_PREVIEW.md#trakt-and-simkl-apps)); Simkl uses a device code. Sign-ins stay on each device. Offline tracking is Experimental.
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
