import { describe, expect, it } from "bun:test"
import { fromMinorUnits, toMinorUnits } from "./index"

/**
 * A seeded differential block beside `minor-units.test.ts`: both conversions are held to an exact
 * decimal reference that shares no code with `scaleToMinorUnits`. It is a second file because
 * biome allows a test file 200 lines and this block does not fit in the one already there.
 */

const CANONICAL_BOUND = 10 ** 15
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)
/** 17-digit amounts tried per precision; the exactness guard keeps about a tenth of them. */
const LONG_DECIMALS = 640
/** Digits in the scaled column the long decimals land in, where #6 double-rounded. */
const SCALED_DIGITS = 16
/** Seeded Canonical Amounts per precision, beside the four boundary values. */
const CANONICAL_SAMPLES = 128
/** Floors that stop a guard from quietly emptying the sweep out. */
const MIN_ROWS = 50
/** The exclusion may drop the 18 Canonical Amount boundary rows below 1e-6 and little more. */
const MAX_EXPONENT_DROPS = 32
/** Exact ties at five magnitudes, both signs: the half Minor Unit the rule rounds away from zero. */
const TIE_MAGNITUDES = [1, 2, 123, 450_359_962_737, 9_007_199_254_740]
/** Powers of two in the 2^48..2^53 double-rounding band, and the Canonical Amount bound. */
const EDGE_MINOR_UNITS = [2 ** 48, 2 ** 49, 2 ** 50, 2 ** 51, 2 ** 52, 2 ** 53, CANONICAL_BOUND]

/**
 * Fixed-seed linear congruential generator, as in `minor-units.test.ts`, so nothing is random.
 * Seeds are arbitrary and offset by precision, so each precision walks its own sequence.
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

type Candidate = { readonly text: string; readonly tie: boolean }
type Drop = "exponent" | "unexact" | "out-of-range"

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
 * Applies the guards and returns the reference value, or why the row is dropped. A row is compared
 * only when `Number` reproduces its decimal text and the reference's magnitude after rounding is a
 * safe integer; the check is after rounding, because a magnitude below the limit can round past it.
 * TODO(#11): an `e`-notation amount is dropped here, because the shipped code scales it with
 * `Math.round(abs * factor)` and #11 is open. The exclusion covers both directions, since a
 * Canonical Amount of 1 at precision 7 is `1e-7`.
 */
const guard = (text: string, digits: number): bigint | Drop => {
	const asDouble = String(Number(text))
	if (asDouble.includes("e")) return "exponent"
	if (asDouble !== text) return "unexact"
	const expected = referenceMinorUnits(Number(text), digits)
	if (expected === null) return "unexact"
	return (expected < 0n ? -expected : expected) > MAX_SAFE ? "out-of-range" : expected
}

/** Exact ties at every precision, both signs: `magnitude.000…5`. */
const tieCases = (digits: number): Candidate[] =>
	TIE_MAGNITUDES.flatMap((magnitude) => {
		const text = `${magnitude}.${"0".repeat(digits)}5`
		return [
			{ text, tie: true },
			{ text: `-${text}`, tie: true },
		]
	})

/** Just below (`…49`) and just above (`…51`) each tie, both signs, so the dropped tail decides. */
const nearTieCases = (digits: number): Candidate[] =>
	TIE_MAGNITUDES.flatMap((magnitude) => {
		const base = `${magnitude}.${"0".repeat(digits)}`
		return [`${base}49`, `${base}51`, `-${base}49`, `-${base}51`].map((text) => ({
			text,
			tie: false,
		}))
	})

/** Places the decimal point in an integer's digits, left-padding to reach `digits` decimals. */
const decimalText = (minorUnits: number, digits: number): string => {
	const padded = String(minorUnits).padStart(digits + 1, "0")
	const splitAt = padded.length - digits
	return digits === 0 ? padded : `${padded.slice(0, splitAt)}.${padded.slice(splitAt)}`
}

/** ±1 around each band edge and the bound, both signs, as exact values: scaling without rounding. */
const edgeCases = (digits: number): Candidate[] =>
	EDGE_MINOR_UNITS.flatMap((minorUnits) => [minorUnits - 1, minorUnits, minorUnits + 1]).flatMap(
		(value) => {
			const text = decimalText(value, digits)
			return [
				{ text, tie: false },
				{ text: `-${text}`, tie: false },
			]
		},
	)

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
		cases.push({ text, tie }, { text: `-${text}`, tie })
	}
	return cases
}

