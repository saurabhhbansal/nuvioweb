# Issue #8: [M1][P1] Inventory and safely isolate upstream sidecar-dependent routes

**Plan status:** Proposed for agent review — no implementation/test evidence recorded.  
**Milestone:** M1 · **Priority:** P1  
**GitHub issue:** https://github.com/saurabhhbansal/nuvioweb/issues/8  
**Workstream:** [M1 roadmap](https://github.com/saurabhhbansal/nuvioweb/blob/main/docs/ROADMAP.md) · **Agent rules:** [AGENTS.md](https://github.com/saurabhhbansal/nuvioweb/blob/main/AGENTS.md)

## Objective and scope

Inventory and safely isolate upstream sidecar-dependent routes

**Not included:** unrelated milestones, unreviewed production deployment, live payment activation or bypassing authorized playback/access rules.

## Dependencies / entry checks

M1-02

Before modifying code, verify required prior issue state and exact upstream revision or package versions. Unavailable dependencies must be logged and should block sensitive implementation.

## Planned interfaces and deliverables

Route capability matrix for Trakt, debrid and external return; feature flags and restricted Worker API proposals

The issue-owning agent must convert this initial artifact inventory into precise file paths, types/interfaces, test fixture IDs and API contracts after checking the imported codebase. Avoid introducing extra auth systems or central media relay as implicit dependencies.

## Detailed implementation sequence

1. Document Trakt auth, debrid API and external-return service endpoint dependencies
2. Determine which narrow APIs may move to Worker and which need stateful storage
3. Feature-gate unavailable paths on static hosting
4. Prohibit open arbitrary URL proxy behavior

**Integration sequencing:** land the smallest verifiable unit first; update the plan if tests reveal a wrong assumption, then create separate follow-up issues for work outside scope.

## Functional acceptance criteria

- [ ] Every sidecar dependency has a capability flag and proposed deployment
- [ ] Unavailable features display actionable errors instead of silently breaking
- [ ] No unrestricted HTTP proxy published

## Verification design

Missing Worker endpoints, auth failure, invalid hosts/redirects and state expiration; no live debrid credential in tests.

**Evidence that must be attached before closure:** commands actually run, exit codes and assertions, tested browser/device versions if applicable, failures and workarounds. Do not mark a box checked based on static inspection alone.

## Threat, cost, privacy and licensing review

Existing Nuvio hosted auth is an external service; avoid secrets in build artifacts, account leakage, legal-license regressions and broken browser caching.

Confirm no secrets are introduced, provider/API costs are bounded, third-party source licenses are preserved and users receive no unexpected paid action. Escalate platform authorization or payment-policy uncertainties instead of guessing.

## Telemetry, rollback and ownership

Capture bounded, redacted failure counters and trace IDs without exposing access tokens, media URL queries or personal playback metadata.

**Rollback:** Revert feature changes to pinned imported upstream baseline, redeploy previous staging artifact, and preserve auth/token isolation.

## Definition of done

- [ ] Dependency assumptions and interface/API contract verified against code or published upstream evidence.
- [ ] All issue acceptance criteria tested and documented.
- [ ] Negative/security/budget cases covered as relevant.
- [ ] Docs, compatibility notes and source provenance updated.
- [ ] Reviewed pull request linked to issue, with rollout and rollback evidence.

## Inspected execution plan — 2026-10-19 (before code changes)

Select exactly issue8 on `m1/issue-8-sidecar-capabilities`, from protected main390a6f8. Dependency5 is verified. Issue7 needs two owner-authorized disposable Nuvio identities/live sessions for final sync/isolation evidence; requested secure local-file or owner-run checks, never passwords/tokens in chat. No owner account, integration credential, backend or paid service is required to implement8. Do not close7 based on inherited/mock tests.

Pinned upstream remains Alpha web5624da2, original GPL/history retained. Existing source includes three HTTP bridges (`services/trakt-auth-bridge`, `debrid-api-bridge`, `external-return-bridge`) and retained `services/webos/runtime/media-http.cjs`. `scripts/serve.mjs` mounts fixed `/api/trakt`, `/api/debrid`, `/api/external-return` and loopback-only native `/settings`/`tracks/*`; none are deployed to Pages. Browser Settings nevertheless probes Trakt/push; debrid client sends device/account/resolve calls to absent relative APIs; external handoff constructs callbacks for a relay not deployed. Direct HTTP add-ons/browser MP4/HLS/DASH, direct RealDebrid/cloud-provider APIs, Simkl and YouTube iframe helper are distinct existing browser paths, not a new proxy or assumed working backend.

### Scope / precise targets and contract

- New `app/alpha/js/core/platform/sidecarCapabilities.js` and `.test.mjs`: named flags `traktAuth`, `debrid`, `externalReturn`, `nativeMedia`. Three explicit browser-public booleans (`NUVIO_ENABLE_TRAKT_BRIDGE`, `NUVIO_ENABLE_DEBRID_BRIDGE`, `NUVIO_ENABLE_EXTERNAL_RETURN_BRIDGE`) accept only exact string true; missing/invalid values are disabled. Native webOS media stays unsupported/false in browser. Expose a bounded status/message and require helper with stable SIDECAR_UNAVAILABLE code. No URLs, account state, network discovery, telemetry, credentials or arbitrary callback configuration. Flags permit a reviewed configured deployment to attempt existing fixed routes; they are not proof of a healthy service or authentication/authorization.
- `js/config.js`, `scripts/envProperties.mjs`, `docker/entrypoint.sh` (verify exact existing path), `local.example.properties`, public `deploy/cloudflare/build.properties` and inert fixture build config: preserve existing allowlists, add only three nonsecret flags/defaultfalse. Public preview validator `scripts/prepare-static-preview.mjs` and tests require all three disabled; public artifacts cannot accidentally claim undeployed sidecars. Existing self-hosted deployments require explicit documented opt-in; no backend is enabled or deployed here.
- `js/data/repository/traktAuthService.js`: disabled flag prevents bridge health/code/poll/refresh requests before touching stored credentials. Existing enabled bridge request/expiry/rejection flow remains; user-facing error explains this site's missing integration. Do not change Nuvio auth, request destinations, scopes, token persistence, refresh algorithms or Trakt authorization semantics.
- `js/data/remote/api/debridApi.js`: gate only fixed same-origin bridge calls; return an actionable stable unavailable result before creating headers/sending credentials. Preserve direct RealDebrid and existing provider/cloud calls; no credential validation/proxy/network redesign. UI must not label unavailable bridge as an invalid API key.
- `js/ui/components/browserExternalPlaybackHandoff.js`, `browserExternalPlayer.js`, `browserPushReturn.js`: with relay disabled, external launch remains possible with honest manual progress fallback, no automatic callback URL/collector/push request/permission prompt. Existing in-memory/stored handoffs must fail safely after configuration changes; same-origin HTTPS, token shape/expiry/profile checks remain relevant. Offline manual file handoff stays usable. Pure callback formatting remains protocol test tooling, not authority to enable a relay. Enabled fixture behavior retains existing assertions; malformed or off-origin stored handoffs cannot send requests.
- `js/ui/screens/settings/settingsScreen.js`, `js/ui/screens/trakt/traktScreen.js`, related existing external-return label/options helper and default strings only as needed: actionable site-unavailable messaging for Trakt/debrid/automatic external progress/notifications, preserving disconnect/manual/browser playback choices. No redesign/new font/assets. Use Impeccable harden guidance for the narrow existing surface; one batched desktop/narrow visual check, at most one correction. Guard service boundary as well as display so old settings/background callers cannot bypass it.
- Existing module/bridge tests: explicitly enable sidecars in synthetic configured-deployment fixtures where existing requests are expected; retain assertions rather than weakening/skip. New disabled/missing/invalid flags and no-network/no-notification cases, bridge404/HTML/auth rejection, invalid hosts/redirects and expired/cross-profile return state. Browser `tests/browser/sidecars.spec.mjs` uses actual inert bundled guest Settings to assert actionable unavailable states and no sidecar calls even with old synthetic settings; actual imported API/launch/push boundaries tested with blocked external traffic. No real provider/account secrets.
- `docs/SIDECAR_CAPABILITIES.md`: complete route/caller/status/flag matrix and proposed restricted deployments: narrow Trakt and fixed-provider debrid Workers only after auth/rate/body/host/review gates; external return requires bounded durable TTL state and separately gated VAPID delivery, not Worker global memory; webOS native process/FFmpeg cannot move to plain static/Worker, defer safe own-agent recovery to12/15. Explicitly prohibit URL forwarding/open CORS proxies, unreviewed backends/compute and financial changes. No resource provisioning.
- Update FEATURE_SUPPORT, PROGRESS.json/TRACKER, upstream patch inventory and this plan with exact results/blockers. Issue8 may close only after acceptance evidence PR merges. Issue7 remains open until actual authorized account/sync/isolation evidence exists.

### Required verification / rollback / human checkpoint

Pinned Node22.23.1/npm10.9.8. Focused capability/Trakt/debrid/external/push/env tests, configured inert build/lint/artifact, full local application suite (sensitive boundary changes), complete browser suite after stable changes, preview-config tests, docs/governance/links/ledger/ancestry/whitespace; protected exact-head four-context CI. Retain upstream bridge negative-host/auth/expiry tests and supplement at actual client boundaries; no live credentials, account creation, network providers or account tokens. Record any failed command and subsequent correction.

Although no new backend is deployed, this unit changes auth/remote-fetch gating. AGENTS/QUALITY_GATES require owner review of the concrete completed PR before merge; prepare all code/tests/docs/reviews/CI first, then ask for that checkpoint. Automated review is not human approval. Existing broad development authorization does not make automated review independent. No force/bypass, payments/compute/production actions. Rollback: protected revert of client flags/guards/docs (preserving upstream history/notices and stored account data), keep previously reviewed static preview until separately authorized/verified update. No live account/token deletion or credential migration.
