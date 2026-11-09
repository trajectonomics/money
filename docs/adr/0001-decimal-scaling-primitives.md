# Decimal Scaling with Caller-Supplied Precision and Consumer-Owned Errors

Two packages needed the same major-to-Minor-Unit conversion and had drifted apart: a statutory tax engine that accepts only its own currencies at compile time and must stay locale-free, and an accounting ledger that resolves any ISO 4217 code from `Intl` at runtime. A shared package could not own currency policy without contradicting one of them, so this package owns none of it: it converts with a `digits` argument the caller supplies, expands the shortest decimal representation and rounds half away from zero, ships no currency table and never touches `Intl`, and throws one `MoneyValidationError` that each consumer maps onto the error class its own public API promises.

## Considered Options

- **Resolve precision from `Intl` inside the package** (the ledger's strategy). Rejected: it drags locale data into a statutory engine whose written rule forbids it, and makes output depend on the runtime's ICU version.
- **Ship an ISO table covering every currency.** Rejected: the tax engine would carry data for codes it can never receive, and the table still needs maintaining against ISO revisions.
- **Let each consumer keep its own conversion.** Rejected: the copies had already diverged on computed near-ties and above roughly 3e15 Minor Units, with neither suite able to see it.
- **Alias `MoneyValidationError` as each consumer's error class.** Rejected: the thrown `name` and message would change for every existing throw site; each consumer wraps instead and keeps its class.
- **Use the ledger's `toPrecision(15)` noise trim.** Rejected: it discards real digits above about 1e13 major units and rounds computed near-ties up, so the decimal-string expansion is the exact strategy.

## Consequences

- Moving precision out of the package means a consumer that passes the wrong `digits` mis-scales silently; `digits` is therefore validated as a safe integer in `0..15` and rejected with the package's own error.
- Both consumers wrap the two conversions to preserve their signatures and error classes, so the package never appears in either public API.
- The surface is deliberately three exports. Rounding, percentages, gross-ups, statutory caps and currency-tagged types stay with the packages that need them, and a new export requires a second consumer.
