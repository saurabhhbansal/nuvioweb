# Issue #10 — actual installed-provider acceptance and deferred wind-up

**2026-10-20 UTC. Disposition: DEFERRED, not feature-complete.** [Issue #10](https://github.com/saurabhhbansal/nuvioweb/issues/10) remains **OPEN / `in_progress`**, labelled `deferred`. The original supported4K and explainable-error criteria are not checked off. [#137](https://github.com/saurabhhbansal/nuvioweb/issues/137) owns the exact real-source delivery/startup-diagnostic remainder; [#138](https://github.com/saurabhhbansal/nuvioweb/issues/138) owns physical HDR output. These are missing capabilities/measurements, not a request for routine owner permission.

[Structured, privacy-checked real-provider receipt](issue10-real-streams-2026-10-20.json) · [plan](../plans/issues/issue-10.md) · [engine matrix](../ENGINE_CAPABILITY_MATRIX.md). Earlier generated/local fixture results remain **regression-only**, not acceptance evidence for the owner's real-provider instruction. No old failure, strict60 exit3 or predicate was relabelled as pass.

## Actual app, account and provider path

- The existing HTTPS preview served **`b5a8679404b98649f9c742abc6aa5da00edc50a9`**, deployment `9d9d6d0d-8617-4ed5-bc91-770038162800`. Repository base was **`45d59a16ef19f7bacd70232b98f08150c2081bf7`**. These are not the same revision. No deployment was made; current-main UI was **not** claimed as the browser-served runtime.
- Signed in with the available designated test identity through the normal app UI, selected an existing profile and inspected installed Add-ons. New isolated owned browser contexts reused that authorized session; they did not clone an operator/elapsed-observer session. Skipping Quick Setup acknowledged onboarding through its normal UI, not a player/provider-settings rewrite.
- Six actual configured providers: **[provider], [provider], [provider], Telegram, [provider], [provider]**. Custom template/plugin sources: **zero**. The actual repository/StreamApi provider pipeline supplied the choices; no own addon, source endpoint, proxy, response replacement, fixture, remux or transcoded replacement was used.
- Searched/opened **Dune: Part Two** and **Gemini Man** in the actual app. Inspected every row of each captured original stream response before app mapping/deduplication. The Dune snapshot contains the complete30-row [provider] response and Telegram's empty response; its20s snapshot did **not** establish all-provider completion. Settled Gemini responses are accounted per run below. Other providers/content types are not certified merely because six providers are installed.
- Canonical source cards were matched to the actual returned URL **in memory only** and clicked through normal UI. No URL-bearing stream IDs, configured URLs, signed media URLs, headers, credentials, profile/account identifiers, screenshots/traces or browser state are published.

## Real outcomes — engines, not duplicated brands

Ubuntu24.04 ARM64, Node22.23.1, Playwright1.64.0, headless. Chromium156.0.8078.4 is one Chromium-family cohort, WPE WebKit27.2 revision2370 one WebKit cohort, Gecko157.0 revision1555 one Gecko cohort. Internal source/observer retries are disclosed, not counted as additional browser-brand coverage. Operator Chromium151 reconnaissance is not a playback result.

| Engine and actual returned selection | What was observed | What is **not** proved |
| --- | --- | --- |
| Chromium — [provider] AVC/AAC1080p MKV | **1920×1080 actual frame delivery.**30.0003s wall /29.9841s media, ratio0.99946;720 total frames,2 dropped. Composition-counter rate24.021fps; best-effort callback rate23.700fps. Pause, seek request140.39572s, observed clock140.495355s, new post-seek frame140.52s at1920×1080, resume and Back all observed. | Not4K, not60fps, not physical pacing or audible/multitrack output. This was an explicitly selected alternative, not a silently downscaled4K source. |
| Chromium — actual [provider] HEVC/AC3 HDR10/HFR-labelled4K MKV | `startup-source-error`, no first frame. Native media responses included307 and206. | No successful4K decode/seek; no isolated video-versus-audio/container/backend cause or universal HEVC ban. |
| WebKit — same [provider] MKV, then the actual AVC/AAC control | `startup-stall`, readyState0, no frames; Back observed. Plain “Playback error” plus diagnostic details remains insufficiently actionable. | Neither native4K nor this actual1080p path passed. The working Chromium control does not transfer to another engine. |
| Gecko — same [provider] HDR10/HFR-labelled MKV | **Metadata only:**3840×2076, readyState1 and a requested resume clock. Over30.028s: **zero media-time advance and zero total frames**; one isolated callback sample did not establish advancing playback. Observer later failed at controls, exit2. | Metadata dimensions and a nonzero resume clock are **not decoding/playback proof**. No4K frame-delivery, seek,60fps or insufficient-host-throughput finding. |
| WebKit and Gecko — actual [provider]/[provider] MP4 offer | Each reached `startup-source-error`, zero dimensions/no first frame; Back observed. | No4K pass. The10bit filename explicitly says **SDR**; its raw observer label `actual4KWithHdrTags` is just a misleading test name, not HDR evidence. The receipt retains it as `observerLabel` beside an accurate no-HDR-claim case name. |
| Chromium — actual returned header-required HLS offer | Correct actionable special-request-header guidance; no bypass; returned to source selection. Another actual [provider] MP4 failed while the [provider] AVC/AAC control worked. | Not real-provider HLS decode certification; not proof that H264 or all [provider] sources are unsupported. Filename1080p versus provider480p labels are not authoritative dimensions. |

The successful control's selected release was `Gemini.Man.2019.1080p.WEBRip.AAC2.0.x264-CM.mkv`. The failed HDR/HFR candidate was the provider's `Gemini Man (2019) AC3 5.1 ITA.ENG 2160p H265 HDR10 HFR sub ita.eng Sp33dy94-MIRCrew.mkv`. These are unverified provider filenames, not downloadable media artifacts. The provider's4K MP4 offer advertised38.72GB /47.4Mbps /10bit and supplied an SDR-marked filename originally ending in MKV. Conflicting provider filename/container/quality labels are retained as declarations, never repaired into an invented compatible source.

### Complete returned lists and command results

The six real-source observation runs retain **240 returned-row observations**, including informational/non-media rows. Every per-response array length matches its recorded count; all settled Gemini runs had zero pending provider requests and exact canonical-card/returned-row count equality. Dynamic lists are not silently forced to the first snapshot's count.

| Private UI-observer command suffix (Node22.23.1) | Telegram / [provider] / [provider] rows | Observer exit |
| --- | --- | --- |
| `NUVIO_RUN_SUFFIX=v3 … chromium 'Gemini Man'` |0 /19 /17 =36 |0; observation completed, selected candidates failed |
| `NUVIO_ONLY_COMPAT=1 NUVIO_RUN_SUFFIX=aio-avc … chromium 'Gemini Man'` |0 /19 /17 =36 |0; actual1080p playback/controls observed |
| `NUVIO_RUN_SUFFIX=tls-module … webkit 'Gemini Man'` |0 /19 /23 =42 |0; observation completed, selected candidates stalled |
| `… firefox 'Gemini Man'` |0 /19 /23 =42 |2; metadata/no frames, controls stage incomplete |
| `NUVIO_ONLY_4K_MP4=1 NUVIO_RUN_SUFFIX=actual-mp4-home … webkit 'Gemini Man'` |0 /19 /23 =42 |0; selected MP4 failed |
| `NUVIO_ONLY_4K_MP4=1 NUVIO_RUN_SUFFIX=actual-mp4 … firefox 'Gemini Man'` |0 /19 /23 =42 |0; selected MP4 failed |

Here `…` is the ignored private UI observer, not an installed provider or custom-source pipeline. The structured receipt contains exact commands, timestamps, per-case UI evidence, full projected source rows, counter samples' hashes, private redacted receipt hashes, engine binary hashes and results. **Exit0 means the observation completed, not that media acceptance passed.** Attempt-scoped fetch/XHR aggregates can include background requests; a429/CORS message there does not identify the selected media's root cause. Native status visibility also differs by port.

Chromium provenance correction: `chromium.executablePath()` reported a nonexistent nominal full-browser location. Inspection of installed Playwright1.64's default headless selector and revision1248 registry identifies **`chrome-headless-shell`156.0.8078.4**, whose binary hash is in the public receipt. Runtime process argv was not captured; this is explicitly reconstructed launcher provenance, not an invented process trace. WPE and Gecko use the recorded explicit binaries. Actual codec/backend cause remains unisolated.

## Unknown metadata is genuinely observed

On actual selected source cards, the app displayed **“Format and codec unknown”**, **“Resolution unknown · HDR unknown”** and **“Browser support unknown”**, despite rich4K/codec/HDR filenames and provider labels. This re-verifies the unknown-metadata criterion with actual provider data. The private observer's `labelPattern*` fields are merely selection/inspection aids; they are not the product's normalized descriptors, browser predictions or media facts. HFR does not declare exactly60fps;10bit does not imply HDR.

## Rejected instrumentation/preflight runs — not product passes or failures

1. The first completion predicate waited for TV-only chips. Browser UI uses the addon dropdown; diagnostic observed zero chips,28 cards and zero pending provider requests. First run/intentional diagnostic exited2 **before playback**.
2. A second observer read an empty retained CSS-hidden error container as visible and captured immediate zero-state snapshots. Its exit0 is invalid acceptance evidence. Error visibility was corrected using the app's `aria-hidden` state and actual text.
3. The initial Gecko startup predicate accepted dimensions plus a requested resume clock. Actual delivery counters override that mistake: zero frames/advance, not a decode pass. Later startup waits additionally require readyState and decoded-frame evidence. Its raw exit2 and observations are preserved.
4. WPE's first HTTPS navigation failed immediately: **“TLS support is not available.”** A controlled same-app HTTPS preflight failed in the original private environment and returned200 after discovering the **already-installed normal GnuTLS module** through `GIO_EXTRA_MODULES`. Certificate verification stayed enabled. No ignore-HTTPS-errors, CA substitution or app/media-response rewrite.
5. A later Dune navigation was closed by the conservative3.5GiB receive stop before sources. A final MP4 preflight's Search had no visible result within45s. Neither is a Dune/MP4 playback failure. The subsequent normal-UI MP4 attempts actually reached complete lists and selected the returned MP4.

No raw failed receipt, old strict60 predicate/result or original source was overwritten to make a test green.

## Cost, privacy, session and side-effect decisions

The initial **4GiB** transfer ceiling was not increased. The operational monitor used cumulative **all-host, non-loopback received bytes**, first stopping at3.5GiB, then using reserved headroom with a3.85GiB stop for the final actual MP4 attempts. Largest final counter: **3,904,063,870 bytes (about3.636GiB)**. It is a conservative upper bound including unrelated/background traffic, not per-source delivered bytes, a network-throughput measurement or a billing meter. Native browser buffering is not an explicit source download; no media file is published. No new processing fee/purchase/paid compute/provider configuration was enabled; existing provider entitlement is not a claim that the provider is free.

Publication uses a schema allowlist, configured account/auth/provider literal scanning, rejection of unexpected URLs and a deliberate **in-memory secret-injection negative check**. All passed before export. Secret browser state remains outside git/review-agent scope. Review agents receive only the tracked public diff. No screenshots/traces, raw responses, authorization headers, signed URLs, account/profile identifiers or URL-bearing stream IDs are published.

Ordinary authorized playback/history/onboarding and possible provider cache/library side effects were allowed assumptions, recorded for owner review; already-issued remote operations cannot be undone. No broad account reset or stale restoration is attempted. New owned contexts were closed; existing operator/elapsed-observer contexts were not navigated, closed or replaced. Final cleanup at20:21:21Z validated that both private snapshots belonged to this fresh test session, then performed **local-only logout, HTTP204**, never account-global revocation. Both owned private storage-state files were removed after exact resolved-path/type checks; the credential-file hash was unchanged. Public artifacts passed the final private-literal scan and deliberate in-memory access-token-injection rejection. A fresh public SOURCE request returned200 and still matched the pinned runtime. The separate scoped handoff records observer/pinned-runtime checks.

## Acceptance mapping and exact remaining scope

| Original requirement / requested observation | Disposition |
| --- | --- |
| Supported4K is not charged for or silently downscaled | **DEFERRED / not verified.** No actual4K frame-delivery case passed. Working1080p is not substituted. [#137](https://github.com/saurabhhbansal/nuvioweb/issues/137). |
| Unknown metadata is identified as unknown | **VERIFIED in actual selected source cards**, separately from later successful1080p media facts. |
| Source and browser errors are explainable | **PARTIAL / original checkbox remains unchecked.** Actual header and source-error guidance/Back work; WebKit's generic startup-stall and unisolated delivery failure remain in [#137](https://github.com/saurabhhbansal/nuvioweb/issues/137). |
| Actual original-resolution4K frames, sustained offered rate and seek | **DEFERRED**, exact observed sources/paths and real-frame acceptance in [#137](https://github.com/saurabhhbansal/nuvioweb/issues/137); no hardware/engine-ceiling guess. |
| Physical HDR10/PQ/HLG and claimed combined4K60HDR output | **DEFERRED / NOT MEASURED**, no verified physical output path; [#138](https://github.com/saurabhhbansal/nuvioweb/issues/138). Graphics/video queries and virtual24-bit color are not physical sensors or a universal video-plane exclusion. |
| Multitrack/audible, general DRM/devices, optional media recovery | Not certified here; existing #12/#24 scopes remain unchanged, not new speculative backlog. |

**Product-first decision:** keep the parent open, not `verified`, `cancelled` or falsely closed after moving unpassed criteria to children. The feature's integrated descriptor/prediction/ordering work and regression tests remain useful, but do not override failed actual acceptance. No change to #7/#120/#128–130, their original guards, elapsed observers or pinned runtime. There is no implied production/MVP release.

## Executed reconciliation checks

Using Node22.23.1:

- `node --test scripts/check-docs.test.mjs scripts/governance.test.mjs`: **15/15 pass**,0 fail/skip, exit0.
- `node scripts/check-docs.mjs`: all inspected local links resolve, exit0.
- `node scripts/check-progress.mjs`: structurally valid, exit0; structural validity is not feature completion.
- `git diff --check`: exit0.
- Independent public-receipt validator: six runs/240 rows/one actual1080p sustained case/zero actual4K frame cases; per-response and canonical-card equality; recorded RX below4GiB; deliberate row-loss, metadata-only fake-pass and parent-fake-PASS mutations all rejected, exit0.
- Base-to-working-tree invariant check: every non-#10 ledger record unchanged; existing issue120 CURRENT checkpoint byte-prefix preserved with only appended #10 pointer; no app/test/fixture/tool/CI/dependency diff; #10 stays `in_progress` with no completion record, exit0.

The private export initially failed while hashing a nonexistent nominal Chromium executable path; inspected installed launcher/registry corrected the provenance as described above, then export and final privacy/negative checks passed. This was an evidence-export failure, not playback.

## Integration boundary

This is documentation/evidence reconciliation only: no app, acceptance predicate, media fixture, dependency, CI, auth/fetch/runtime policy or deployment change. Required local docs/governance/links/ledger/ancestry/privacy checks, separate automated Standards/Spec actual-diff review and all four exact-head plus actual-merge protected contexts must be recorded before integration is called verified. Automated review is not independent human approval. Protected revert of this unit rolls back the documentation only, not already-issued playback side effects.
