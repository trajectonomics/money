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
/** Seeded tie and near-tie mantissas tried per precision. */
const TIE_ATTEMPTS = 64
/** Significant digits in a tie mantissa; 17 does not round-trip at the low precisions. */
const TIE_DIGITS = 16

// A tie at `digits` is a decimal whose last written digit is the 5 that gets dropped: the mantissa
// is seeded to `TIE_DIGITS` significant digits ending in `tail`, and the point placed so exactly
// `digits + 1` decimals follow it. A short decimal cannot be a tie above precision 14 anyway:
// `1.0000000000000005` needs 17 significant digits, so `String(Number(...))` returns
// `1.0000000000000004` and the guard must reject that row as a near-tie.
const tieText = (seed: number, digits: number, tail: string): string => {
	const sample = createSampler(seed)
	const head = String(sample(8) + 1)
	const body = Array.from({ length: TIE_DIGITS - 2 }, () => String(sample(9))).join("")
	const mantissa = `${head}${body}${tail}`
	const intLength = mantissa.length - (digits + 1)
	return intLength <= 0
		? `0.${"0".repeat(-intLength)}${mantissa}`
		: `${mantissa.slice(0, intLength)}.${mantissa.slice(intLength)}`
}

/** Powers of two in the 2^48..2^53 double-rounding band, where the old code double-rounded. */
const BAND_MINOR_UNITS = [2 ** 48, 2 ** 49, 2 ** 50, 2 ** 51, 2 ** 52, 2 ** 53]
/** Both sides of the Canonical Amount bound: the guarantee holds below it and is pinned above it. */
const BOUND_MINOR_UNITS = [CANONICAL_BOUND - 1, CANONICAL_BOUND, CANONICAL_BOUND + 1]
/** The exclusion may drop the 18 Canonical Amount boundary rows below 1e-6 and little more. */
const MAX_EXPONENT_DROPS = 32
/** `String` writes `e` below 1e-6 and at or above 1e21. */
const writesWithExponent = (amount: number): boolean =>
	Math.abs(amount) < 1e-6 || Math.abs(amount) >= 1e21
/** Seed offsets, arbitrary but fixed, so each family walks its own sequence. */
const LONG_DECIMAL_SEED = 0x1000
const CANONICAL_SEED = 0x2000
const TIE_SEED = 0x3000

type Family = "tie" | "nearTie" | "edge" | "bound" | "long" | "canonical"
// `minorUnits` is populated in the `fromMinorUnits` direction only.
type Candidate = { readonly text: string; readonly family: Family; readonly minorUnits?: number }
type Drop = "exponent" | "inexact" | "out-of-range"

// Rows each family must compare at every precision, and every family has one: a single total floor
// cannot see a family go quiet. Padded decimals once hid the exact Canonical Amount bound from
// precisions 1 through 15, and a `tie` family of short decimals was empty at 15 while the
// long-decimal rows satisfied a lone `ties >= 1`.
const MIN_FAMILY_ROWS: Record<Family, number> = {
	tie: 6,
	nearTie: 8,
	edge: 28,
	bound: 6,
	long: 70,
	canonical: 250,
}

// Fixed-seed linear congruential generator, as in `minor-units.test.ts`, so nothing is random. A
// copy, not an import: importing that file runs its tests, and a shared module would be a new `src/`
// file the 100% coverage gate counts.
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

// Returns the reference value for a row, or why it cannot be compared. A row is compared only when
// `Number` reproduces its decimal text and the reference's magnitude after rounding is a safe
// integer; the check is after rounding, since a magnitude below the limit can round one past it.
// TODO(#11): an `e`-notation amount is dropped here, because the shipped code scales it with
// `Math.round(abs * factor)` and #11 is open. One site covers both directions, since a Canonical
// Amount of 1 at precision 7 is `1e-7`.
const comparable = (text: string, digits: number): bigint | Drop => {
	const asDouble = String(Number(text))
	if (asDouble.includes("e")) return "exponent"
	if (asDouble !== text) return "inexact"
	const expected = referenceMinorUnits(Number(text), digits)
	if (expected === null) return "inexact"
	return (expected < 0n ? -expected : expected) > MAX_SAFE ? "out-of-range" : expected
}

/** One amount as a candidate in both signs. */
const bothSigns = (text: string, family: Family): Candidate[] =>
	[text, `-${text}`].map((value) => ({ text: value, family }))

/**
 * Exact ties: a 16-digit mantissa ending in 5, its point placed so exactly one digit is dropped at
 * this precision. A short decimal cannot be a tie above precision 14: `1.0000000000000005` needs 17
 * significant digits, so `String(Number(...))` returns `1.0000000000000004` and the row is a
 * near-tie the guard must reject. The seeded mantissa is what keeps this family non-empty at 15.
 */
const tieCases = (digits: number): Candidate[] =>
	Array.from({ length: TIE_ATTEMPTS }, (_, attempt) =>
		bothSigns(tieText(TIE_SEED + digits * TIE_ATTEMPTS + attempt, digits, "5"), "tie"),
	).flat()

