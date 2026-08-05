"""Turning a card *request* into a card.

The model asks for a kind. This fills it in.

## Why the split matters

`app/agent/tools.py` lets the model call `show_card("vessel_arrivals")`. That is
the entire extent of its involvement: it names a kind and, at most, a filter. It
cannot pass a vessel name, an ETA, a berth or a status, because those are not
parameters of the tool.

Everything a reader will see in the rows comes from here, read out of the
operational feed and stamped with the feed's own `DataSource`. So the card is
not the assistant claiming a berth is occupied — it is the interface displaying
a feed, in the same breath as the assistant declining to describe it. Prompt
rule 10 stands untouched; see docs/decisions.md 0023.

The same reasoning as `make_chart`, one step further: a chart lets the model
choose figures and then checks them, and a card does not let it choose any.
"""

import logging

from app.ops.source import OpsSource, filter_flights, paginate
from app.schemas import (
    AssistantCard,
    CardRequest,
    FlightSchedulesCard,
    SupportTicketCard,
    TariffCalculatorCard,
    VesselArrivalsCard,
)

logger = logging.getLogger(__name__)

# Rows shown inline. Three is what the design shows and what fits under an
# answer on a phone without becoming the page; the footer links to the rest.
INLINE_ROWS = 3


def build_card(request: CardRequest, source: OpsSource) -> AssistantCard:
    """Populate the card the model asked for.

    Never raises on an empty feed: a card with no rows is a legitimate state and
    the client renders it as "nothing is being reported", with the source notice
    explaining why. Suppressing the card instead would leave the answer saying
    "here is the board" with no board.
    """
    if request.kind == "vessel_arrivals":
        vessels = source.vessels()
        return VesselArrivalsCard(
            source=source.describe(),
            vessels=paginate(vessels, INLINE_ROWS, 0),
            total=len(vessels),
        )

    if request.kind == "flight_schedules":
        direction = request.direction or "arrival"
        flights = filter_flights(source.flights(), direction=direction)
        return FlightSchedulesCard(
            title="Arrivals" if direction == "arrival" else "Departures",
            source=source.describe(),
            flights=paginate(flights, INLINE_ROWS, 0),
            total=len(flights),
        )

    if request.kind == "tariff_calculator":
        # No figures, not even a prefilled quantity. An empty form the user
        # drives; the total comes back from the quote endpoint with its
        # disclaimer attached.
        return TariffCalculatorCard(category=request.category or "cargo")

    return SupportTicketCard(
        department=request.department or "Something else",
        # Capped rather than trusted. It is a summary of the user's own question
        # and the user edits it before sending, but nothing model-written should
        # reach a form field unbounded.
        subject=(request.subject or "")[:200],
    )
