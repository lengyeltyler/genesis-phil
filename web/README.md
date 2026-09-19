# Phil Web — Build 97 remediation release

Production: https://phil.tylerlengyel.com

Engineering HEAD `a4b24164bb65b242650a64bb0b76795e1bd84a83`, tree `28a0d26f1610fad3703e41eec6a387f765549223`, release ID `a4b24164bb65b242650a64bb0b76795e1bd84a83:a59859497a9c73144260ed4dfb1a45b395b22bfd48f515529d71ba3b0bde0b5a`. [Exact identity and assets](LIVE-RELEASE.json).

Build 97 adds durable, monotonic attempt states and conservative reconciliation. Definitely unsubmitted work can be retired without reusing identity; ambiguous delivery remains held. Before rebuilding a first operation after a concurrent deterministic deployment, the client validates code, factory registration, owner, recovery, Genesis collection, EntryPoint, chain, mode, epoch, and fee ceiling. Contracts and Mainnet state are unchanged.

The public export contains the complete browser runtime dependency set, Web tests and the Desktop account wrapper required by the artwork/account reconstruction test. [ORIGINAL-SOURCE-MAP.json](ORIGINAL-SOURCE-MAP.json) records exact engineering hashes and every documentation-only path transformation.

## Reproduce the frozen release

Use Node 26.0.0 from this `web` directory:

```sh
npm ci --prefix apps/phil-web --ignore-scripts --no-audit --no-fund
PHIL_WEB_OUTPUT="$PWD/.web-build" node apps/phil-web/scripts/reconstruct-public.mjs
node apps/phil-web/scripts/verify-build.mjs "$PWD/.web-build"
```

The reconstruction must reproduce all seven hosted files, the Worker, and `reference-release.json` exactly. The Web suite passed 64/64. The complete release qualification passed 239/239. No account, mint, transfer, withdrawal, signing, deployment, or other Mainnet transaction is performed by reconstruction.

The live host remains fail-closed and release-bound, disables service workers, uses same-origin static assets and Tutorial media, and retains the existing public mint policy. No additional Mainnet mint was performed for this client remediation rollout.
