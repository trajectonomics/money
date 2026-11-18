import { describe, expect, it } from "bun:test"
import { fromMinorUnits, toMinorUnits } from "./index"

// A seeded differential block beside `minor-units.test.ts`: both conversions are held to an exact
// decimal reference sharing no code with `scaleToMinorUnits`. A second file because biome allows a
// test file 200 lines and this block does not fit in the one already there.

const CANONICAL_BOUND = 10 ** 15
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)
/** 17-digit amounts tried per precision; the exactness guard keeps about a tenth of them. */
const LONG_DECIMALS = 640
/** Digits in the scaled column the long decimals land in, where #6 double-rounded. */
const SCALED_DIGITS = 16
/** Seeded Canonical Amounts per precision, beside the four boundary values. */
const CANONICAL_SAMPLES = 128
/** Exact ties at five magnitudes, both signs: the half Minor Unit the rule rounds away from zero. */
const TIE_MAGNITUDES = [1, 2, 123, 450_359_962_737, 9_007_199_254_740]
/** Powers of two in the 2^48..2^53 double-rounding band, where the old code double-rounded. */
const BAND_MINOR_UNITS = [2 ** 48, 2 ** 49, 2 ** 50, 2 ** 51, 2 ** 52, 2 ** 53]
/** Both sides of the Canonical Amount bound: the guarantee holds below it and is pinned above it. */
const BOUND_MINOR_UNITS = [CANONICAL_BOUND - 1, CANONICAL_BOUND, CANONICAL_BOUND + 1]
/** The exclusion may drop the 18 Canonical Amount boundary rows below 1e-6 and little more. */
const MAX_EXPONENT_DROPS = 32
/** Seed offsets, arbitrary but fixed, so each precision walks its own sequence. */
const LONG_DECIMAL_SEED = 0x1000
const CANONICAL_SEED = 0x2000

type Family = "tie" | "nearTie" | "edge" | "bound" | "long" | "canonical"
type Candidate = {
	readonly text: string
	readonly tie: boolean
	readonly family: Family
	/** The Minor Units this amount came from, in the `fromMinorUnits` direction only. */
	readonly minorUnits?: number
}
type Drop = "exponent" | "inexact" | "out-of-range"

/**
 * Rows each family must compare at every precision. A single total floor cannot see a family go
 * quiet: padding `10^15` to 15 decimals once hid the exact Canonical Amount bound from precisions
 * 1 through 15, because the padded text is not the double's shortest form and was rejected unlooked.
 */
const MIN_FAMILY_ROWS: Partial<Record<Family, number>> = {
	edge: 30,
	bound: 6,
	long: 70,
	canonical: 250,
}

/**
 * Fixed-seed linear congruential generator, as in `minor-units.test.ts`, so nothing is random. A
 * copy, not an import: importing that file runs its tests, and a shared module would be a new `src/`
 * file the 100% coverage gate counts.
 */
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

/** Parses a plain decimal into a signed BigInt mantissa and its fraction length; null if it is not. */
const parseDecimal = (text: string): { mantissa: bigint; fractionDigits: number } | null => {
	const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(text)
	if (match === null) return null
	const fraction = match[3] ?? ""
	const magnitude = BigInt((match[2] ?? "") + fraction)
	return { mantissa: match[1] === "-" ? -magnitude : magnitude, fractionDigits: fraction.length }
}

/**
 * The reference: `amount`'s shortest decimal scaled by `10 ** digits` and rounded half away from
 * zero on the remainder of an integer division. It multiplies no double and calls no `Math.round`,
 * and it rounds the magnitude before reapplying the sign, so both sides round away from zero.
 */
const referenceMinorUnits = (amount: number, digits: number): bigint | null => {
	const parsed = parseDecimal(String(amount))
	if (parsed === null) return null
	const { mantissa, fractionDigits } = parsed
	const negative = mantissa < 0n
	const magnitude = negative ? -mantissa : mantissa
	if (digits >= fractionDigits) {
		const exact = magnitude * 10n ** BigInt(digits - fractionDigits)
		return negative ? -exact : exact
	}
	const divisor = 10n ** BigInt(fractionDigits - digits)
	const rounded = magnitude / divisor + (2n * (magnitude % divisor) >= divisor ? 1n : 0n)
	return negative ? -rounded : rounded
}

