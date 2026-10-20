# Issue #7 CH2 technical review record — 2026-10-20

Scope: child [#118](https://github.com/saurabhbansal/nuvioweb/issues/118), parent #7. Base
`a92a9ef0abea32d8d549fb00a5d734fde00358b2`. First reviewer pass at `07d9a50`; fixes at
`51488b04b9bf3bce5a1f9d3c5b5c1d0d54635984` with documentation-only follow-ups.

**This is an automated technical review, not independent human approval.**

## Findings and disposition

| Finding | Severity | Disposition |
| --- | --- | --- |
| A stale QR exchange called `AuthManager.signOut()` for any establishment error, including "authentication attempt superseded", so a later session's tokens and account-local data could be cleared. | P1 | Fixed: the exchange records its authentication attempt; on failure it signs out only when that attempt is still current. If a later attempt owns the session, it removes only the QR token pair it wrote (and only if still current). New lifecycle test holds owner resolution, starts a later attempt, then releases it and asserts the later session survives. |
| Cancel/back/refresh during the held owner resolution still published: `cancelAttempt` did not invalidate the in-flight establishment. | P2 | Fixed: `cancelAttempt` bumps the authentication-attempt sequence when the cancelled attempt is in establishment; `establishAuthenticatedSession` receives an active-attempt predicate and re-checks before state/owner publication. New lifecycle test cancels during held `get_sync_owner` and asserts no token, owner marker or authenticated state; new browser test holds owner resolution and navigates away with no later publication. |
| The approved QR token pair written before establishment could survive cancel until the held owner request settled, so a reload could authenticate the account. | P2 | Fixed: the QR pair is recorded on the attempt. `cancelAttempt` clears it only while it is still the stored pair, and a new QR attempt discards the superseded pair before creating a fresh anonymous caller. Lifecycle and browser tests assert the tokens are gone immediately after cancel and after reload/bootstrap. |
| A6 evidence/receipt overclaimed that a cancelled exchange "cannot call get_sync_owner" or publish. | P2 | Corrected: an already-issued owner request may be in flight; the publication boundary rejects it after cancellation/supersede. Receipt/evidence wording updated. |
| Removing the external renderer left no QR image when upstream omits `qr_image_url`, while the copy still asked the user to scan. | P2 | Fixed: the screen renders the validated login URL locally with the existing `QrCodeGenerator`; the external renderer remains removed. New browser test covers a missing upstream image. |
| The screen dropped the attempt id on `poll`. | P3 | Fixed: `poll(code, nonce, attemptId)`; lifecycle test proves a stale poll is refused before any request. |
| `cleanup()` cancelled only the last stored attempt id, so an in-flight refreshed attempt could survive back/continue. | P3 | Fixed: screen cleanup cancels the current service attempt; the anonymous caller's tokens are cleared. |
| `start()` error text was not redacted for the device nonce. | P3 | Fixed: start errors redact the generated nonce; test injects a deterministic nonce and asserts `[redacted]`. |
| Email/TV establishment failures could leave their just-written tokens after a superseded attempt. | P3 | Fixed with the same ownership rule: sign out only when the attempt is current, otherwise clear only the written pair. New lifecycle tests cover both. |
| A new QR attempt during owner resolution could be signed out by the old exchange's failure path. | P2 | Fixed: cancelled-publication errors carry `AUTH_PUBLICATION_CANCELLED`, and beginning a new attempt invalidates an old in-flight establishment. The old exchange removes only its own token pair; the new attempt stays active. New lifecycle test covers this. |
| `isSafeQrImageUrl` accepted any HTTPS URL when no DOM `location` exists and rejected `localhost`. | P3 | Fixed: no-location absolute HTTPS is rejected; both `127.0.0.1` and `localhost` are accepted only when same-origin. |
| Test/evidence traceability: the lifecycle suite uses the new attempt API and cannot run pre-fix; the genuine red is the planner probe. | P3 | Documented in the evidence: red is the pre-fix actual-module probe at `f30c79f`; the committed probe and lifecycle/browser suites are the green regression. The red command/limitation is explicitly labelled. |
| CURRENT listed all A1-A8 as unmet; CH2 review record said pending. | P3 | Fixed: CURRENT now lists A2,A3,A5,A8; this record is the completed review disposition. |

## Re-review

The first reviewer pass was against `07d9a50`. The fixes above are at `9ff9419`; a focused re-review of that
head is requested before the PR is marked ready. The executor's checks at `9ff9419`:

- `node --test app/alpha/js/core/auth/qrLoginService.lifecycle.test.mjs` — 16/16.
- `node scripts/qr-ownership-probe.mjs app/alpha/js --assert-safe` — exit 0; stale publication false.
- `npx playwright test tests/browser/identity-qr.spec.mjs --project=chromium` — 5/5.
- `npm test --prefix app/alpha` — 1412/1412.
- `npx playwright test` — 66/66.
- `npm run lint --prefix app/alpha`, inert build, `check-alpha-build` — pass.
- acceptance gate `--validate` — exit 0 with A2,A3,A5,A8 unmet; full closure exit 2.

## Limits

Synthetic/local only. No live QR consent, expiry, nonce or device observation. Tokens remain
same-origin localStorage values and this change is not an XSS-proof claim. An already-issued remote
or owner request cannot be undone; only local publication is controlled.
