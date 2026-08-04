"""The fee calculator.

## Read this before changing anything here

`app/agent/prompts.py` rule 4 tells the assistant: *"Never state a fee, charge,
rate, fare or tariff that is not written in the context. **Never estimate
one.**"* CLAUDE.md rule 10 says money in an answer must appear verbatim in a
retrieved chunk. This module produces a figure that appears in no source.

That is a deliberate, recorded exception (docs/decisions.md 0020), and it is
narrow. Three properties keep it from eating the rule it sits next to:

1. **Every rate is published.** The calculator never invents a rate. It looks
   one up by code, and if the code is not in the tariff table the line is
   omitted and reported in `unpriced` rather than guessed at.
2. **The arithmetic is code, not a model.** No LLM is involved at any point in
   this file. The same inputs give the same total, and the total can be checked
   by hand from the line items, which are all shown.
3. **The total is labelled derived and carries a mandatory disclaimer** naming
   what it is not: not an invoice, not a customs assessment, not a valuation.
   `TariffQuote.derived` is a `Literal[True]` and the disclaimer is validated
   non-empty, so neither can be dropped by a caller in a hurry.

The assistant may *show* this card. It still may not say the total in prose —
see the SCHEDULES-and-TARIFFS note in `prompts.py`. The distinction matters: a
card carries its own caption everywhere it goes, and a sentence does not.
"""

import logging

from app.ops.source import OpsSource
from app.schemas import TariffLineItem, TariffQuoteRequest, TariffRow

logger = logging.getLogger(__name__)

# Codes the calculator knows how to apply, per category. Kept here rather than
# inferred from the table, because "which charges apply to this movement" is a
# rule about SCASPA's tariff structure, not something derivable from a rate.
#
# ── THESE AND THE TARIFF TABLE ARE ONE CHANGE ────────────────────────────────
#
# `build_quote` looks each of these up in `source.tariffs()` by exact code. A
# code renamed in `app/ops/fixtures.py` and not here — or here and not there —
# does not raise, does not fail a type check and does not fail a test that only
# asserts the quote is well-formed. Every line falls into `unpriced`, the
# subtotal becomes `0.00`, and the client renders §5.11's "Nothing to charge for
# those figures" looking entirely healthy.
#
# That is why this pairing ships as one unit (CU-1 in
# `docs/implementation-plan.md`) and why `test_a_cargo_quote_prices_every_line`
# asserts a non-empty result rather than a well-formed one.
DOCKAGE_CODE = "DCK-FT"
DOCKAGE_CRUISE_CODE = "DCK-CR"
PILOTAGE_CODE = "PIL-E"
HARBOUR_DUES_CODE = "HBR-C"
WHARFAGE_20FT_CODE = "WHF-20"
WHARFAGE_40FT_CODE = "WHF-40"
HANDLING_CODE = "HND-C"
STORAGE_CODE = "STO-D"

# ── Vessel type, and why it is finally readable ──────────────────────────────
#
# `vessel_type` was accepted by the API and read by nothing, so §5.10's select
# was drawn disabled: an enabled control that changed no figure would be the
# product implying a rule it does not apply, and there was no published list of
# types to put in it either.
#
# **Both halves are now answerable from the schedule itself.** It publishes two
# dockage rates that differ only by vessel type — `DCK-FT` for a commercial
# vessel and `DCK-CR` for a cruise vessel — so the rate varies, and the list of
# types is the set the table distinguishes rather than a set invented here. Add
# a third published dockage row and it belongs in this map; do not add one
# without.
#
# An unrecognised or absent type prices as commercial. That is the schedule's
# own default rather than a guess: `DCK-FT` is the rate for a vessel the
# schedule does not single out.
DOCKAGE_BY_VESSEL_TYPE: dict[str, str] = {
    "commercial": DOCKAGE_CODE,
    "cruise": DOCKAGE_CRUISE_CODE,
}

#: The values the client may send, for the select §5.10 draws.
VESSEL_TYPES: tuple[str, ...] = tuple(DOCKAGE_BY_VESSEL_TYPE)


