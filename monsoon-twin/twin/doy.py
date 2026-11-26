"""Day-of-year handling from `doy_sincos`. No calendar dates anywhere in this file.

The API sends [sin(2 pi n / 365), cos(2 pi n / 365)] for the LAST input day, where n is the day of year.
We recover n with atan2 and work on a nominal 365-day calendar.

Climatology tables have 366 slots: slot 0 is the first day of January and slot 59 is the 29th of February,
so every calendar day has its own slot. On the nominal calendar, day n (1..365) maps to slot n-1 for
n <= 59 and to slot n afterwards (the leap slot 59 is skipped).

ASSUMPTION (unverified against hidden data): in a leap year, a date after February sits one nominal day
earlier than its true slot. The climatology is smoothed over 15 days, so a one-day shift is small, but it
is a known approximation. The sin/cos pair cannot tell us whether the year is a leap year.
"""
from __future__ import annotations

import math

N_NOMINAL = 365
N_SLOTS = 366
_LEAP_SLOT = 59
_UNIT_TOL = 0.05  # |sin^2 + cos^2 - 1| allowed before the pair is rejected as not a sin/cos pair


def from_sincos(sin_v: float, cos_v: float) -> int:
    """Nominal day of year (1..365) from [sin, cos] of 2 pi n / 365."""
    s, c = float(sin_v), float(cos_v)
    if not (math.isfinite(s) and math.isfinite(c)):
        raise ValueError("doy_sincos must be finite")
    if abs(s * s + c * c - 1.0) > _UNIT_TOL:
        raise ValueError(f"doy_sincos is not a sin/cos pair (sin^2 + cos^2 = {s * s + c * c:.3f})")
    angle = math.atan2(s, c) % (2.0 * math.pi)
    n = int(round(angle / (2.0 * math.pi) * N_NOMINAL))
    return N_NOMINAL if n == 0 else n


def advance(n: int, k: int) -> int:
    """Nominal day of year k days after day n (wraps around the year)."""
    return (n - 1 + k) % N_NOMINAL + 1


def clim_slot(n: int) -> int:
    """Climatology slot (0..365) for nominal day n (1..365)."""
    if not 1 <= n <= N_NOMINAL:
        raise ValueError(f"nominal day of year must be 1..{N_NOMINAL}, got {n}")
    return n - 1 if n <= _LEAP_SLOT else n