type Sweep = {
	readonly attempted: number
	checked: number
	ties: number
	unexact: number
	outOfRange: number
	readonly exponentDropped: string[]
}

const createSweep = (attempted: number): Sweep => ({
	attempted,
	checked: 0,
	ties: 0,
	unexact: 0,
	outOfRange: 0,
	exponentDropped: [],
})

/** Runs one candidate through the guards, tallying every drop and comparing the rows it keeps. */
const guardCase = (
	sweep: Sweep,
	{ text, tie }: Candidate,
	digits: number,
	compare: (expected: bigint) => void,
): void => {
	const guarded = guard(text, digits)
	if (typeof guarded === "bigint") {
		compare(guarded)
		sweep.checked += 1
		if (tie) sweep.ties += 1
	} else if (guarded === "exponent") sweep.exponentDropped.push(text)
	else if (guarded === "unexact") sweep.unexact += 1
	else sweep.outOfRange += 1
}

/** Candidates the sweep compared or accounted for; it must equal the number it attempted. */
const accounted = (sweep: Sweep): number =>
	sweep.checked + sweep.unexact + sweep.outOfRange + sweep.exponentDropped.length

/** Compares every generated amount at one precision, both signs, against the reference. */
const sweepToMinorUnits = (digits: number): Sweep => {
	const sample = createSampler(0x1000 + digits)
	const cases = [
		...tieCases(digits),
		...nearTieCases(digits),
		...edgeCases(digits),
		...longDecimalCases(digits, sample),
	]
	const sweep = createSweep(cases.length)
	for (const candidate of cases) {
		guardCase(sweep, candidate, digits, (expected) => {
			const actual = toMinorUnits(Number(candidate.text), digits, "amount", {
				allowNegative: true,
			})
			expect(BigInt(actual), `${candidate.text} at ${digits} digits`).toBe(expected)
		})
	}
	return sweep
}

/** Canonical Amounts: the bound, its neighbours and seeded samples inside it, at every precision. */
const canonicalCases = (digits: number): number[] => {
	const sample = createSampler(0x2000 + digits)
	const boundary = [0, 1, CANONICAL_BOUND - 1, CANONICAL_BOUND]
	const sampled = Array.from({ length: CANONICAL_SAMPLES }, () => sample(CANONICAL_BOUND))
	return [...boundary, ...sampled].flatMap((minorUnits) =>
		minorUnits > 0 ? [minorUnits, -minorUnits] : [minorUnits],
	)
}

/** Holds `fromMinorUnits` to the reference for Canonical Amounts at one precision. */
const sweepFromMinorUnits = (digits: number): Sweep => {
	const cases = canonicalCases(digits)
	const sweep = createSweep(cases.length)
	for (const minorUnits of cases) {
		const amount = fromMinorUnits(minorUnits, digits, "minorUnits", { allowNegative: true })
		guardCase(sweep, { text: String(amount), tie: false }, digits, (expected) => {
			expect(expected, `${amount} at ${digits} digits`).toBe(BigInt(minorUnits))
		})
	}
	return sweep
}

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
			expect(accounted(sweep), `candidates at ${digits} digits`).toBe(sweep.attempted)
			expect(sweep.checked, `rows at ${digits} digits`).toBeGreaterThanOrEqual(MIN_ROWS)
			expect(sweep.ties, `exact ties at ${digits} digits`).toBeGreaterThanOrEqual(1)
			expect(sweep.exponentDropped, `e-notation rows at ${digits} digits`).toEqual([])
		}
	})

	it("holds fromMinorUnits to it for Canonical Amounts at every precision", () => {
		for (let digits = 0; digits <= 15; digits += 1) {
			const sweep = sweepFromMinorUnits(digits)
			expect(accounted(sweep), `Canonical Amounts at ${digits} digits`).toBe(sweep.attempted)
			expect(sweep.checked, `rows at ${digits} digits`).toBeGreaterThanOrEqual(MIN_ROWS)
			// No tie floor here: a Canonical Amount is an exact multiple of its Minor Unit, so this
			// direction never rounds, and a tie is impossible by construction.
			for (const text of sweep.exponentDropped) expect(String(Number(text))).toContain("e")
			expect(
				sweep.exponentDropped.length,
				`e-notation rows at ${digits} digits`,
			).toBeLessThanOrEqual(MAX_EXPONENT_DROPS)
		}
	})
})
