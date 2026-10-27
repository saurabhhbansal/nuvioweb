# NuvioWeb

**Your Nuvio account, in the browser.** Browse, keep your library and watch progress in sync, and play in the browser or hand off to an external player.

**Open it: [nuvioweb.xyz](https://nuvioweb.xyz)** · Current release: v0.1.0

NuvioWeb is a neutral client, like Stremio. It plays only what your own add-ons and plugins return. It ships no content and no sources.

## What you need

- **A Nuvio account.** Sign-in is required. No account yet? The sign-in screen has a **Sign up** button that opens nuvio.tv.
- **A modern browser:** Chrome or Edge 100+, or Safari / iOS 15+. Older browsers show a start-up error instead of the app.
- **Your own add-ons or plugins.** NuvioWeb comes empty. Catalogs, details, sources and subtitles all come from what you install.

## Getting started

1. **Open [nuvioweb.xyz](https://nuvioweb.xyz) and sign in** with your Nuvio account, by email or QR code.
2. **Pick a profile.** Library, watch progress, add-ons, plugin repositories, collections and home layout sync with your Nuvio account, so they match the Nuvio apps.
3. **Add your add-ons and plugins** in Settings. Add-ons install by URL (HTTP/Stremio-compatible). Plugin repositories install by URL too, and each scraper can be turned on or off.
4. **Play.** Pick a source and watch in the browser, or send it to an external player.
5. **Optional: connect Trakt or Simkl** in Settings, where the site offers them. Each device signs in on its own.

Some plugins are blocked by the browser (CORS) and show **"Needs proxy"**. They only work if you set the address of a proxy **you run yourself** in the plugin settings. NuvioWeb runs no proxy.

## Install it as an app

- **iPhone / iPad:** open the site in Safari → Share → **Add to Home Screen**.
- **Android:** Chrome menu → **Install app** (or Add to Home screen).
- **Desktop Chrome or Edge:** click the install icon in the address bar.

The installed app opens without the browser bar, keeps the app shell offline and shows your saved Library when you have no connection. New versions show an "Update ready" prompt.

## Features

- **Browse and search** catalogs from your add-ons, with title pages and source lists.
- **Sync with Nuvio:** profiles, Library, Continue Watching and progress, shared with the Nuvio TV, mobile and desktop apps.
- **Play in the browser:** regular video files, HLS and DASH, with subtitles. Switch audio tracks on HLS and DASH streams (and single files in Safari); your choice is remembered per title. Tracks the browser cannot play are marked Unsupported, and for single files in Chrome, Edge or Firefox the picker offers "Open in another player".
- **Clear errors:** when a source fails, the app says why when it knows (headers, HTTP status, format, debrid).
- **External players:** hand a source to another app (see below).
- **Trakt and Simkl:** send what you watch and your progress, where enabled.
- **Links that work:** titles have their own address, so reload, Back and shared links behave.

Browser support at a glance:

| Platform | Status |
| --- | --- |
| Desktop Chrome and Edge | Main target. Checked by hand on Edge; Chromium is tested automatically |
| iPhone Safari and Home Screen app | Supported (iOS 15+). Checked by hand on a real iPhone, including external players and progress |
| Android Chrome | Supported. Checked by hand on a real Android phone, including external players and progress |
| Desktop Safari (Mac) | Supported (Safari 15+); unverified |

Browsers cannot play everything. MKV files, TrueHD/DTS audio, HEVC and Dolby Vision often fail, and sources that need special request headers usually do. An external player is the fix for most of these. Full detail, including what is and isn't verified: **[Feature support](docs/FEATURE_SUPPORT.md)**.

## External players and progress

From a source, choose an external player:

- **Android:** the system "Open with" chooser, or VLC.
- **iPhone:** Lenna, Outplayer, Infuse or VLC.
- **Windows:** VLC (playlist file), PotPlayer, or Copy link.
- **Mac:** IINA, Infuse, VLC (playlist file), or Copy link.

When you come back, NuvioWeb asks whether you **finished** or **stopped at** a time, and saves that to Continue Watching, your Nuvio account and Trakt/Simkl. On iPhone with Infuse, Lenna, Outplayer or VLC, progress can come back **automatically** where the site has this enabled. Sources marked "Needs headers" can't be handed off by link.

## Privacy

- **No analytics, no tracking, no error reporting.**
- **Sign-in stays with Nuvio.** NuvioWeb has no account system or server of its own; you sign in with Nuvio directly. Your sign-in tokens stay in your browser and are never sent to add-ons, plugins or external players.
- **On your device:** your sign-in, app and plugin settings (including any proxy address or plugin token), Trakt/Simkl sign-ins, pending sync changes, and the offline app files. Plugin settings and Trakt/Simkl sign-ins do not sync between devices.
- **Plugins run in a separate browser worker** and cannot read your sign-in.

Detail: [Security and privacy](docs/SECURITY_PRIVACY.md).

## Getting help

Open a [GitHub issue](https://github.com/saurabhhbansal/nuvioweb/issues). If a source fails to play, its error screen has **Export redacted diagnostics**: a small file with no URLs, titles or tokens that you can attach to the issue.

## Legal

- NuvioWeb is an **independent** project. It is **not affiliated with or endorsed by Nuvio**.
- It **ships no content and no sources.** You install your own add-ons and plugins and are responsible for them. Use only media you are allowed to access.
- No DRM bypass, no server-side transcoding and no media proxy.

## License and source

GPL-3.0. Source code: [github.com/saurabhhbansal/nuvioweb](https://github.com/saurabhhbansal/nuvioweb). License text: [app/alpha/LICENSE](app/alpha/LICENSE). NuvioWeb is a hard fork of [alphasquare404/NuvioWeb](https://github.com/alphasquare404/NuvioWeb); upstream notices are kept, see [UPSTREAM_SOURCES](UPSTREAM_SOURCES.md).

## For developers

- Start with [AGENTS.md](AGENTS.md) and [CONTRIBUTING](docs/CONTRIBUTING.md).
- Run it locally and find the rest of the docs: [DEVELOPMENT](docs/DEVELOPMENT.md).
- Development preview: https://nuvioweb-preview.pages.dev