/**
 * Returns the reference value for a row, or why the row cannot be compared. A row is compared only
 * when `Number` reproduces its decimal text and the reference's magnitude after rounding is a safe
 * integer; the check is after rounding, because a magnitude below the limit can round one past it.
 * TODO(#11): an `e`-notation amount is dropped here, because the shipped code scales it with
 * `Math.round(abs * factor)` and #11 is open. One site covers both directions, since a Canonical
 * Amount of 1 at precision 7 is `1e-7`.
 */
const comparable = (text: string, digits: number): bigint | Drop => {
	const asDouble = String(Number(text))
	if (asDouble.includes("e")) return "exponent"
	if (asDouble !== text) return "inexact"
	const expected = referenceMinorUnits(Number(text), digits)
	if (expected === null) return "inexact"
	return (expected < 0n ? -expected : expected) > MAX_SAFE ? "out-of-range" : expected
}

/** One amount as a candidate in both signs. */
const bothSigns = (text: string, family: Family, tie = false): Candidate[] =>
	[text, `-${text}`].map((value) => ({ text: value, tie, family }))

/** Exact ties at every precision, both signs: `magnitude.000…5`. */
const tieCases = (digits: number): Candidate[] =>
	TIE_MAGNITUDES.flatMap((magnitude) =>
		bothSigns(`${magnitude}.${"0".repeat(digits)}5`, "tie", true),
	)

/** Just below (`…49`) and just above (`…51`) each tie, both signs, so the dropped tail decides. */
const nearTieCases = (digits: number): Candidate[] =>
	TIE_MAGNITUDES.flatMap((magnitude) => {
		const base = `${magnitude}.${"0".repeat(digits)}`
		return [49, 51].flatMap((tail) => bothSigns(`${base}${tail}`, "nearTie"))
	})

/**
 * Writes Minor Units as the shortest decimal at `digits` precision, dropping trailing zeros the way
 * `String(amount)` does, so the exactness guard keeps the row: `10^15` written as
 * `1.000000000000000` would never be compared at precision 15.
 */
const decimalText = (minorUnits: number, digits: number): string => {
	const padded = String(Math.abs(minorUnits)).padStart(digits + 1, "0")
	const splitAt = padded.length - digits
	const fraction = digits === 0 ? "" : padded.slice(splitAt).replace(/0+$/, "")
	const major = padded.slice(0, splitAt)
	const sign = minorUnits < 0 ? "-" : ""
	return fraction === "" ? `${sign}${major}` : `${sign}${major}.${fraction}`
}

/** ±1 around each band member and each bound neighbour, both signs: exact values, no rounding. */
const edgeCases = (digits: number): Candidate[] =>
	[
		...BAND_MINOR_UNITS.flatMap((minorUnits) => [minorUnits - 1, minorUnits, minorUnits + 1]).map(
			(value) => ({ value, family: "edge" as const }),
		),
		...BOUND_MINOR_UNITS.map((value) => ({ value, family: "bound" as const })),
	].flatMap(({ value, family }) => bothSigns(decimalText(value, digits), family))

/**
 * 17 seeded digits with the point placed so the scaled value is a 16-digit integer: the shape #6
 * double-rounded in. A row whose last digit is 5 is an exact tie at this precision.
 */
const longDecimalCases = (digits: number, sample: (max: number) => number): Candidate[] => {
	const splitAt = Math.max(1, SCALED_DIGITS - digits)
	const randomDigit = () => String(sample(9))
	const cases: Candidate[] = []
	for (let attempt = 0; attempt < LONG_DECIMALS; attempt += 1) {
		const digitsOnly = `${sample(8) + 1}${Array.from({ length: SCALED_DIGITS }, randomDigit).join("")}`
		const text = `${digitsOnly.slice(0, splitAt)}.${digitsOnly.slice(splitAt)}`
		const tie = digitsOnly.endsWith("5")
		cases.push(...bothSigns(text, "long", tie))
	}
	return cases
}

type Sweep = {
	readonly compared: ReadonlyMap<Family, number>
	readonly ties: number
	readonly exponentDropped: string[]
}

