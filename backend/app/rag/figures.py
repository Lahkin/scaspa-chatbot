"""Written forms of the same figure, across the languages the assistant answers in.

## Why this module exists

`CLAUDE.md` rule 10: money and time values in an answer must appear **verbatim**
in a retrieved chunk. Two layers enforce it — `find_unverified_figures` flags,
and `app.rag.grounding.check_numbers` replaces the answer outright.

Both were written against English answers, and both matched on the written
string. Nothing in `app/agent/prompts.py` says which language to answer in, so
the model mirrors the question's — and the assistant answers Spanish and French
questions fluently, retrieving correctly from the English knowledge base because
the embedding model is multilingual. Nobody specified that behaviour; it emerged.

**The guarantee did not follow it across.** Measured against the live service:

    kb-016 (English)  "8:00 am to 4:00 pm ... 6:00 am to 9:00 pm"
    French answer     "de 8 h a 16 h ... de 6 h a 21 h"
    reported          grounded: true, unverified_figures: none

`16 h` is `4:00 pm`. It is also the exact class of rewrite rule 10 exists to
catch — `answer.py` names *"reformat 04:04 as 'around 4am'"* as its target — and
the identical rewrite **is** caught in English, because `16:00` matches
`TIME_OF_DAY` and `16 h` matches nothing at all. A figure the pattern cannot see
is not checked and not flagged: it is reported as grounded.

The failure ran both ways. `XCD 44,44` — a correct amount in Spanish or French
decimal convention — *was* extracted, then compared verbatim against `XCD 44.44`
and flagged as unverifiable. So localised answers were silently unchecked where
it mattered and noisily wrong where it did not.

## What this module does, and the line it does not cross

It answers one question: **are these two strings the same figure?**

    16 h  ==  16:00  ==  4:00 pm      one instant, three conventions
    44,44 ==  44.44                    one amount, two conventions

It does **not** loosen the check. Equivalence is exact — same instant, same
amount to the cent. Every rewrite rule 10 was built to catch still fails, because
each changes the *value* rather than the notation:

    "about XCD 44" from "XCD 44.44"    44.00 != 44.44   flagged
    "around 4am"  from "04:04"          240 != 244       flagged
    "17 h"        from "4:00 pm"        1020 != 960      flagged

Notation is normalised. Value is never rounded, never tolerated, never inferred.

## Deliberately not handled: times and amounts written as words

`cuatro de la tarde` and `quatre heures de l'apres-midi` are not parsed, so they
are not checked. Recognising them needs a lexicon per language, and a wrong entry
would silently approve a figure — the failure this module exists to remove.

The honest mitigation is upstream: the system prompt requires figures to be
written as digits. That is enforceable and reviewable; a word list is neither.
"""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation

__all__ = [
    "LOCALISED_CLOCK",
    "clock_forms",
    "equivalent_forms",
    "money_forms",
    "parse_clock",
    "parse_money",
]


# ── Clock times ──────────────────────────────────────────────────────────────
#
# The French and Spanish convention writes the hour with an `h` separator —
# `16 h`, `16h`, `16 h 30`. Neither existing pattern matches it, which is the
# hole this module was written to close.
#
# `\d{1,2}` alone would swallow `24h`, and a tariff basis reads `per ft per 24h`.
# `parse_clock` rejects any hour above 23, so that string produces no time and no
# equivalence. Checked against the knowledge base: no row contains an `Nh` form
# at all, so this pattern's only realistic source is a genuine localised answer.
LOCALISED_CLOCK = re.compile(r"\b(\d{1,2})\s?h(?:\s?(\d{2}))?\b", re.IGNORECASE)

_CLOCK_24 = re.compile(r"^(\d{1,2}):(\d{2})(?::\d{2})?$")
_CLOCK_12 = re.compile(r"^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$", re.IGNORECASE)


def parse_clock(value: str) -> int | None:
    """Minutes since midnight, or None if `value` is not a clock time.

    Accepts the three conventions the product actually produces: 24-hour
    (`16:00`), 12-hour (`4:00 pm`, `4pm`) and the `h` separator (`16 h`,
    `16h30`). Returns None rather than guessing — an unparsed value keeps its
    original verbatim treatment.
    """
    text = " ".join(value.strip().split())

    m = _CLOCK_12.match(text)
    if m:
        hour = int(m.group(1))
        minute = int(m.group(2) or 0)
        if not (1 <= hour <= 12) or minute > 59:
            return None
        hour = hour % 12
        if m.group(3).lower() == "p":
            hour += 12
        return hour * 60 + minute

    m = _CLOCK_24.match(text)
    if m:
        hour, minute = int(m.group(1)), int(m.group(2))
        return hour * 60 + minute if hour <= 23 and minute <= 59 else None

    m = LOCALISED_CLOCK.fullmatch(text)
    if m:
        hour = int(m.group(1))
        minute = int(m.group(2) or 0)
        # 24 and above is not an hour. This is what keeps `per ft per 24h` from
        # being read as midnight and matched against a real midnight elsewhere.
        return hour * 60 + minute if hour <= 23 and minute <= 59 else None

    return None


