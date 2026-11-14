import { describe, expect, it } from "bun:test"
import { fromMinorUnits, MoneyValidationError, toMinorUnits } from "./index"

const errorOf = (fn: () => unknown): MoneyValidationError => {
	try {
		fn()
	} catch (error) {
		return error as MoneyValidationError
	}
	throw new Error("expected the call to throw")
}

const CANONICAL_BOUND = 10 ** 15

/** Fixed-seed linear congruential generator, so the sweep repeats exactly without randomness. */
const createSampler = (seed: number) => {
	const step = (state: number) => (Math.imul(state, 1664525) + 1013904223) >>> 0
	let state = seed
	return (max: number): number => {
		state = step(state)
		const high = state
		state = step(state)
		return (high * 2 ** 21 + (state >>> 11)) % (max + 1)
	}
}

type CanonicalCase = { digits: number; minorUnits: number }

/** Boundary values plus seeded samples inside the bound, at every precision and both signs. */
const canonicalCases = (): CanonicalCase[] => {
	const sample = createSampler(0x9e3779b9)
	const cases: CanonicalCase[] = []
	for (let digits = 0; digits <= 15; digits += 1) {
		const boundary = [0, 1, CANONICAL_BOUND - 1, CANONICAL_BOUND]
		const sampled = Array.from({ length: 512 }, () => sample(CANONICAL_BOUND))
		for (const minorUnits of [...boundary, ...sampled]) {
			cases.push({ digits, minorUnits })
			if (minorUnits > 0) cases.push({ digits, minorUnits: -minorUnits })
		}
	}
	return cases
}

const roundTrip = (minorUnits: number, digits: number): number =>
	toMinorUnits(
		fromMinorUnits(minorUnits, digits, "minorUnits", { allowNegative: true }),
		digits,
		"amount",
		{ allowNegative: true },
	)

/** Places the decimal point in the integer's digits, left-padding to reach the precision. */
const majorUnitString = (minorUnits: number, digits: number): string => {
	const digitsOnly = String(Math.abs(minorUnits)).padStart(digits + 1, "0")
	const splitAt = digitsOnly.length - digits
	const major = digitsOnly.slice(0, splitAt)
	const sign = minorUnits < 0 ? "-" : ""
	return digits === 0 ? `${sign}${major}` : `${sign}${major}.${digitsOnly.slice(splitAt)}`
}

describe("toMinorUnits", () => {
	it("converts without binary float drift", () => {
		expect(toMinorUnits(1.14, 2)).toBe(114)
		expect(toMinorUnits(0.07, 2)).toBe(7)
		expect(toMinorUnits(1.005, 2)).toBe(101)
		expect(toMinorUnits(0.1 + 0.2, 2)).toBe(30)
		expect(toMinorUnits(10.55, 2)).toBe(1055)
	})

	it("scales for currencies with 0, 2, 3 and 4 digits", () => {
		expect(toMinorUnits(1234, 0)).toBe(1234)
		expect(toMinorUnits(2.5, 0)).toBe(3)
		expect(toMinorUnits(1.234, 3)).toBe(1234)
		expect(toMinorUnits(1.2345, 4)).toBe(12345)
	})

	it("rounds on the decimal digits instead of a re-parsed double", () => {
		expect(toMinorUnits(45025932267308.234, 2)).toBe(4502593226730823)
		expect(toMinorUnits(45000434517860.414, 2)).toBe(4500043451786041)
		expect(toMinorUnits(524416029453.27747, 3)).toBe(524416029453277)
		expect(toMinorUnits(537069261074.06647, 3)).toBe(537069261074066)
		expect(toMinorUnits(1698485086726.2249, 2)).toBe(169848508672622)
		expect(toMinorUnits(-45025932267308.234, 2, "amount", { allowNegative: true })).toBe(
			-4502593226730823,
		)
	})

	it("rounds half away from zero at large magnitudes", () => {
		expect(toMinorUnits(524416029453.2775, 3)).toBe(524416029453278)
		expect(toMinorUnits(524416029453.27795, 3)).toBe(524416029453278)
	})

	it("scales scientific-notation input instead of returning NaN", () => {
		expect(toMinorUnits(1e-7, 2)).toBe(0)
		expect(Number.isNaN(toMinorUnits(1e-7, 2))).toBe(false)
	})

	it("normalises -0 to positive 0", () => {
		expect(Object.is(toMinorUnits(-0, 2), 0)).toBe(true)
	})

	it("accepts negative amounts only when allowNegative is set", () => {
		expect(toMinorUnits(-1.14, 2, "amount", { allowNegative: true })).toBe(-114)
		expect(toMinorUnits(-1.005, 2, "amount", { allowNegative: true })).toBe(-101)
		const error = errorOf(() => toMinorUnits(-1.14, 2))
		expect(error.reason).toBe("Value cannot be negative")
	})

	it("rejects non-finite input", () => {
		expect(errorOf(() => toMinorUnits(Number.NaN, 2)).reason).toBe("Value cannot be NaN")
		const infinite = errorOf(() => toMinorUnits(Number.POSITIVE_INFINITY, 2))
		expect(infinite.reason).toBe("Value must be a finite number")
	})

	it("rejects results outside the safe integer range", () => {
		expect(() => toMinorUnits(1e16, 2)).toThrow(MoneyValidationError)
		expect(() => toMinorUnits(1e21, 2)).toThrow(MoneyValidationError)
	})

	it("rejects an out-of-range precision", () => {
		expect(errorOf(() => toMinorUnits(1, 1.5)).field).toBe("digits")
		expect(errorOf(() => toMinorUnits(1, -1)).reason).toContain("between 0 and 15")
		expect(errorOf(() => toMinorUnits(1, 16)).reason).toContain("between 0 and 15")
		expect(errorOf(() => toMinorUnits(1, Number.NaN)).reason).toContain("safe integer")
	})

	it("reports the caller's diagnostic field", () => {
		expect(errorOf(() => toMinorUnits(-1, 2, "netTaxPayable")).field).toBe("netTaxPayable")
	})
})

