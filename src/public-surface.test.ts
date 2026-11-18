import { describe, expect, it } from "bun:test"
import type { ValidateAmountOptions } from "./index"
import * as entryPoint from "./index"

/**
 * Pins the published surface so a fourth export cannot ship.
 *
 * The surface is the three runtime names in the list below plus the `ValidateAmountOptions` type.
 * `docs/adr/0001-decimal-scaling-primitives.md` states the runtime half as "the surface is
 * deliberately three exports", and `AGENTS.md` rule 8 names the two conversions, the validation they
 * need and `MoneyValidationError`, where "the validation they need" is what covers the options type.
 * Pinning it here makes both mechanical, because every other gate checks something else: Biome and
 * `tsc` read the syntax and types of whatever exists, the suite tests values, the coverage script
 * counts lines, and `publint`/`attw` inspect packaging metadata.
 *
 * The comparison is exact in both directions, not a subset: a fourth name, a removed name and a
 * `default` export all fail, as does a star re-export that brings a name not in the list. That is
 * intended, so a breaking removal is a deliberate edit to the list rather than an unnoticed
 * regression.
 *
 * What this does not catch: a type-only addition. TypeScript erases type exports, so a namespace
 * import cannot see them, and `attw` resolves module conditions rather than export membership. Only
 * the removal of the options type is pinned, by the annotated binding in the second case.
 */
const PINNED_RUNTIME_EXPORTS = ["MoneyValidationError", "fromMinorUnits", "toMinorUnits"]

describe("public surface", () => {
	it("exports exactly the three pinned runtime names", () => {
		expect(Object.keys(entryPoint).sort()).toEqual(PINNED_RUNTIME_EXPORTS)
	})

	it("exports the options type, used through a conversion", () => {
		const options: ValidateAmountOptions = { allowNegative: true }
		expect(entryPoint.toMinorUnits(-1.14, 2, "amount", options)).toBe(-114)
	})
})