/** Runs candidates through `comparable`, tallying every drop and comparing the rows it keeps. */
const runSweep = (
	cases: Candidate[],
	digits: number,
	compare: (candidate: Candidate, expected: bigint) => void,
): Sweep => {
	const compared = new Map<Family, number>()
	const exponentDropped: string[] = []
	let ties = 0
	for (const candidate of cases) {
		const checked = comparable(candidate.text, digits)
		if (typeof checked !== "bigint") {
			if (checked === "exponent") exponentDropped.push(candidate.text)
			continue
		}
		compare(candidate, checked)
		compared.set(candidate.family, (compared.get(candidate.family) ?? 0) + 1)
		if (candidate.tie) ties += 1
	}
	return { compared, ties, exponentDropped }
}

/** Fails when a family compares fewer rows than its floor, rather than passing on the other families. */
const expectFamilyFloors = (sweep: Sweep, digits: number, families: Family[]): void => {
	for (const family of families) {
		const rows = sweep.compared.get(family) ?? 0
		expect(rows, `${family} rows at ${digits} digits`).toBeGreaterThanOrEqual(
			MIN_FAMILY_ROWS[family] ?? 0,
		)
	}
}

/** Compares every generated amount at one precision, both signs, against the reference. */
const sweepToMinorUnits = (digits: number): Sweep => {
	const sample = createSampler(LONG_DECIMAL_SEED + digits)
	const cases = [
		...tieCases(digits),
		...nearTieCases(digits),
		...edgeCases(digits),
		...longDecimalCases(digits, sample),
	]
	return runSweep(cases, digits, ({ text }, expected) => {
		const actual = toMinorUnits(Number(text), digits, "amount", { allowNegative: true })
		expect(BigInt(actual), `${text} at ${digits} digits`).toBe(expected)
	})
}

/** Canonical Amounts: the bound, its neighbours and seeded samples inside it, at every precision. */
const canonicalCases = (digits: number): Candidate[] => {
	const sample = createSampler(CANONICAL_SEED + digits)
	const boundary = [0, 1, CANONICAL_BOUND - 1, CANONICAL_BOUND]
	const sampled = Array.from({ length: CANONICAL_SAMPLES }, () => sample(CANONICAL_BOUND))
	return [...boundary, ...sampled].flatMap((minorUnits) =>
		(minorUnits > 0 ? [minorUnits, -minorUnits] : [minorUnits]).map((value) => ({
			text: String(fromMinorUnits(value, digits, "minorUnits", { allowNegative: true })),
			tie: false,
			family: "canonical" as const,
			minorUnits: value,
		})),
	)
}

/** Holds `fromMinorUnits` to the reference for Canonical Amounts at one precision. */
const sweepFromMinorUnits = (digits: number): Sweep =>
	runSweep(canonicalCases(digits), digits, (candidate, expected) => {
		const minorUnits = candidate.minorUnits ?? Number.NaN
		expect(expected, `${minorUnits} at ${digits} digits`).toBe(BigInt(minorUnits))
	})

describe("exact decimal reference", () => {
	it("is pinned by values decided before it judges the shipped code", () => {
		expect(referenceMinorUnits(2.5, 0)).toBe(3n)
		expect(referenceMinorUnits(-2.5, 0)).toBe(-3n)
		expect(referenceMinorUnits(0.1 + 0.2, 2)).toBe(30n)
		expect(referenceMinorUnits(1.005, 2)).toBe(101n)
	})

	it("holds toMinorUnits to it at every precision, ties included", () => {
		for (let digits = 0; digits <= 15; digits += 1) {
			const sweep = sweepToMinorUnits(digits)
			expectFamilyFloors(sweep, digits, ["edge", "bound", "long"])
			expect(sweep.ties, `exact ties at ${digits} digits`).toBeGreaterThanOrEqual(1)
			expect(sweep.exponentDropped, `e-notation rows at ${digits} digits`).toEqual([])
		}
	})

	it("holds fromMinorUnits to it for Canonical Amounts at every precision", () => {
		for (let digits = 0; digits <= 15; digits += 1) {
			const sweep = sweepFromMinorUnits(digits)
			// No tie floor here: a Canonical Amount is an exact multiple of its Minor Unit, so this
			// direction never rounds, and a tie is impossible by construction.
			expectFamilyFloors(sweep, digits, ["canonical"])
			for (const text of sweep.exponentDropped) expect(String(Number(text))).toContain("e")
			expect(
				sweep.exponentDropped.length,
				`e-notation rows at ${digits} digits`,
			).toBeLessThanOrEqual(MAX_EXPONENT_DROPS)
		}
	})
})
