import type { IconName } from '@/components/ui/Icon';

/**
 * The eight opening chips — handoff §2.1, two wrapping rows of four.
 *
 * They are topics rather than sentences, and each lands on a different part of
 * the product: four at the operations screens, four at things only the
 * assistant answers. Whichever a first-time visitor taps, they learn something
 * different about what this holds.
 *
 * In its own module because a file that exports both components and constants
 * breaks fast refresh: editing the list would reload the component tree and
 * drop the conversation being demonstrated.
 *
 * The glyph is not named by the handoff, which specifies only "14px leading
 * icon in `--brand-300`". Each is the sprite glyph for the thing the chip is
 * about, taken from the same set the sidebar navigates with, so a chip and its
 * destination wear the same mark.
 */
export interface Suggestion {
  label: string;
  icon: IconName;
}

/*
 * ── THESE ASK FOR WHAT THE KNOWLEDGE BASE HOLDS ─────────────────────────────
 *
 * The previous eight — Vessels in port, Arrivals today, Berth positions, Port
 * advisories, Gate assignments, Cruise call times — asked for **live
 * operational state**, six of the eight. `app/agent/prompts.py` rule 10 forbids
 * the assistant from answering any of them ("you cannot see live operations"),
 * and the feeds behind them are empty until a real source is connected. So the
 * highest-converting element on the landing page was a row of buttons that
 * mostly produced a refusal, on the first tap of a first visit.
 *
 * Each of the eight below is answered by a `confirmed` row in the delivered
 * corpus, and the id is named so the pairing can be re-checked when the
 * researchers re-export rather than rediscovered by tapping.
 *
 * The two operations chips that DID work are gone rather than kept: "Quote a
 * container" belongs to the tariff calculator and "Arrivals today" to the
 * arrivals board, and both screens are one nav row away. A chip that opens a
 * conversation should open one the assistant can finish.
 */
export const SUGGESTED_QUESTIONS: readonly Suggestion[] = [
  // Row one — one per facility.
  { label: 'Clearing cargo through customs', icon: 'file' }, //        kb-153
  { label: 'Cruise piers at Port Zante', icon: 'ship' }, //            kb-102, kb-115, kb-116
  { label: 'Ferry times to Nevis', icon: 'clock' }, //                 kb-192
  { label: 'Airport facilities', icon: 'plane' }, //                   kb-053
  // Row two — the practical cross-cutting ones.
  { label: 'Port charges for cargo', icon: 'receipt' }, //             kb-172
  { label: 'Pilotage in Basseterre', icon: 'anchor' }, //              kb-142, kb-144, kb-145
  { label: 'Contact a department', icon: 'headset' }, //               kb-005
  { label: "SCASPA's opening hours", icon: 'info' }, //                kb-016
];

/**
 * What the chips become after a refusal — §3.4, "narrowed to what we actually
 * hold".
 *
 * A refusal means the question was outside the published record. Offering the
 * same eight again invites the same disappointment, so the set narrows to the
 * four things the knowledge base is known to cover, and the chips take the
 * brand outline that marks them as the narrowed set.
 */
export const NARROWED_QUESTIONS: readonly Suggestion[] = [
  // Re-pointed with the eight above, and for a sharper reason: this set is shown
  // *after* a refusal, so a chip here that refuses again is the worst one in the
  // product. "Wharfage on a 40ft container" had no published figure to return
  // and "Flight arrivals into RLB" is live operations — both would have refused
  // twice in a row.
  { label: 'Where vessels berth at Port Zante', icon: 'anchor' }, //   kb-119, kb-102
  { label: 'Port charges for cargo', icon: 'receipt' }, //             kb-172
  { label: 'What the airport is called', icon: 'plane' }, //           kb-067, kb-068
  { label: 'Contact a department', icon: 'headset' }, //               kb-005
];