/**
 * Just below and just above each tie, both signs, so the dropped tail decides: same mantissa with
 * the final 5 moved down to 4 or up to 6.
 */
const nearTieCases = (digits: number): Candidate[] =>
	Array.from({ length: TIE_ATTEMPTS }, (_, attempt) =>
		["4", "6"].flatMap((tail) =>
			bothSigns(tieText(TIE_SEED + digits * TIE_ATTEMPTS + attempt, digits, tail), "nearTie"),
		),
	).flat()

// Writes Minor Units as the shortest decimal at `digits` precision, dropping trailing zeros the way
// `String(amount)` does, so the exactness guard keeps the row: `10^15` written as
// `1.000000000000000` would never be compared at precision 15.
const decimalText = (minorUnits: number, digits: number): string => {
	const padded = String(Math.abs(minorUnits)).padStart(digits + 1, "0")
	const splitAt = padded.length - digits
	const fraction = digits === 0 ? "" : padded.slice(splitAt).replace(/0+$/, "")
	const major = padded.slice(0, splitAt)
	return `${minorUnits < 0 ? "-" : ""}${major}${fraction ? `.${fraction}` : ""}`
}

/** ±1 around each band member and each bound neighbour, both signs: exact values, no rounding. */
const edgeCases = (digits: number): Candidate[] =>
	[
		...BAND_MINOR_UNITS.flatMap((minorUnits) => [minorUnits - 1, minorUnits, minorUnits + 1]).map(
			(value) => ({ value, family: "edge" as const }),
		),
		...BOUND_MINOR_UNITS.map((value) => ({ value, family: "bound" as const })),
	].flatMap(({ value, family }) => bothSigns(decimalText(value, digits), family))

// 17 seeded digits with the point placed so the scaled value is a 16-digit integer: the shape #6
// double-rounded in.
const longDecimalCases = (digits: number, sample: (max: number) => number): Candidate[] => {
	const splitAt = Math.max(1, SCALED_DIGITS - digits)
	const randomDigit = () => String(sample(9))
	const cases: Candidate[] = []
	for (let attempt = 0; attempt < LONG_DECIMALS; attempt += 1) {
		const digitsOnly = `${sample(8) + 1}${Array.from({ length: SCALED_DIGITS }, randomDigit).join("")}`
		const text = `${digitsOnly.slice(0, splitAt)}.${digitsOnly.slice(splitAt)}`
		cases.push(...bothSigns(text, "long"))
	}
	return cases
}

type Sweep = {
	readonly compared: ReadonlyMap<Family, number>
	readonly exponentDropped: string[]
}

const runSweep = (
	cases: Candidate[],
	digits: number,
	compare: (candidate: Candidate, expected: bigint) => void,
): Sweep => {
	const compared = new Map<Family, number>()
	const exponentDropped: string[] = []
	for (const candidate of cases) {
		const checked = comparable(candidate.text, digits)
		if (typeof checked !== "bigint") {
			if (checked === "exponent") exponentDropped.push(candidate.text)
			continue
		}
		compare(candidate, checked)
		compared.set(candidate.family, (compared.get(candidate.family) ?? 0) + 1)
	}
	return { compared, exponentDropped }
}

/** Fails when a family compares fewer rows than its floor, not when the other families pad the total. */
const expectFamilyFloors = (sweep: Sweep, digits: number, families: Family[]): void => {
	for (const family of families)
		expect(
			sweep.compared.get(family) ?? 0,
			`${family} rows at ${digits} digits`,
		).toBeGreaterThanOrEqual(MIN_FAMILY_ROWS[family])
}

/** Compares every generated amount at one precision, both signs, against the reference. */
const sweepToMinorUnits = (digits: number): Sweep => {
	const cases = [
		...tieCases(digits),
		...nearTieCases(digits),
		...edgeCases(digits),
		...longDecimalCases(digits, createSampler(LONG_DECIMAL_SEED + digits)),
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
			expectFamilyFloors(sweep, digits, ["tie", "nearTie", "edge", "bound", "long"])
			expect(sweep.exponentDropped, `e rows at ${digits}`).toEqual([])
		}
	})

	it("holds fromMinorUnits to it for Canonical Amounts at every precision", () => {
		for (let digits = 0; digits <= 15; digits += 1) {
			const sweep = sweepFromMinorUnits(digits)
			// No tie floor: a Canonical Amount is an exact multiple of its Minor Unit, so this
			// direction never rounds and a tie is impossible. The dropped rows are checked against the
			// documented `String` thresholds, not the guard's own predicate.
			expectFamilyFloors(sweep, digits, ["canonical"])
			expect(sweep.exponentDropped.length, `e rows at ${digits}`).toBeLessThanOrEqual(
				MAX_EXPONENT_DROPS,
			)
			for (const dropped of sweep.exponentDropped)
				expect(writesWithExponent(Number(dropped)), `${dropped} at ${digits}`).toBe(true)
		}
	})
})
