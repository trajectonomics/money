import { MoneyValidationError } from "./errors"
import {
	type ValidateAmountOptions,
	validateDigits,
	validateIntegerMinorUnits,
	validateMonetaryAmount,
} from "./validate"

/**
 * Scales an absolute amount by `digits` fractional decimal digits and rounds it half away from
 * zero.
 *
 * Math: The integer part of the scaled value is exact below 2^53, and the first digit beyond it
 * decides the round. `toMinorUnits` states the public guarantee this implements.
 * Units: input in major units, output as rounded integer Minor Units.
 */
function scaleToMinorUnits(abs: number, digits: number): number {
	const factor = 10 ** digits
	if (String(abs).includes("e")) {
		return Math.round(abs * factor)
	}
	const parts = String(abs).split(".")
	const intPart = parts[0] ?? "0"
	const decPart = (parts[1] ?? "").padEnd(digits, "0")
	const whole = intPart + decPart.slice(0, digits)
	const firstDropped = decPart.at(digits)
	const roundsUp = firstDropped !== undefined && Number(firstDropped) >= 5
	return Number(whole) + (roundsUp ? 1 : 0)
}

/**
 * Converts a major-unit amount to integer Minor Units.
 *
 * Purpose: Exact major-to-Minor conversion for any currency, with precision supplied by the caller.
 * Math: Expands the shortest decimal representation and rounds half away from zero on those
 * digits, so binary float multiplication (`1.005 * 100`) and a re-parsed double play no part in
 * a decimal amount's result. A scientific-notation amount is scaled directly.
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
 * Purpose: Major-unit form of integer Minor Units. `toMinorUnits` converts it back for every
 * safe integer at precision 0, and when the absolute value is at most 10^15 at precision 1
 * through 15. A larger result is still returned and is not a Canonical Amount.
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
