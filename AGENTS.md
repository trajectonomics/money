# AGENTS.md

Instructions for AI coding agents in `trajectonomics/money` (`@trajectonomics/money` on npm).

## Rules

1. Never commit to `main`. Branch (`feat/*`, `fix/*`, `docs/*`) and open a PR.
2. Never commit secrets or `.env` files. `NPM_TOKEN` lives in repo secrets only.
3. Pure package: no network, DOM, framework imports, or locale logic. It ships no currency table and never calls `Intl`, because its callers own currency policy and one of them must stay locale-free. `tsconfig.json` compiles `src` with no DOM, Node, or Bun types, so `fetch`/`process`/`document` fail typecheck; do not add `types` or `lib` entries to get around it.
4. Bun only: `bun install`, `bun test`, `bun run <script>`. Do not add npm/pnpm/yarn lockfiles.
5. Done means `bun run check` passes: Biome lint with zero warnings, strict typecheck, tests with **100.00% line coverage**, a clean `tsdown` build, `publint --strict` and `attw --profile node16`. `bun run format` fixes formatting and imports. Do not loosen `tsconfig.base.json` or `biome.json` to make an error go away.
6. Never edit `version` in `package.json` and never run `npm publish` locally. Merges to `main` publish alphas; a stable release is the manual Release workflow. PR titles are conventional commits because they decide the next version (see README "Releasing").
7. Postponed work is tracked by the issue tracker, not by prose: file an issue, then leave `TODO(#<issue>)` at the code site it belongs to.
8. Keep the surface bounded: only the two conversions, the validation they need, and `MoneyValidationError` are exported. Rounding, percentages, statutory caps and currency-tagged money types belong to the consuming packages, and a new export needs a second consumer.

## Organisation goals

The organisation's goals are in https://github.com/trajectonomics/goals, `GOALS.md`. Read them before proposing a new direction. Only the owner edits that file; never edit it.

## Agent skills

### Issue tracker

GitHub Issues in `trajectonomics/money`, via the `gh` CLI.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`).

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root.

### Skill discovery

The canonical copy of the skills is `.agents/skills/`, and `.vibe/skills/` holds one symlink per skill (`<name> -> ../../.agents/skills/<name>`) so Mistral Vibe discovers them from a trusted project root; never edit either by hand (pattern from trajectonomics/factory#80).

## Factory Runs

A Factory Run or Spec drafter (a thread titled `traj/trajectonomics/<repo>#<n>` or `triage/trajectonomics/<repo>#<n>`) takes its instructions from the Dispatcher runbook in `trajectonomics/factory`, never from this repository, where `docs/dispatcher-runbook.md` does not exist. Read it with `gh api repos/trajectonomics/factory/contents/docs/dispatcher-runbook.md -H "Accept: application/vnd.github.raw"`. If you cannot read it, stop and say so; do not build from the issue alone.
