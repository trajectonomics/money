/**
 * Error thrown when a monetary value violates a decimal-scaling invariant.
 *
 * Purpose: One failure type for both conversions, carrying the diagnostic field, the offending
 * value and the reason, so each consumer can map it onto the error class its own API promises.
 * Units: `value` is whatever the caller supplied - major units, integer Minor Units, or a digit count.
 */
export class MoneyValidationError extends Error {
	readonly field: string
	readonly value: unknown
	readonly reason: string

	constructor(field: string, value: unknown, reason: string) {
		super(`Money validation error on field '${field}': ${reason} (received: ${String(value)})`)
		this.name = "MoneyValidationError"
		this.field = field
		this.value = value
		this.reason = reason
		Object.setPrototypeOf(this, MoneyValidationError.prototype)
	}
}
