# @trajectonomics/money

Pure decimal scaling: major units to integer **Minor Units** and back, for any currency, with the currency precision supplied by the caller.

Zero dependencies, no I/O, no clock, no randomness. It ships no currency table and never touches `Intl`, so the same code serves a statutory tax engine that must stay locale-free and an accounting ledger that resolves ISO 4217 codes from the runtime.

## What this is not

- Not a currency authority: it does not validate or normalise currency codes, and it does not know how many digits a currency has. The caller supplies `digits`.
- Not money arithmetic: rounding, percentages, gross-ups, statutory caps and currency-tagged types belong to the packages that need them.
- Not signed-policy: whether a negative amount is acceptable is the caller's decision, expressed through `allowNegative`.

## Install

```bash
bun add @trajectonomics/money
```

## API

```ts
import { fromMinorUnits, MoneyValidationError, toMinorUnits } from "@trajectonomics/money"

toMinorUnits(1.005, 2) // 101 - 101 cents, not 100: float noise never decides
toMinorUnits(1234, 0) // 1234 - JPY has no fractional digits
toMinorUnits(1.234, 3) // 1234 - KWD has three
toMinorUnits(-1.14, 2, "netTaxPayable", { allowNegative: true }) // -114

fromMinorUnits(1055, 2) // 10.55
fromMinorUnits(500, 0) // 500
```

`toMinorUnits(amount, digits, field?, options?)` expands the amount's shortest decimal representation and rounds half away from zero, so the result never depends on binary floating-point multiplication. Scientific-notation input is scaled directly rather than mis-parsed.

`fromMinorUnits(minorUnits, digits, field?, options?)` is the inverse and also normalises `-0` to `+0`.

Both throw `MoneyValidationError` - carrying `field`, `value` and `reason` - when the precision is not a safe integer in `0..15`, the amount is `NaN` or infinite, a negative amount arrives without `allowNegative`, an amount is not an integer where one is required, or a result leaves the safe integer range.

## Crossing a package boundary

Convert **once**, at the boundary you own, and carry integer Minor Units from there:

- A value that came out of `fromMinorUnits` is canonical: it converts back to the same integer, so converting it once with any implementation is exact.
- A refund is negative. Pass `{ allowNegative: true }` when converting a net figure that can be below zero.
- Do not convert a value with one money implementation and re-convert it with another in the same flow; the diverging input classes are computed floats and amounts near the top of the safe integer range.

## Commands

- `bun run check`: lint, typecheck, tests with 100% line coverage, build, `publint --strict` and `attw`.
- `bun run test`: tests plus the coverage threshold.
- `bun run build`: ESM and CJS bundles via `tsdown`.

## Releasing

Versions are computed, never edited by hand (`package.json` says `0.0.0-development` on purpose). The shared publish workflow reads the last `vX.Y.Z` tag and the conventional commit messages since then:

| Commits since last release | Bump |
| --- | --- |
| any `feat!:` / `fix!:` / `BREAKING CHANGE:` | major (minor while on 0.x) |
| any `feat:` | minor |
| anything else | patch |

- **Alpha, automatic:** every merge to `main` that touches code publishes `<next>-alpha.<n>` under the npm dist-tag `alpha`.
- **Stable, on demand:** Actions -> Release -> Run workflow (on `main`) publishes `<next>` under `latest`, tags `vX.Y.Z` and creates a GitHub release.

## License

MIT
