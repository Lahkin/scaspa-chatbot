/**
 * Reconciliation: deciding which markers become chips.
 *
 * Pure functions, separate from any component, because this is the rule the whole
 * credibility story rests on and it should be readable and testable without a
 * DOM.
 *
 * ### The rule
 *
 * The `citations` event arrives **after** the last token — validation needs the
 * finished text, so it cannot come earlier. Until it lands, a marker is *pending*:
 * the answer said `[kb-014]` and we do not yet know whether the backend will vouch
 * for it. Then:
 *
 * | marker | citation | outcome |
 * | --- | --- | --- |
 * | present | matching id | live chip, numbered by first appearance |
 * | present | **no match** | **removed from the display entirely** |
 * | absent  | present | listed in the panel under "sources consulted" |
 *
 * The middle row is the one that matters. The backend already strips hallucinated
 * citations server-side; this is the second line of defence, and it has two halves
 * that are equally important:
 *
 *   1. **Never render a chip the backend did not vouch for.** A chip is a claim
 *      that a fact was verified. Rendering one for an unverified marker is the
 *      product telling a lie about itself.
 *   2. **Never render the raw text `[kb-047]` to a user.** Falling back to the
 *      literal marker is the tempting failure mode — it feels honest, it is not:
 *      it exposes an internal row id and looks like a bug in an answer someone is
 *      being asked to trust.
 *
 * So an unmatched marker is deleted from the text, silently for the user, with a
 * `console.warn` in dev so it is not silent for us.
 */

import type { Citation } from '@/lib/types';

/**
 * Warn once per distinct message.
 *
 * `reconcile` runs from two `useMemo`s — the bubble and the session context —
 * and React's StrictMode double-invokes both, so one dropped marker produced
 * four identical console lines. Four warnings for one event is how a warning
 * gets ignored, which defeats the reason for having it.
 */
const warned = new Set<string>();

function warnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(message);
}

/** Test seam: the dedupe would otherwise make the second assertion in a suite silent. */
export function resetCitationWarnings(): void {
  warned.clear();
}

/** `kb-` plus three or four digits — the id shape the backend guarantees. */
export const MARKER_PATTERN = /\[(kb-\d{3,4})\]/g;

export type MarkerState =
  /** Citations have not arrived. The answer is still being verified. */
  | { status: 'pending' }
  /** Verified. Numbered by order of first appearance. */
  | { status: 'resolved'; index: number; citation: Citation }
  /** The backend did not vouch for it. Renders nothing at all. */
  | { status: 'unverified' };

export interface Reconciliation {
  /** Marker id → what to render for it. */
  markers: Map<string, MarkerState>;
  /** Every citation, in display order: cited ones first (numbered), then consulted-only. */
  entries: CitationEntry[];
  /** Ids that appeared in the text but were never vouched for. */
  unverified: string[];
}

export interface CitationEntry {
  citation: Citation;
  /**
   * 1-based, in order of first appearance in the answer. `null` for a citation
   * that was consulted but never cited inline — it still belongs in the panel,
   * but numbering it would imply a chip that does not exist.
   */
  index: number | null;
}

