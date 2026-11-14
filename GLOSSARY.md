# Money

Decimal scaling for monetary values. The smallest indivisible integer subunit of an ISO 4217 currency (such as `satang` for `THB` or `cent` for `USD`) in which all monetary arithmetic is performed.

## Core Concepts

**Minor Unit**:
The smallest indivisible integer subunit of a currency, in which monetary arithmetic is exact. Every conversion here targets it.
_Avoid_: Decimal amount, float, scalar

**Currency Precision**:
The number of fractional decimal digits a currency's Minor Unit implies - 0 for `JPY`, 2 for `USD`, 3 for `KWD` - supplied to these functions as `digits`. It is caller data, never resolved from the runtime.
_Avoid_: Scale, exponent, decimal places

**Canonical Amount**:
A major-unit value produced by `fromMinorUnits` that `toMinorUnits` converts back to the same integer Minor Units: every safe integer at Currency Precision 0, and an absolute Minor Units value of at most 10^15 at precision 1 through 15. Above that bound the returned value is not canonical, so a boundary crossing keeps the integer Minor Units.
_Avoid_: Rounded money, clean float
