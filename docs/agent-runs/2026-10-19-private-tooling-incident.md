# Private tooling incident — owner-only credential file overwritten and recovered

Date: 2026-10-19. Status: recovered, no secret disclosed, tooling hardened.

## What happened

While preparing the private, unfetched issue #7 switch-diagnosis driver, the driver was invoked with its two positional arguments in the wrong order (receipt path first, owner-only credentials file second). The driver correctly rejected the receipt path as a credentials file, but its failure handler then wrote the sanitized diagnostic receipt to the path it had been given as a receipt — which was the owner-only credentials file `~/.config/nuvioweb/test-accounts.json`.

The original 167-byte credentials file was replaced by a 442-byte receipt JSON containing only revision, schema, status, stage/code, empty results and limitations. It contained no email, password, token or account identifier. File mode remained `0600`; the directory remained owner-only. Nothing was committed, logged, echoed or sent to any reviewer or service.

## Detection

Immediately after the failed invocation, the file was inspected with `stat` and a short `head`. The mode and size change and the receipt schema were detected before any further use. No diagnostic output from the driver included credential values.

## Recovery

The local DeepSeek Harness session transcript (owner-only, compressed JSONL under `~/.dsh/sessions/`) still contained the exact `write` tool event that originally created the 167-byte file. A script read that event, confirmed its `file_path` matched the credentials path, parsed its `content` as JSON with `A`/`B` email/password entries, and wrote the content back with mode `0600`.

Recovery checks, with values never printed:

- Restored size 167 bytes, mode `0600` — identical to the pre-incident file.
- Structure validated as two entries `A`/`B`, each with string `email` and `password`.
- Provenance validated: both emails and both passwords occur in the owner's original chat message recorded in the same local transcript.
- Only booleans and sizes were printed during recovery.

## Prevention

Both private diagnostic tools (`dist/tools/issue7-switch-diagnosis.mjs` and `dist/tools/issue7-switch-probe.mjs`, git-excluded, never bundled or published) now validate before reading credentials or writing anything:

- The receipt path must be an absolute `.json` path under `dist/` or `docs/evidence/`.
- The receipt path must not equal the credentials path.
- Failure handlers only write a receipt after that validation succeeded.

The guard was exercised with the credentials path as both arguments: it stopped with `RECEIPT_PATH_REJECTED` and the file's SHA-256 and mode were unchanged.

## Residual risk and owner action

- The credentials remain in the local harness transcript, as they already did before this incident; they are not in Git, build output, receipts or any remote service.
- No evidence of external exposure was observed.
- These were disposable test accounts; rotate or replace them after the current verification work, and prefer a fresh owner-only file rather than reusing pasted values.

## Process note

The private driver's interface uses positional arguments for two different trust domains (secret input and artifact output). That is the design defect that made the mistake destructive. Future private tooling should take the credential path from one explicit flag and derive or validate all output paths, and every failure path must treat an output path as untrusted input.
