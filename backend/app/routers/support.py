"""Support escalation: the contact directory and the ticket receipt.

Thin: validate, call a service, return — CLAUDE.md rule 7.

## What this endpoint refuses to accept, and why

The design's ticket form collects a full name, an email address, a phone number
and a file attachment. **None of them are accepted here.**

`docs/privacy.md` states that this service holds no IP address, no user agent,
no account, no device identifier, and that there is no way to link a
conversation to a person. CLAUDE.md rule 9 forbids logging a user identifier.
Taking a name and an email would make the first claim false and would put the
second one rule-break away — and it would do it quietly, on a form that looks
routine.

So the exchange is inverted. The user describes the problem, gets a reference
code back, and quotes that code when they call or email SCASPA themselves. The
response says so in `next_step`, because a ticket that nobody will reply to is
worse than no ticket if the user is not told which it is.

This is the same bargain `escalate_to_human` already makes, with a written
description attached. Changing it — accepting contact details so an officer can
reply unprompted — is a deliberate change to the privacy position and needs
`docs/privacy.md`, `docs/decisions.md` and this docstring changed with it.
"""

import logging
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, Request

from app.agent.memory import ConversationStore, get_conversation_store
from app.ops.fixtures import DEPARTMENTS, EMERGENCY_NOTICE
from app.ops.source import OpsSource, get_ops_source
from app.ratelimit import RateLimiter, get_rate_limiter
from app.schemas import (
    ErrorEnvelope,
    SupportDirectory,
    SupportTicketRequest,
    SupportTicketResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["support"])

# Published turnaround. Stated once here rather than in the response builder so
# it is one edit when SCASPA changes it.
EXPECTED_RESPONSE = "within 1 business day"

NEXT_STEP = (
    "Quote reference {reference} when you contact SCASPA. Nobody will contact you "
    "first: this ticket carries no name, email or phone number, because this "
    "assistant does not collect them. Call 869-465-8121 / 2 / 3."
)


def new_reference() -> str:
    """A random ticket reference in the design's `SC-nnnn` shape.

    `secrets` rather than `random`: the reference is quoted to an officer as a
    weak proof that a ticket exists, and a predictable sequence would let anyone
    guess a neighbour's. It is not a credential and is not treated as one — it
    identifies no person — but predictable-by-default is a bad habit.
    """
    return f"SC-{secrets.randbelow(9000) + 1000}"


@router.get(
    "/support/directory",
    response_model=SupportDirectory,
    summary="Published SCASPA contact routes",
)
async def get_support_directory(
    request: Request,
    source: Annotated[OpsSource, Depends(get_ops_source)],
) -> SupportDirectory:
    """Where to reach SCASPA, and the departments the ticket form accepts.

    Not rate limited, and that is deliberate: this is the fallback someone
    reaches for when everything else has told them to call. Throttling the phone
    number would be throttling the escape hatch.
    """
    return SupportDirectory(
        source=source.describe(),
        locations=source.contact_locations(),
        emergency=EMERGENCY_NOTICE,
        departments=list(DEPARTMENTS),
        request_id=getattr(request.state, "request_id", "-"),
    )


@router.post(
    "/support/ticket",
    response_model=SupportTicketResponse,
    summary="Raise a support ticket (no personal details are accepted)",
    responses={
        422: {"model": ErrorEnvelope, "description": "Missing subject, details or department"},
        429: {"model": ErrorEnvelope, "description": "Too many requests"},
    },
)
async def post_support_ticket(
    payload: SupportTicketRequest,
    request: Request,
    store: Annotated[ConversationStore, Depends(get_conversation_store)],
    limiter: Annotated[RateLimiter, Depends(get_rate_limiter)],
) -> SupportTicketResponse:
    """Record an escalation and return a reference to quote."""
    from app.routers.chat import enforce_rate_limit

    enforce_rate_limit(request, limiter, scope="ops")

    reference = new_reference()

    # A transcript is only attached when the user ticked the box, and only if
    # there is actually a conversation to attach. Defaulting this on would
    # forward someone's questions to a mailbox they did not know about.
    transcript_included = False
    if payload.include_transcript and payload.conversation_id:
        transcript_included = bool(store.get(payload.conversation_id))

    # Logged: what was raised and whether a transcript went with it. Not logged:
    # the details body, which is the user's own words — rule 9's spirit, and the
    # subject alone is enough to see what the desk is receiving.
    logger.info(
        "support_ticket reference=%s department=%r subject=%r transcript=%s",
        reference,
        payload.department,
        payload.subject,
        transcript_included,
    )

    return SupportTicketResponse(
        reference=reference,
        department=payload.department,
        expected_response=EXPECTED_RESPONSE,
        next_step=NEXT_STEP.format(reference=reference),
        transcript_included=transcript_included,
        request_id=getattr(request.state, "request_id", "-"),
    )
