# M2 workstream plan — add-ons and high-fidelity playback

## Goal
Support established HTTP/Stremio add-ons and safely execute supported Nuvio JS plugins; retain original video quality when possible.

## Steps
1. Create legal fixture set with manifests/catalogs/meta/streams/subtitles and 1080p/4K sample media.
2. Define source descriptor with URL, headers, codecs, container, HDR, tracks, subtitles, availability, authorization and media expiry.
3. Test addon install/configuration/profile sync, manifest variants, CORS/mixed-content, errors and partial provider results.
4. Prototype GYK-like bounded QuickJS worker on independent branch; license review; test malicious inputs, API parity and network boundary.
5. Use MediaCapabilities/canPlayType and actual probe, quality preference and source diagnostics.
6. Evaluate native video, HLS.js, DASH.js, Falcon-compatible WebCodecs/WASM local audio/repacking on supported devices.
7. Test original-quality HDR/4K path, audio switching, subtitles, seek/resume, cancellation and browser fallback.

## Done when
Evidence-based device compatibility matrix exists; supported add-ons resolve and play authorized fixtures without mandatory central compute. Unknown and unsupported formats are clearly labeled, not overstated.

## Risks / rollback
Codec support, CSS/subtitle bugs, sandbox or proxy escape, GPU/browser variance; isolate experimental runtime behind flags.
