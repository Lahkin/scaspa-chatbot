"""Input safety: length, character classes, and prompt-injection handling.

## The important half is not the pattern list

Stripping "ignore previous instructions" from user input is the part that demos
well and matters least. Anyone determined will phrase it differently, and the
list will always be behind.

The half that actually holds is **structural**: retrieved rows, scraped pages and
PDFs are inserted into the prompt inside explicit `<<<SOURCE ...>>>` fences, and
the system prompt states that everything inside a fence is quoted data even if it
reads as a command (see `app.agent.prompts.UNTRUSTED_DATA_NOTICE`). Scraped web
text is untrusted input — anyone who can edit a web page could otherwise write an
instruction into it and have the model obey.

So the pattern guard here is defence in depth and is deliberately **neutralising,
not rejecting**: a traveller may legitimately type "ignore the sign at the gate".
Refusing that would be worse than answering it.
"""

import re
import unicodedata

# Control characters other than tab/newline/carriage return. These do nothing
# useful in a question and can hide content from a reviewer reading a log.
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

# Zero-width and bidi-override characters. A right-to-left override can make a
# logged question read differently from what the model received.
_INVISIBLE = re.compile(r"[​-‏‪-‮⁠-⁤﻿]")

# Runs of combining marks — the "Zalgo" payload. Long runs are a denial-of-service
# on tokenisation and on anyone reading the log.
_MAX_COMBINING_RUN = 4

# Obvious instruction-override shapes. Neutralised, not rejected.
_INJECTION_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(
        r"\b(?:ignore|disregard|forget|override|bypass)\s+"
        r"(?:all\s+|any\s+|your\s+|the\s+|previous\s+|prior\s+|above\s+|earlier\s+){0,3}"
        r"(?:instruction|instructions|rule|rules|prompt|prompts|direction|directions|"
        r"guideline|guidelines|constraint|constraints)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:you\s+are\s+now|from\s+now\s+on\s+you\s+are|act\s+as|pretend\s+(?:to\s+be|you)|"
        r"roleplay\s+as|simulate\s+being)\b",
        re.IGNORECASE,
    ),
    re.compile(
        r"\b(?:reveal|show|print|repeat|output|disclose)\s+"
        r"(?:me\s+)?(?:your\s+|the\s+)?(?:system\s+)?(?:prompt|instructions|rules)\b",
        re.IGNORECASE,
    ),
    re.compile(r"\b(?:developer|system|admin)\s+mode\b", re.IGNORECASE),
    re.compile(r"\bDAN\b|\bjailbreak\b", re.IGNORECASE),
    # Fake role markers, which can look like conversation structure.
    re.compile(r"^\s*(?:system|assistant|developer)\s*:", re.IGNORECASE | re.MULTILINE),
    re.compile(r"<\|(?:im_start|im_end|system|endoftext)\|>", re.IGNORECASE),
)

NEUTRALISED = "[instruction-like text removed]"


class InputRejected(ValueError):
    """The input cannot be processed. Carries a message safe to show a user."""


def _strip_invisible(text: str) -> str:
    text = _CONTROL.sub("", text)
    return _INVISIBLE.sub("", text)


def _collapse_combining(text: str) -> str:
    """Trim long runs of combining marks without touching normal accents.

    Legitimate text has one or two marks per base character; a payload has
    hundreds. This keeps accented characters intact.
    """
    out: list[str] = []
    run = 0
    for char in text:
        if unicodedata.combining(char):
            run += 1
            if run > _MAX_COMBINING_RUN:
                continue
        else:
            run = 0
        out.append(char)
    return "".join(out)


def neutralise_injection(text: str) -> tuple[str, list[str]]:
    """Replace obvious instruction-override phrasings. Returns `(text, matched)`.

    Neutralising rather than rejecting is deliberate: "ignore the sign at the
    gate" is a reasonable thing for a traveller to type, and refusing it would be
    a worse failure than answering it.
    """
    matched: list[str] = []
    for pattern in _INJECTION_PATTERNS:
        found = pattern.findall(text)
        if found:
            matched.extend(
                " ".join(f).strip() if isinstance(f, tuple) else str(f).strip() for f in found
            )
            text = pattern.sub(NEUTRALISED, text)
    return text, [m for m in matched if m]


def sanitise_user_input(text: str, max_chars: int) -> tuple[str, list[str]]:
    """Clean and bound one user message.

    Returns `(clean_text, injection_matches)`. Raises `InputRejected` when there
    is nothing usable left, or when the input is over the limit.
    """
    if text is None:
        raise InputRejected("Please type a question before sending.")

    # NFKC first: it folds look-alike characters so a pattern cannot be evaded
    # with fullwidth or mathematical variants of the same letters.
    text = unicodedata.normalize("NFKC", text)
    text = _strip_invisible(text)
    text = _collapse_combining(text)

    if len(text) > max_chars:
        raise InputRejected(
            f"That question is too long. Please shorten it to {max_chars} characters or fewer."
        )

    text, matches = neutralise_injection(text)
    text = " ".join(text.split())

    if not text or text == NEUTRALISED:
        raise InputRejected("Please type a question before sending.")

    return text, matches
