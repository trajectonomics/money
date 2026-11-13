import { MoneyValidationError } from "./errors"
import {
	type ValidateAmountOptions,
	validateDigits,
	validateIntegerMinorUnits,
	validateMonetaryAmount,
} from "./validate"

/**
 * Scales an absolute amount by `precision` decimal places and rounds it half away from zero.
 *
 * Math: The integer part of the expanded decimal string is exact below 2^53, and its first
 * dropped digit decides the round, so a re-parsed double that can land on `.5` and round a
 * second time never decides the result. A scientific-notation amount is scaled directly.
 * Units: input in major units, output as rounded integer Minor Units.
 */
function scaleToMinorUnits(abs: number, precision: number): number {
	const factor = 10 ** precision
	if (String(abs).includes("e")) {
		return Math.round(abs * factor)
	}
	const parts = String(abs).split(".")
	const intPart = parts[0] ?? "0"
	const decPart = (parts[1] ?? "").padEnd(precision, "0")
	const whole = intPart + decPart.slice(0, precision)
	const firstDropped = decPart.charAt(precision)
	const roundsUp = firstDropped !== "" && firstDropped >= "5"
	return Number(whole) + (roundsUp ? 1 : 0)
}

/**
 * Converts a major-unit amount to integer Minor Units.
 *
 * Purpose: Exact major-to-Minor conversion for any currency, with precision supplied by the caller.
 * Math: Expands the shortest decimal representation, decides the rounding from its first dropped
 * digit, and rounds half away from zero, so neither binary float noise (`1.005 * 100`) nor a
 * re-parsed double decides the result; scientific notation is scaled directly.
 * Units: input in major units, output as integer Minor Units.
 * Throws: MoneyValidationError when `digits` is out of range, the amount is `NaN`, infinite or
 * negative without `allowNegative`, or the result leaves the safe integer range.
 *
 * @param amount Amount in major units.
 * @param digits Fractional decimal digits of the currency (0 for JPY, 2 for USD, 3 for KWD).
 * @param field Diagnostic field name reported on failure.
 * @param options Validation options.
 * @returns Amount as an integer number of Minor Units.
 * @example toMinorUnits(1.005, 2) // 101 (101 cents, not 100)
 */
export function toMinorUnits(
	amount: number,
	digits: number,
	field = "amount",
	options?: ValidateAmountOptions,
): number {
	validateDigits(digits)
	validateMonetaryAmount(amount, field, options)
	const sign = amount < 0 ? -1 : 1
	const result = sign * scaleToMinorUnits(Math.abs(amount), digits) + 0
	if (!Number.isSafeInteger(result)) {
		throw new MoneyValidationError(
			field,
			amount,
			"Conversion to minor units failed or exceeded safe integer bounds",
		)
	}
	return result
}

/**
 * Converts integer Minor Units back to a major-unit amount.
 *
 * Purpose: Inverse of `toMinorUnits`, producing the shortest decimal a double can carry.
 * Math: Divides by `10 ** digits` and fixes the result to `digits` decimals, which also
 * normalises `-0` to `+0`.
 * Units: input as integer Minor Units, output in major units.
 * Throws: MoneyValidationError when `digits` is out of range, or the input is not a safe integer.
 *
 * @param minorUnits Integer Minor Units.
 * @param digits Fractional decimal digits of the currency.
 * @param field Diagnostic field name reported on failure.
 * @param options Validation options.
 * @returns Amount in major units.
 * @example fromMinorUnits(1055, 2) // 10.55
 */
export function fromMinorUnits(
	minorUnits: number,
	digits: number,
	field = "minorUnits",
	options?: ValidateAmountOptions,
): number {
	validateDigits(digits)
	validateIntegerMinorUnits(minorUnits, field, options)
	const factor = 10 ** digits
	const sign = minorUnits < 0 ? -1 : 1
	const abs = Math.abs(minorUnits)
	return sign * Number((abs / factor).toFixed(digits)) + 0
}
