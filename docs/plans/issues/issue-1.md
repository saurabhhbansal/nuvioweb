# Issue #1: [M0][P0] Validate upstream licenses, provenance, and import strategy

**Plan status:** Provenance contract and primary-source audit implemented on `m0/issue-1-upstream-provenance`; remote CI and scoped PR merge are the final gates.
**Milestone:** M0 · **Priority:** P0  
**GitHub issue:** https://github.com/saurabhhbansal/nuvioweb/issues/1  
**Workstream:** [M0 roadmap](https://github.com/saurabhhbansal/nuvioweb/blob/main/docs/ROADMAP.md) · **Agent rules:** [AGENTS.md](https://github.com/saurabhhbansal/nuvioweb/blob/main/AGENTS.md)

## Objective and scope

Validate upstream licenses, provenance, and import strategy

**Not included:** unrelated milestones, unreviewed production deployment, live payment activation or bypassing authorized playback/access rules.

## Dependencies / entry checks

Docs foundation

Before modifying code, verify required prior issue state and exact upstream revision or package versions. Unavailable dependencies must be logged and should block sensitive implementation.

## Concrete implementation plan (2026-10-18)

Select this unblocked issue before application import. The approved baseline remains Alpha's `web` branch at `5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff`; a moving branch is not an import input.

### Target files and contract

- `docs/UPSTREAM_LICENSE_AUDIT.md`: immutable primary-source links, observed branch tips, license/copyright inventory, dependency evidence and unresolved reuse restrictions.
- `UPSTREAM_SOURCES.md`: provenance contract with source URL/ref/SHA, intended destination, history preservation, required notices, exact import and verification procedure. Mark application source as not imported until #4.
- `docs/UPSTREAM.md`, `README.md`, `TRACKER.md`: link the contract and audit, and record the next dependency gate without overstating application readiness.
- This plan: actual verification results and acceptance disposition before PR closure.

No runtime/API changes. Do not import upstream code, install dependencies, exercise Nuvio credentials, contact maintainers, deploy, or decide hosted-service permission in #1.

### Sequence and verification

1. Fetch upstream metadata/source in temporary research checkouts; compare named branch heads to the audit pins. Record the precise commands and immutable source links.
2. Inspect license files, notices, vendored assets and package/lockfile metadata at each pin. Distinguish verified dependency evidence from a complete release license report; unresolved material cannot be treated as approved reuse.
3. Specify a history-preserving import and reproducible file comparison. Ask the owner about import layout; continue the evidence audit while awaiting that decision.
4. Document Falcon/GYK port gates and the separate Orochi AGPL boundary. Do not silently relicense code or claim hosted API authorization from a source license.
5. Run `node --test scripts/check-docs.test.mjs`, `node scripts/check-docs.mjs`, and a link check explicitly including `UPSTREAM_SOURCES.md`; review `git diff --check`. Attach exact output and remote CI URL to a scoped draft PR.

### Risks, costs and rollback

Source-license metadata alone does not prove every bundled asset is redistributable. Explicitly inventory missing or ambiguous notices; make release blockers visible. Network use is read-only source/registry evidence, without production identities or compute. Roll back by reverting this documentation PR; retain pinned references and the audit trail.

## Functional acceptance criteria

- [x] Reproducible source SHA and import procedure are documented
- [x] Required license files/notices are listed and will be preserved
- [x] Dependency reuse constraints are recorded before source import

## Verification design

Validate cited source files and resulting provenance manifest; no upstream code imported in this issue.

**Evidence that must be attached before closure:** commands actually run, exit codes and assertions, tested browser/device versions if applicable, failures and workarounds. Do not mark a box checked based on static inspection alone.

## Threat, cost, privacy and licensing review

Source facts can become stale; URLs, license ownership or API permissions must not be assumed. Scope work to documentation and verification without production credentials.

Confirm no secrets are introduced, provider/API costs are bounded, third-party source licenses are preserved and users receive no unexpected paid action. Escalate platform authorization or payment-policy uncertainties instead of guessing.

## Telemetry, rollback and ownership

Capture bounded, redacted failure counters and trace IDs without exposing access tokens, media URL queries or personal playback metadata.

**Rollback:** Revert incorrect docs/tooling configuration and update GitHub issue; preserve transparent investigation history.

## Definition of done

- [x] Dependency assumptions and interface/API contract verified against code or published upstream evidence.
- [x] All issue acceptance criteria tested and documented.
- [x] Negative/security/budget cases covered as relevant: documented unverified redistribution and service-use gates; no runtime or cost-bearing change.
- [x] Docs, compatibility notes and source provenance updated.
- [ ] Reviewed pull request linked to issue, with rollout and rollback evidence.

## Executed evidence (2026-10-18)

- `git clone --branch web --single-branch https://github.com/alphasquare404/NuvioWeb.git /tmp/nuvioweb-alpha-import` — exit 0; full history fetched in a temporary research checkout, outside this project.
- `git -C /tmp/nuvioweb-alpha-import rev-parse HEAD` — `5624da2fb26c19e4acad66a4f0cd4e4bcb8b74ff`, matching the original audit.
- `git -C /tmp/nuvioweb-alpha-import rev-parse HEAD^{tree}` — `ad9ff4cea2781cf85010f49b61c315c9bc332e86`.
- `git -C /tmp/nuvioweb-alpha-import ls-tree -r HEAD | wc -l` — 605 entries; `git -C /tmp/nuvioweb-alpha-import rev-list --count HEAD` — 999 commits. Shell assertions for both counts, the tree ID, commit existence and root `LICENSE` all returned exit 0.
- A Node assertion over `package-lock.json` found exactly 237 nonroot package entries and a nonempty license field on each. This verifies lock metadata coverage, not artifact redistribution clearance. Direct-package tarball evidence and remaining notice gaps are in the [audit](../../UPSTREAM_LICENSE_AUDIT.md).
- Local runtime: Node v24.19.0. `node --test scripts/check-docs.test.mjs` — 6/6 passed with sandbox process restrictions lifted; the direct `node scripts/check-docs.test.mjs` invocation independently reported the same six cases. The required GitHub job runs Node 22 and must pass before merge.

The import-layout decision remains with the owner before #4. No upstream source is imported in #1 and no public hosted backend permission, application build, browser compatibility or release clearance is claimed.

- `node scripts/check-docs.mjs` — passed after correcting the audit-to-root relative link.
- Explicit `findBrokenLinks(process.cwd(), ["UPSTREAM_SOURCES.md"])` assertion — passed.
- `git diff --check` — passed.