describe("fromMinorUnits", () => {
	it("converts integer Minor Units back to major units", () => {
		expect(fromMinorUnits(114, 2)).toBe(1.14)
		expect(fromMinorUnits(7, 2)).toBe(0.07)
		expect(fromMinorUnits(1055, 2)).toBe(10.55)
		expect(fromMinorUnits(1999, 2)).toBe(19.99)
		expect(fromMinorUnits(500, 0)).toBe(500)
		expect(fromMinorUnits(1234, 3)).toBe(1.234)
	})

	it("normalises -0 to positive 0", () => {
		expect(Object.is(fromMinorUnits(-0, 2), 0)).toBe(true)
	})

	it("accepts negative amounts only when allowNegative is set", () => {
		expect(fromMinorUnits(-114, 2, "minorUnits", { allowNegative: true })).toBe(-1.14)
		expect(() => fromMinorUnits(-114, 2)).toThrow(MoneyValidationError)
	})

	it("rejects a non-integer amount", () => {
		expect(errorOf(() => fromMinorUnits(1.5, 2)).reason).toBe(
			"Minor units amount must be a safe integer",
		)
	})

	it("rejects an out-of-range precision", () => {
		expect(() => fromMinorUnits(114, 99)).toThrow(MoneyValidationError)
	})
})

describe("Canonical Amount", () => {
	it("round-trips sampled minor units inside the 10^15 bound at precision 0 through 15", () => {
		for (const { digits, minorUnits } of canonicalCases()) {
			expect(roundTrip(minorUnits, digits)).toBe(minorUnits)
		}
	})

	it("round-trips the largest safe integer at precision 0", () => {
		expect(roundTrip(Number.MAX_SAFE_INTEGER, 0)).toBe(Number.MAX_SAFE_INTEGER)
	})

	it("records the published precision-2 miss above the bound", () => {
		// Pins today's result so a behaviour change is visible. Callers must not rely on the
		// one-unit difference, and this does not claim the next integer fails.
		expect(roundTrip(9_007_199_254_740_991, 2)).toBe(9_007_199_254_740_990)
	})

	it("matches decimal-point placement inside the bound at precision 0 through 15", () => {
		for (const { digits, minorUnits } of canonicalCases()) {
			const placed = toMinorUnits(Number(majorUnitString(minorUnits, digits)), digits, "amount", {
				allowNegative: true,
			})
			expect(placed).toBe(roundTrip(minorUnits, digits))
		}
	})
})

describe("MoneyValidationError", () => {
	it("carries the field, value and reason, and reads as its own class", () => {
		const error = errorOf(() => toMinorUnits(-1, 2, "income"))
		expect(error).toBeInstanceOf(MoneyValidationError)
		expect(error).toBeInstanceOf(Error)
		expect(error.name).toBe("MoneyValidationError")
		expect(error.field).toBe("income")
		expect(error.value).toBe(-1)
		expect(error.reason).toBe("Value cannot be negative")
		expect(error.message).toBe(
			"Money validation error on field 'income': Value cannot be negative (received: -1)",
		)
	})
})
