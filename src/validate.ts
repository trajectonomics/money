import { MoneyValidationError } from "./errors"

/**
 * Options controlling monetary validation.
 */
export interface ValidateAmountOptions {
	/** If true, negative values are accepted (e.g. a refund balance). */
	readonly allowNegative?: boolean
}

/**
 * Highest decimal precision the conversions accept.
 *
 * Math: `10 ** 15` is the largest power of ten a double holds exactly, so any larger precision
 * could not be scaled without losing digits.
 * Units: count of fractional decimal digits.
 */
export const MAX_DIGITS = 15

/**
 * Validates a currency precision supplied by the caller.
 *
 * Purpose: Rejects an out-of-range precision with a typed error instead of letting a raw
 * `RangeError` escape from `toFixed` or a silent mis-scaling from `10 ** digits`.
 * Math: Requires `Number.isSafeInteger(digits)` and `0 <= digits <= MAX_DIGITS`.
 * Units: count of fractional decimal digits.
 * Throws: MoneyValidationError when the count is fractional, negative, or above MAX_DIGITS.
 *
 * @param digits Fractional decimal digits of the currency, supplied by the caller.
 * @param field Diagnostic field name reported on failure.
 */
export function validateDigits(digits: number, field = "digits"): void {
	if (!Number.isSafeInteger(digits)) {
		throw new MoneyValidationError(field, digits, "Precision must be a safe integer")
	}
	if (digits < 0 || digits > MAX_DIGITS) {
		throw new MoneyValidationError(
			field,
			digits,
			`Precision must be between 0 and ${MAX_DIGITS} digits`,
		)
	}
}

/**
 * Validates a monetary input against numerical boundaries.
 *
 * Math: Rejects `NaN`, non-finite values and negatives unless `allowNegative` is set.
 * Units: major units or integer Minor Units, depending on the caller.
 * Throws: MoneyValidationError on any violation.
 *
 * @param value Amount to validate.
 * @param field Diagnostic field name reported on failure.
 * @param options Validation options.
 */
export function validateMonetaryAmount(
	value: number,
	field: string,
	options?: ValidateAmountOptions,
): void {
	if (Number.isNaN(value)) {
		throw new MoneyValidationError(field, value, "Value cannot be NaN")
	}
	if (!Number.isFinite(value)) {
		throw new MoneyValidationError(field, value, "Value must be a finite number")
	}
	if (!options?.allowNegative && value < 0) {
		throw new MoneyValidationError(field, value, "Value cannot be negative")
	}
}

/**
 * Validates that an amount is an exact integer number of Minor Units.
 *
 * Math: Requires a finite, sign-allowed `Number.isSafeInteger`.
 * Units: integer Minor Units.
 * Throws: MoneyValidationError when the amount is not a safe integer.
 *
 * @param minorUnits Integer Minor Units to validate.
 * @param field Diagnostic field name reported on failure.
 * @param options Validation options.
 */
export function validateIntegerMinorUnits(
	minorUnits: number,
	field: string,
	options?: ValidateAmountOptions,
): void {
	validateMonetaryAmount(minorUnits, field, options)
	if (!Number.isSafeInteger(minorUnits)) {
		throw new MoneyValidationError(field, minorUnits, "Minor units amount must be a safe integer")
	}
}