/** Ids in the order they first appear in the text, deduplicated. */
export function markerIdsInOrder(text: string): string[] {
  const seen = new Set<string>();
  const order: string[] = [];
  // `matchAll` needs a fresh lastIndex; the pattern is module-level and global.
  for (const match of text.matchAll(new RegExp(MARKER_PATTERN.source, 'g'))) {
    const id = match[1];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  return order;
}

/**
 * @param text        the accumulated answer, markers and all
 * @param citations   the `citations` event payload, or `null` if it has not arrived
 * @param grounded    `meta.grounded`. When false, no chip is rendered at all.
 */
export function reconcile(
  text: string,
  citations: Citation[] | null,
  grounded = true
): Reconciliation {
  const ids = markerIdsInOrder(text);
  const markers = new Map<string, MarkerState>();

  // Still streaming, or the event has not landed. Everything is pending — which
  // is why pending has to be a real, neutral visual state rather than nothing.
  if (citations === null) {
    for (const id of ids) markers.set(id, { status: 'pending' });
    return { markers, entries: [], unverified: [] };
  }

  const byId = new Map(citations.map((citation) => [citation.kb_id, citation]));
  const unverified: string[] = [];
  const cited: CitationEntry[] = [];

  let next = 1;
  for (const id of ids) {
    const citation = byId.get(id);
    if (!citation) {
      markers.set(id, { status: 'unverified' });
      unverified.push(id);
      continue;
    }
    // `grounded: false` means the backend could not verify something in this
    // answer. Confidence styling is suppressed wholesale — see UngroundedNotice.
    if (!grounded) {
      markers.set(id, { status: 'unverified' });
      continue;
    }
    markers.set(id, { status: 'resolved', index: next, citation });
    cited.push({ citation, index: next });
    next += 1;
  }

  if (unverified.length > 0 && import.meta.env.DEV) {
    // Silent for the user, loud for us. If this fires, either the model invented
    // a row id or the backend's own stripping let one through — both worth
    // knowing about immediately.
    warnOnce(
      `[citations] ${unverified.length} marker(s) had no matching citation and were ` +
        `removed from the answer: ${unverified.join(', ')}`
    );
  }

  // Consulted but not cited. Still shown, deliberately: it is evidence of what
  // was looked at, and hiding it would overstate how narrow the search was.
  const citedIds = new Set(cited.map((entry) => entry.citation.kb_id));
  const consultedOnly: CitationEntry[] = citations
    .filter((citation) => !citedIds.has(citation.kb_id))
    .map((citation) => ({ citation, index: null }));

  return { markers, entries: [...cited, ...consultedOnly], unverified };
}

// ── Presentation helpers, derived only from fields the API actually sends ─────

const SOURCE_TYPE_LABELS: Record<string, string> = {
  'official-site': 'Official SCASPA website',
  'official-pdf': 'Official SCASPA document',
  'client-interview': 'From SCASPA directly',
  // Not named in the brief but real values in the knowledge base, so they need
  // readable labels too rather than falling through to a raw slug.
  press: 'Press report',
  regulator: 'Government or regulator',
};

export function sourceTypeLabel(sourceType: string): string {
  return SOURCE_TYPE_LABELS[sourceType] ?? 'Other source';
}

/**
 * A readable label for a source entry.
 *
 * Prefers the backend's `label` (the KB `question`) when it arrives. Until then it
 * is composed from `category` and `subcategory`, which *are* in the payload —
 * "Ferry — schedule". Derived, not invented: every word comes from the citation.
 */
export function entryLabel(citation: Citation): string {
  if (citation.label && citation.label.trim()) return citation.label.trim();
  const category = citation.category ? titleCase(citation.category) : 'SCASPA';
  return citation.subcategory ? `${category} — ${citation.subcategory}` : category;
}

function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * How much emphasis the "verified on" date gets.
 *
 * **A citation with no `volatility` is treated as `high`.** The field is not in
 * the contract yet, and the failure that matters is a stale ferry departure shown
 * quietly — so the default is the cautious one. Downgrading an unknown row to a
 * quiet date would be choosing the harm.
 */
export function volatilityOf(citation: Citation): 'low' | 'medium' | 'high' {
  return citation.volatility ?? 'high';
}

/**
 * Whether to show the confirm-before-you-travel line.
 *
 * **`high` and `medium`, not just `high`.** The brief describes high volatility as
 * "schedules, fees, contact details", but the knowledge base disagrees with that
 * grouping: fares and tariffs are `medium`, and `general/contact` is `low`. Only
 * schedules and cruise arrivals are `high`.
 *
 * Following the brief's *intent* rather than its wording: a fare is exactly the
 * kind of figure someone budgets against, so `medium` earns the line. `high`
 * additionally gets the prominent treatment. See docs/decisions.md F005.
 */
export function needsConfirmation(citation: Citation): boolean {
  return volatilityOf(citation) !== 'low';
}
