// The `import` condition, a facade over the `require` implementation: both conditions hand a
// consumer the same `MoneyValidationError` object, so `instanceof` holds whichever condition a
// process loaded. The specifier `./index.cjs` resolves from this file's output location,
// `dist/index.mjs`, not from this source directory, and `tsdown` keeps it out of the bundle.
//
// The names are listed rather than starred, because `export *` from a CJS module also re-exports
// the interop's `module.exports` key on Node 22+, which would add a name to this condition's
// surface. Line comments on purpose: a doc block here would be copied into `dist/index.d.mts`.

export type { ValidateAmountOptions } from "./index.cjs"
export { fromMinorUnits, MoneyValidationError, toMinorUnits } from "./index.cjs"
