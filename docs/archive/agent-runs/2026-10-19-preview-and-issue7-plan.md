# Agent run — preview refresh plan and #7 diagnosis, 2026-10-19

- Tool: Codex CLI 0.163.0 (`~/.local/share/mise/shims/codex`), read-only sandbox, ChatGPT login, `--skip-git-repo-check`.
- Purpose: independent runbook for the authorized development-preview refresh and a bounded #7 account-switch diagnosis.
- Input: sanitized request under the ignored `dist/` tree; no credentials, tokens or account identifiers were included.
- Output: full plan in the ignored `dist/codex-preview7-plan.md`; durable summaries in [issue #7 plan](../plans/issues/issue-7.md) and [STATIC_PREVIEW.md](../STATIC_PREVIEW.md).
- Corrections accepted from the review: the shipped runtime does include PR #52's add-on failure normalization (not only docs since PR #49); the expected inventory is 134 manifest entries plus the manifest file itself; `/tmp` is ephemeral in this execution environment, so workspace paths are required.
- Unit A executed: preview `1f67867` deployed as `b48de821`, HTTPS/worker and complete hosted guest journeys PASS ([receipt](../evidence/preview-refresh-2026-10-19.json)).
- Unit B not executed: live A/B diagnosis awaits a dedicated bounded run.
