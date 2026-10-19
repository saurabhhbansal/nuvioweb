# Upstream watch fixtures

`state-valid.json` is a copy of the reviewed `docs/upstream/state.json` used as the
base for validator tests. Tests copy it into a temporary repository root, create
every referenced path, recompute the LICENSE digest and then apply one invalid
mutation per case. No test performs network access or uses live GitHub data.