def _money(value: float) -> float:
    """Two decimal places, rounded once, at the end of each line.

    Rounding per line rather than only at the total is what makes the printed
    lines add up to the printed total. A reader who checks the arithmetic and
    finds it off by a cent has been given a reason to distrust the whole card.
    """
    return round(value + 1e-9, 2)


def _line(
    row: TariffRow,
    quantity: float,
    quantity_label: str,
    label: str | None = None,
) -> TariffLineItem:
    return TariffLineItem(
        code=row.code,
        label=label or row.service,
        basis=row.basis,
        rate=row.amount,
        quantity=quantity,
        quantity_label=quantity_label,
        amount=_money(row.amount * quantity),
        kb_id=row.kb_id,
    )


def _plural(count: float, singular: str) -> str:
    whole = int(count) if float(count).is_integer() else count
    return f"{whole} {singular}{'' if whole == 1 else 's'}"


def build_quote(
    request: TariffQuoteRequest,
    source: OpsSource,
) -> tuple[list[TariffLineItem], list[str]]:
    """Price a request against the published table.

    Returns `(line_items, unpriced_codes)`. A code in `unpriced` was applicable
    to the request but absent from the tariff table — reported rather than
    silently skipped, because a total quietly missing its largest component is
    worse than no total.
    """
    table = {row.code: row for row in source.tariffs()}
    lines: list[TariffLineItem] = []
    unpriced: list[str] = []

    def rate(code: str) -> TariffRow | None:
        row = table.get(code)
        if row is None:
            unpriced.append(code)
        return row

    # ── Maritime: charges that follow the vessel ─────────────────────────────
    # `vessel_dues`, formerly `maritime`. The rename is toward accuracy: this
    # branch prices dockage, pilotage and harbour dues, which is what vessel
    # dues are, and §5.9's chip has always been labelled that way.
    if request.category == "vessel_dues":
        length = request.length_ft or 0
        days = request.stay_days or 0
        # The published rate for this vessel type, falling back to the
        # commercial one the schedule applies to a vessel it does not single out.
        dockage_code = DOCKAGE_BY_VESSEL_TYPE.get(
            (request.vessel_type or "").strip().lower(), DOCKAGE_CODE
        )
        if length > 0 and days > 0 and (row := rate(dockage_code)):
            lines.append(
                _line(
                    row,
                    quantity=length * days,
                    quantity_label=f"{_plural(length, 'ft')} × {_plural(days, 'day')}",
                )
            )
        if (row := rate(PILOTAGE_CODE)) is not None:
            lines.append(_line(row, quantity=1, quantity_label="1 entry"))
        if (row := rate(HARBOUR_DUES_CODE)) is not None:
            lines.append(_line(row, quantity=1, quantity_label="1 call"))

    # ── Cargo: charges that follow the container ─────────────────────────────
    if request.category == "cargo":
        units = request.units or 0
        if units > 0:
            wharfage_code = (
                WHARFAGE_40FT_CODE if request.container_size == "40ft" else WHARFAGE_20FT_CODE
            )
            if (row := rate(wharfage_code)) is not None:
                lines.append(_line(row, quantity=units, quantity_label=_plural(units, "container")))
            if (row := rate(HANDLING_CODE)) is not None:
                lines.append(_line(row, quantity=units, quantity_label=_plural(units, "container")))

            storage_days = request.storage_days or 0
            if storage_days > 0 and (row := rate(STORAGE_CODE)):
                lines.append(
                    _line(
                        row,
                        quantity=units * storage_days,
                        quantity_label=(
                            f"{_plural(units, 'container')} × {_plural(storage_days, 'day')}"
                        ),
                    )
                )

    if unpriced:
        # Not an error the user sees — the response reports it — but an operator
        # wants to know their tariff table is missing a code the calculator
        # expects.
        logger.warning("tariff_codes_missing codes=%s category=%s", unpriced, request.category)

    return lines, unpriced


def total_of(lines: list[TariffLineItem]) -> float:
    """Sum the printed amounts.

    Sums `amount`, which is already rounded, rather than recomputing from rates
    — so the total always equals what the reader can add up on screen.
    """
    return _money(sum(line.amount for line in lines))
