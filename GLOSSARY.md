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
A major-unit value produced by `fromMinorUnits`, which converts back to the same integer Minor Units under either implementation. Amounts crossing a package boundary should be canonical.
_Avoid_: Rounded money, clean float
