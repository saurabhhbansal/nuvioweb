# Issue #118 — QR session publication and rendering safety

Parent: [#7](https://github.com/saurabhbansal/nuvioweb/issues/7). Covers A6/A7 and original O1/O3.
Base: `a92a9ef0abea32d8d549fb00a5d734fde00358b2`.

## Goal

Stop a delayed QR exchange from publishing tokens after the attempt has been superseded, and stop
credential-bearing QR content from reaching a third-party renderer or unsafe markup. Keep the live QR
consent/expiry/device question under [#120](https://github.com/saurabhbansal/nuvioweb/issues/120).

## Existing contract

- `QrLoginService.start()` creates an anonymous caller (if needed), calls
  `/rest/v1/rpc/start_tv_login_session`, and returns `{code, loginUrl, qrImageUrl, expiresAt,
  pollIntervalSeconds, deviceNonce}`. It currently fabricates an external `api.qrserver.com` image URL
  when upstream supplies none.
- `poll()` calls `/rest/v1/rpc/poll_tv_login_session`; `exchange()` calls
  `/functions/v1/tv-logins-exchange` and writes `SessionStore` tokens then
  `AuthManager.setState(AUTHENTICATED)` directly.
- The screen owns poll timers and has a post-await stale-session check, but the service publishes
  before that check. `cleanup()` is a no-op in the service; the screen's signed-out
  `handleContinueAction` path did not call cleanup at all.
- `AuthManager.exchangeTvLoginSession()` and `signInWithEmail()` also publish tokens after awaited
  responses without an authentication-attempt ownership check.

## Attempt/session ownership contract

- `QrLoginService.beginAttempt()` returns an explicit attempt id and records the current
  `AuthManager.sessionGeneration`. Starting a new attempt supersedes the old one.
- `start()`, `poll()` and `exchange()` accept an optional attempt id; without one they use the current
  active attempt. `poll`/`exchange` refuse when no attempt is active.
- Every awaited boundary checks that the attempt is still active and the session generation is
  unchanged. `exchange()` additionally captures the anonymous token pair after bootstrap and refuses
  to publish if it changed while the exchange response was pending.
- A successful exchange publishes only through `AuthManager.establishAuthenticatedSession()` with a
  new authentication attempt; failure signs out locally and reports a fixed error. Already-issued
  remote requests cannot be undone and that limit is documented.
- `cancelAttempt(id)`/`cleanup()` invalidate the active attempt. The screen calls them on back,
  continue-without-account, refresh and unmount.
- `AuthManager` gains an authentication-attempt sequence: sign-in, TV exchange and bootstrap capture
  it; logout increments it; stale email/TV/bootstrap completions cannot write tokens or state.

## QR rendering contract

- Remove the `api.qrserver.com` fallback. `start()` returns only an upstream-provided image URL or
  `null`.
- `isSafeQrImageUrl()` accepts only: an absolute/relative same-origin HTTPS URL, the same loopback
  HTTP origin used by fixtures, or a base64 `data:image/(png|jpeg|gif|webp)` URL. It rejects
  `javascript:`, cross-origin, credential-bearing, and quote/event-handler strings.
- The screen builds the image with `document.createElement`, sets `src`/`alt` as properties and uses
  `textContent` for the unavailable state. Unsafe or absent images render an explicit
  `data-state="unavailable"` message; the code text remains available.
- QR error text is redacted for the code and device nonce before it is stored, displayed or logged.
  Console diagnostics use fixed messages, not response bodies.

## Targets

- `app/alpha/js/core/auth/qrLoginService.js`
- `app/alpha/js/core/auth/authManager.js`
- `app/alpha/js/ui/screens/account/authQrSignInScreen.js`
- `app/alpha/js/core/auth/qrLoginService.lifecycle.test.mjs` (new)
- `tests/browser/identity-qr.spec.mjs` (new)
- `docs/evidence/issue7-qr-ownership-2026-10-20.json`
- `docs/evidence/issue7-acceptance.json`
- `docs/IDENTITY_VERIFICATION.md`, `docs/NUVIO_IDENTITY_CONTRACT.md`,
  `docs/plans/issues/issue-7.md`, `docs/PROGRESS.json`, `TRACKER.md`,
  `docs/FEATURE_SUPPORT.md`, `docs/agent-runs/CURRENT.md`

## Non-goals

- No new login backend, token store, credential recipient, dependency, proxy or authentication
  service.
- No live QR/account/device operation; no claim that QR works against the deployed service.
- No claim that the application is XSS-proof, that localStorage token exposure is eliminated, or that
  local sign-out revokes the upstream session.
- No email/refresh/password contract change.

## Threats

- A delayed exchange after sign-out and a later account login overwrites the later session.
- A delayed anonymous bootstrap writes anonymous tokens after logout.
- A stale poll/exchange after refresh/back publishes or navigates to profile selection.
- A third-party QR renderer receives a credential-bearing login URL.
- An attacker-controlled `qrImageUrl` breaks out of `innerHTML` or runs an event handler.
- A server error echoes the code/nonce into a visible status or log.
- A stale email/TV/bootstrap completion overwrites a newer authentication attempt.

## Tests

```bash
node --test app/alpha/js/core/auth/qrLoginService.lifecycle.test.mjs \
  app/alpha/js/core/auth/authManager.lifecycle.test.mjs \
  app/alpha/js/core/auth/authManager.test.mjs \
  app/alpha/js/core/auth/accountLocalDataReset.test.mjs
NUVIO_LOCAL_PROPERTIES="$PWD/tests/fixtures/build.properties" npm run build --prefix app/alpha
npx playwright test tests/browser/identity-qr.spec.mjs tests/browser/identity-sync.spec.mjs --project=chromium
node scripts/qr-ownership-probe.mjs app/alpha/js --assert-safe   # green after the fix
```

The lifecycle test must capture red before the fix for the delayed exchange, then green. It also covers
delayed anonymous bootstrap, cancel/refresh, rejection/malformed/missing tokens, redacted errors,
current establishment and stale email/TV publication. The browser test drives the actual screen,
navigates away during a held exchange, proves no later token/state side effect, and asserts a hostile
image URL is inert and no external QR renderer is contacted.

## Rollback

Protected revert of the scoped commit set. No account data, remote session, deployment or credential
recipient changes. A cancelled attempt is local only; already-issued exchange requests cannot be
undone.

## Cost, privileges and review

No hosted compute, paid service, new dependency or new credential recipient. All tests are synthetic.
This is a bounded authentication change: it needs the targeted negative/security tests above, the
existing protected CI, and a separate automated review recorded honestly. It is not independent human
approval; live QR consent/expiry/device remains owner-gated under #120.
