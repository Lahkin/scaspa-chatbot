"""Query rewriting and cheap category classification.

Both are deliberately **free**: no model call. That is not laziness, it is the
order of operations. A model-based rewriter costs a round trip on every single
question, and until measurement shows the cheap version failing there is nothing
to justify that. The handbook says the same about classification: do not spend a
model call if a keyword rule is sufficient.

## Why rewriting comes first

"what about the other one?" retrieves nothing useful, because the words that
carry the meaning are in the *previous* turn. Users hit this constantly — it is
the single largest class of follow-up failure — and no amount of prompt tuning
fixes it, because the search never saw the topic.

## Why the classifier is cautious

It returns a category only when the question is *unambiguously* about one. The
handbook's own retrieval-collision case is the word "port", which on this site
means the cargo port, Port Zante the cruise terminal, and the ferry port — so
"port" is deliberately **not** a decisive keyword. Filtering on a wrong guess is
worse than not filtering: it hides the correct row entirely.
"""

import logging
import re

logger = logging.getLogger(__name__)

# Phrases that genuinely signal the question depends on an earlier turn.
#
# The first version also matched bare pronouns anywhere ("it", "that", "this"),
# which fired on complete questions: "The taxi driver told me the ferry costs more
# than that" contains "that" and was rewritten unnecessarily. Measurement showed
# rewriting *hurting* hit@1, and this over-triggering was the diagnosable cause.
_REFERENTIAL = re.compile(
    r"^\s*(and|but|so|what about|how about|what if)\b"
    r"|\b(what|how)\s+about\b"
    r"|\bthe\s+other\s+(one|option)\b"
    r"|^\s*(it|that|those|them|this)\b",
    re.IGNORECASE,
)

# Below this a question cannot carry its own subject: "cheaper?", "and Nevis?".
# Six was too generous — "How much is a ferry ticket?" is exactly six words and
# is entirely self-contained.
_SHORT_QUESTION_WORDS = 4

_STOPWORDS = frozenset(
    """a an and are as at be by can could do does for from has have how i if in is it
    its me my of on or our so than that the their them then there these they this to
    was we what when where which who will with would you your about much many does""".split()
)

# Decisive keywords only. Anything that could belong to two facilities is absent.
CATEGORY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "ferry": ("ferry", "ferries", "sailing", "nevis", "charlestown", "sail"),
    "cruise": ("cruise", "zante", "passenger ship", "shore excursion", "disembark"),
    "cargo": (
        "cargo",
        "container",
        "containers",
        "teu",
        "barrel",
        "barrels",
        "freight",
        "tonnage",
        "stevedore",
        "manifest",
        "customs",
        "clearance",
        "break-bulk",
        "consignment",
    ),
    "airport": ("airport", "flight", "flights", "rlb", "bradshaw", "check-in", "departure lounge"),
    "general": ("contact", "phone number", "email", "vacancy", "vacancies", "careers"),
}

# Words that look decisive but are not. "port" is the handbook's collision case:
# it means the cargo port, Port Zante, and the ferry port.
AMBIGUOUS_TERMS = frozenset({"port", "terminal", "harbour", "harbor", "dock", "pier", "berth"})


def salient_terms(text: str, limit: int = 6) -> list[str]:
    """Content words from a question, in order, stopwords removed."""
    words = re.findall(r"[a-z0-9][a-z0-9'-]*", text.lower())
    seen: dict[str, None] = {}
    for word in words:
        if word not in _STOPWORDS and len(word) > 2:
            seen.setdefault(word, None)
    return list(seen)[:limit]


def needs_rewrite(query: str) -> bool:
    """Whether this question looks like it depends on an earlier turn."""
    words = query.split()
    if len(words) <= _SHORT_QUESTION_WORDS:
        return True
    return bool(_REFERENTIAL.search(query))


def rewrite_query(query: str, history: list[str] | None = None) -> str:
    """Make an elliptical follow-up standalone by borrowing the previous topic.

    `history` is prior **user** questions, oldest first. Returns `query`
    unchanged when there is nothing to borrow or nothing to fix.

    Deliberately additive rather than generative: it appends the earlier topic
    words instead of rewriting the sentence. That cannot invent a subject the
    user never mentioned, which a model-based rewriter can. The cost is a
    slightly clumsy query string, and retrieval does not care about grammar.
    """
    if not history or not needs_rewrite(query):
        return query

    # Borrow only the *subject*, not the whole previous question.
    #
    # Appending every content word pulled the query toward the wrong row:
    # "and the fare?" after "What time does the ferry to Nevis leave?" became
    # "and the fare? time ferry nevis leave", and "time"/"leave" dragged it from
    # the fare row to the schedule row. Restricting the borrow to the facility
    # and topic vocabulary carries the subject forward and leaves the previous
    # question's *intent* behind, which is the part that must not persist.
    for previous in reversed(history):
        topic = topic_terms(previous)
        if not topic:
            continue
        already = set(salient_terms(query))
        borrowed = [t for t in topic if t not in already]
        if not borrowed:
            return query
        rewritten = f"{query} {' '.join(borrowed)}"
        logger.info("query_rewritten from=%r to=%r", query, rewritten)
        return rewritten

    return query


def topic_terms(text: str, limit: int = 3) -> list[str]:
    """Facility and topic words from a question — the subject, not the intent.

    Drawn from the same vocabulary the classifier uses, so "ferry", "Nevis" and
    "container" carry forward while "time", "leave" and "cost" do not.
    """
    lowered = text.lower()
    found: list[str] = []
    for keywords in CATEGORY_KEYWORDS.values():
        for keyword in keywords:
            if keyword in AMBIGUOUS_TERMS:
                continue
            if re.search(rf"\b{re.escape(keyword)}\b", lowered) and keyword not in found:
                found.append(keyword)
    return found[:limit]


def classify_category(query: str) -> str | None:
    """The one category this question is clearly about, or None.

    None means "do not filter". Returning a wrong category is worse than
    returning nothing: a filter hides the correct row completely, while no filter
    merely leaves it to ranking.
    """
    lowered = query.lower()
    matched: set[str] = set()

    for category, keywords in CATEGORY_KEYWORDS.items():
        for keyword in keywords:
            if keyword in AMBIGUOUS_TERMS:
                continue
            if re.search(rf"\b{re.escape(keyword)}\b", lowered):
                matched.add(category)
                break

    if len(matched) == 1:
        category = matched.pop()
        logger.info("category_classified query=%r category=%s", query, category)
        return category

    if len(matched) > 1:
        logger.info("category_ambiguous query=%r candidates=%s", query, sorted(matched))
    return None