def clock_forms(minutes: int) -> set[str]:
    """Every written form of one instant, across the three conventions."""
    hour, minute = divmod(minutes % (24 * 60), 60)
    forms = {f"{hour}:{minute:02d}", f"{hour:02d}:{minute:02d}"}

    # The `h` separator, with and without the space both languages permit.
    if minute:
        forms |= {f"{hour} h {minute:02d}", f"{hour}h{minute:02d}", f"{hour} h{minute:02d}"}
    else:
        forms |= {f"{hour} h", f"{hour}h"}

    # 12-hour, which is how the knowledge base itself is written.
    suffix = "am" if hour < 12 else "pm"
    twelve = hour % 12 or 12
    for space in (" ", ""):
        for written in (suffix, suffix.upper(), f"{suffix[0]}.{suffix[1]}."):
            forms.add(f"{twelve}:{minute:02d}{space}{written}")
            if not minute:
                forms.add(f"{twelve}{space}{written}")
    return forms


# ── Money ────────────────────────────────────────────────────────────────────

_MONEY = re.compile(
    r"^(?P<pre>XCD|EC\$|US\$|USD|EC|\$)?\s?"
    r"(?P<number>\d[\d.,]*)"
    r"\s?(?P<post>XCD|USD|EC dollars?|dollars?|cents?)?$",
    re.IGNORECASE,
)

# A comma or dot followed by exactly two digits at the end of the number is a
# decimal separator; anywhere else it groups thousands. `44,44` is four­teen
# hundredths short of forty-five, `12,407` is twelve thousand. Both conventions
# appear in this product's answers and they are told apart by position, not by
# guessing the locale.
_DECIMAL_TAIL = re.compile(r"[.,](\d{2})$")


def parse_money(value: str) -> tuple[str, Decimal] | None:
    """`(currency, amount)`, or None if `value` is not an amount.

    The currency token is upper-cased and kept: an amount is only equivalent to
    another amount in the same currency, because converting one is the failure
    `TariffQuoteRequest` refuses at the schema and rule 10 refuses here.
    """
    m = _MONEY.match(" ".join(value.strip().split()))
    if not m:
        return None

    number = m.group("number")
    tail = _DECIMAL_TAIL.search(number)
    if tail:
        whole = number[: tail.start()].replace(",", "").replace(".", "")
        digits = f"{whole or '0'}.{tail.group(1)}"
    else:
        digits = number.replace(",", "").replace(".", "")

    try:
        amount = Decimal(digits)
    except InvalidOperation:
        return None

    currency = (m.group("pre") or m.group("post") or "").strip().upper()
    currency = {
        "EC$": "XCD",
        "EC": "XCD",
        "US$": "USD",
        # A bare `$` names no currency on a two-currency island, and `dollars`
        # names one only in prose. Both normalise to empty rather than to a
        # guess: an amount with an unknown currency is compared on its number,
        # never silently promoted to XCD or USD.
        "$": "",
        "DOLLAR": "",
        "DOLLARS": "",
        "CENT": "",
        "CENTS": "",
    }.get(currency, currency)
    return currency, amount


def money_forms(currency: str, amount: Decimal) -> set[str]:
    """Every written form of one amount, in both decimal conventions."""
    quantised = f"{amount:.2f}"
    whole, _, cents = quantised.partition(".")
    numbers = {quantised, quantised.replace(".", ",")}
    if cents == "00":
        numbers.add(whole)

    forms: set[str] = set(numbers)
    tokens = [currency] if currency else []
    if currency == "XCD":
        tokens += ["EC$", "XCD"]
    for token in tokens:
        for number in numbers:
            forms.add(f"{token} {number}")
            forms.add(f"{token}{number}")
    return forms


def equivalent_forms(value: str) -> set[str]:
    """Written variants of `value` that denote the same figure.

    Returns just `{value}` when it is neither a time nor an amount, so callers
    fall back to their existing verbatim behaviour unchanged.
    """
    minutes = parse_clock(value)
    if minutes is not None:
        return clock_forms(minutes) | {value}

    money = parse_money(value)
    if money is not None and (money[0] or "." in value or "," in value):
        return money_forms(*money) | {value}

    return {value}
