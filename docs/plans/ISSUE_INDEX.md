# Issue tracker / implementation plans

**Status:** all implementation plans are initial agent-ready proposals, not completed implementations. [Browse all issues](https://github.com/saurabhhbansal/nuvioweb/issues).

| Issue | Priority | Work item | Detailed plan |
| --- | --- | --- | --- |
| [#1](https://github.com/saurabhhbansal/nuvioweb/issues/1) | M0 P0 | Validate upstream licenses, provenance, and import strategy | [Plan](issues/issue-1.md) |
| [#2](https://github.com/saurabhhbansal/nuvioweb/issues/2) | M0 P0 | Set up GitHub CI, PR review, and docs verification | [Plan](issues/issue-2.md) |
| [#3](https://github.com/saurabhhbansal/nuvioweb/issues/3) | M0 P0 | Verify Nuvio hosted API usage terms and identity requirements | [Plan](issues/issue-3.md) |
| [#4](https://github.com/saurabhhbansal/nuvioweb/issues/4) | M1 P0 | Import pinned Alpha NuvioWeb browser baseline with attribution | [Plan](issues/issue-4.md) |
| [#5](https://github.com/saurabhhbansal/nuvioweb/issues/5) | M1 P0 | Reproduce upstream install, build, lint and unit tests | [Plan](issues/issue-5.md) |
| [#6](https://github.com/saurabhhbansal/nuvioweb/issues/6) | M1 P0 | Deploy free static browser preview on Cloudflare | [Plan](issues/issue-6.md) |
| [#7](https://github.com/saurabhhbansal/nuvioweb/issues/7) | M1 P0 | Validate existing Nuvio login, sync and profile isolation | [Plan](issues/issue-7.md) |
| [#8](https://github.com/saurabhhbansal/nuvioweb/issues/8) | M1 P1 | Inventory and safely isolate upstream sidecar-dependent routes | [Plan](issues/issue-8.md) |
| [#9](https://github.com/saurabhhbansal/nuvioweb/issues/9) | M2 P0 | Build legal add-on interoperability fixtures and test matrix | [Plan](issues/issue-9.md) |
| [#10](https://github.com/saurabhhbansal/nuvioweb/issues/10) | M2 P0 | Implement source descriptors and browser playback capability reporting | [Plan](issues/issue-10.md) |
| [#11](https://github.com/saurabhhbansal/nuvioweb/issues/11) | M2 P1 | Prototype sandboxed Nuvio JavaScript plugin compatibility | [Plan](issues/issue-11.md) |
| [#12](https://github.com/saurabhhbansal/nuvioweb/issues/12) | M2 P1 | Prototype quality-preserving local audio and container recovery | [Plan](issues/issue-12.md) |
| [#13](https://github.com/saurabhhbansal/nuvioweb/issues/13) | M3 P0 | Define versioned compute protocol and strict job lifecycle | [Plan](issues/issue-13.md) |
| [#14](https://github.com/saurabhhbansal/nuvioweb/issues/14) | M3 P0 | Implement Nuvio-verified agent pairing, grants and revocation | [Plan](issues/issue-14.md) |
| [#15](https://github.com/saurabhhbansal/nuvioweb/issues/15) | M3 P0 | Package a safe single-service Docker FFmpeg compute agent | [Plan](issues/issue-15.md) |
| [#16](https://github.com/saurabhhbansal/nuvioweb/issues/16) | M3 P1 | Publish Bring Your Own Cloudflare Worker Lite template | [Plan](issues/issue-16.md) |
| [#17](https://github.com/saurabhhbansal/nuvioweb/issues/17) | M3 P2 | Validate assisted Cloudflare Worker + Container compute deployment | [Plan](issues/issue-17.md) |
| [#18](https://github.com/saurabhhbansal/nuvioweb/issues/18) | M3 P2 | Evaluate optional desktop compute companion | [Plan](issues/issue-18.md) |
| [#19](https://github.com/saurabhhbansal/nuvioweb/issues/19) | M4 P0 | Benchmark compute cost and design user-facing prepaid quotes | [Plan](issues/issue-19.md) |
| [#20](https://github.com/saurabhhbansal/nuvioweb/issues/20) | M4 P0 | Build Nuvio-verified entitlements and atomic credits ledger | [Plan](issues/issue-20.md) |
| [#21](https://github.com/saurabhhbansal/nuvioweb/issues/21) | M4 P1 | Implement isolated metered hosted processing jobs | [Plan](issues/issue-21.md) |
| [#22](https://github.com/saurabhhbansal/nuvioweb/issues/22) | M4 P1 | Integrate eligible payment provider and transparent credit checkout | [Plan](issues/issue-22.md) |
| [#23](https://github.com/saurabhhbansal/nuvioweb/issues/23) | M5 P1 | Automate upstream change monitoring and reviewed parity tracking | [Plan](issues/issue-23.md) |
| [#24](https://github.com/saurabhhbansal/nuvioweb/issues/24) | M5 P1 | Define full browser device, security and staged release verification | [Plan](issues/issue-24.md) |

## How to use

Follow dependency order in each issue. Agents must edit the corresponding plan with concrete implementation files/contract tests after inspecting current upstream code; they must record actual test evidence in PRs and never claim these planning documents mean a feature has shipped.

- [#29 — Build dependency advisory remediation](issues/issue-29.md): resumed preserved branch; local acceptance checks passed; [PR #33](https://github.com/saurabhhbansal/nuvioweb/pull/33) pending protected integration.
