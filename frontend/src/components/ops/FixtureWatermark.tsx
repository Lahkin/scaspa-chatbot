import type { DataSource } from '@/lib/types';

/**
 * The sample-data hatch — `docs/decisions.md` 0032, layer 4.
 *
 * ── THIS IS A RECORDED DEVIATION FROM `design/` ──────────────────────────────
 *
 * The specification draws the fixture notice (§4.1, §5.2) and forbids
 * dismissing it. It draws no hatch. `CLAUDE.md`'s Style rule permits a deviation
 * when it is recorded in `docs/decisions.md` with the reason, and 0032 is that
 * record — this component is not an unlogged liberty.
 *
 * ## What it is
 *
 * A layer of 45° caution-tinted stripes at 5% opacity behind an operations
 * surface, rendered **only** when the payload's `source.kind` is `fixture`.
 *
 * ## Why it exists on top of a notice that already says the words
 *
 * The notice was sufficient while the data was obviously fake — `MV SAMPLE
 * CARRIER` alongside `IMO 0000001` told the story by itself. 0032 deliberately
 * made the data realistic so the screens could be built and checked against the
 * shape they will really have, and **the more convincing the render, the less
 * the sentence at the top of it is read**. The hatch does the three things a
 * sentence cannot:
 *
 * | | |
 * | --- | --- |
 * | **Visible without reading** | A hatch registers before any word does, at a glance, from across a room — which is how a screen is actually seen during a walkthrough. |
 * | **Cannot be dismissed** | There is no control, no state, no `dismissible` prop and no way to pass one. It renders from `source.kind` and nothing else. Turning it off means lying about the kind, which the schema will not let you do — a `fixture` source cannot be constructed without its notice. |
 * | **Cannot be screenshotted away** | It sits **behind the rows**, not above them. A crop that excludes the hatch excludes the data, and a screenshot of the table is a screenshot of the hatch. A banner above the fold survives neither. |
 *
 * ## What it deliberately does not do
 *
 * It carries no text and no accessible name. The notice above it is the
 * statement — schema-enforced non-empty, non-dismissible, and read aloud. This
 * is the *visual* half of the same claim, so it is `aria-hidden` rather than
 * announcing "sample data" a second time to someone who has already heard it.
 *
 * `pointer-events: none` because a decoration that swallows a click on a table
 * row is a bug, not a safeguard.
 */
export function FixtureWatermark({ source }: { source: DataSource | null | undefined }) {
  // Only `fixture`. An `unavailable` source has no rows to hatch — the panel
  // says there is no feed — and `live` is real data that must never be marked
  // as sample.
  if (source?.kind !== 'fixture') return null;

  return (
    <div
      aria-hidden="true"
      data-testid="sample-hatch"
      className="sample-hatch pointer-events-none absolute inset-0 z-0"
    />
  );
}
