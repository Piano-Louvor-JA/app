# Clean-room network blocking core provenance

## Scope

This prototype implements only the frozen `SPEC — reprodução limpa: core de bloqueio Brave` v1.0: local, immutable network-rule compilation and deterministic request decisions. It does not claim compatibility with Brave, ABP, uBlock, or EasyList.

## Architectural sources audited

- `brave/adblock-rust@09d297c2c2322fef38e91b59521210479516cb4d`: <https://github.com/brave/adblock-rust/tree/09d297c2c2322fef38e91b59521210479516cb4d>
- `brave/brave-core@3ebef453afa24a121fcfb6d680c01bf08f5d2c4c`: <https://github.com/brave/brave-core/tree/3ebef453afa24a121fcfb6d680c01bf08f5d2c4c>
- Public API documentation: <https://docs.rs/adblock>

Those sources were audited only during the architecture phase documented in the frozen SPEC. No upstream source, test, list, asset, binary, patch, API implementation, or internal data structure was copied, ported, translated, adapted, or imported.

## Implementation boundary

- Builder implementation author: Hermes Agent.
- Date: 2026-11-03.
- Builder inputs: frozen `SPEC.md`, `PLAN.md`, `ADR-clean-room-core.md`, and `IMPACT-clean-room-core.md` only.
- Fixtures: authored in `src/shared/network-blocking.test.ts`; literals are `advert`, `safe-advert`, `ads.example`, and `notads.example`.
- No external filter list, URL corpus, remote fetch, telemetry, persistence, browser integration, FFI, or I/O participates in `decide`.

## Verification

- Similarity/manual review: changed source uses native `URL`, local literal matching, and an independent API; no upstream source checkout or imported artifact is present in this worktree.
- Determinism: contract test executes the same decision 100 times.
- Performance guard omitted: the existing test stack has no native benchmark script; no dependency added.
