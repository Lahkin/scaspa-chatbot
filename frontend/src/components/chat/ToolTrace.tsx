import { Disclosure } from '@/components/ui/Disclosure';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import type { ToolActivity } from '@/features/chat/types';

/** The agent's cap. Six tools is the most that can run for one question. */
const TOOL_CAP = 6;

/**
 * The agent activity trace — spec boards 05 and 14.
 *
 * Three columns: the tool's name, a one-line summary of what it was asked, and
 * how long it took. **No request bodies and no responses** — the spec is
 * explicit, and a trace that dumped payloads would put retrieved knowledge-base
 * rows on screen without any of the citation machinery that normally governs
 * them.
 *
 * ## Collapsed on arrival, every time
 *
 * "It is evidence, not part of the answer." `Disclosure` defaults closed and
 * nothing here remembers the last state: a trace that reopens itself has
 * decided the evidence is the answer.
 *
 * ## The summary is the backend's own words
 *
 * `summary` arrives written to be rendered directly — "Searching SCASPA
 * knowledge base — ferry fares". It is never composed here from the tool name
 * and its arguments, because that would be the client narrating what it thinks
 * happened rather than reporting what did.
 *
 * ## Running rows are marked, not hidden
 *
 * A tool still in flight has no duration yet. It gets the brand tint and a live
 * dot rather than an empty cell or a zero — `0 ms` would read as instant, which
 * is the opposite of what is true.
 */
export function ToolTrace({ activity }: { activity: ToolActivity[] }) {
  if (activity.length === 0) {
    // Not an empty expander: the spec's disabled state says "No tools ran".
    return null;
  }

  const finished = activity.filter((step) => step.done).length;
  const complete = finished === activity.length;

  return (
    <div className="mt-3">
      <Disclosure
        label={
          <>
            {/*
             * ── THE LABEL IS NOT A COUNT OF FUNCTION CALLS ──────────────────
             *
             * This read "3 tools used · 361 ms". A traveller standing on a pier,
             * deciding whether to believe a fact about a ferry, was being told
             * how many function calls had run and how long they took. It is the
             * single most inside-out sentence the product had.
             *
             * The detail is still in the panel — which tool, what it was asked,
             * how long it took — because a reader who opens something called
             * "How Pilot verified this" is asking exactly that, and the answer
             * is genuinely useful. It is one click away instead of on the face
             * of every answer.
             *
             * While tools are still running the count DOES appear, because then
             * it is progress rather than trivia: "2 of 6" is the difference
             * between working and stuck.
             */}
            {complete
              ? 'How Pilot verified this'
              : `Verifying — ${finished} of ${activity.length} steps`}
          </>
        }
      >
        <div>
          {activity.map((step) => (
            <div
              key={step.id}
              className={cn(
                'grid grid-cols-[1.1fr_1.3fr_auto] items-center gap-3.5 px-5 py-2.5',
                'border-b border-border last:border-b-0',
                !step.done && 'bg-brand-tint'
              )}
            >
              <span className="text-label font-medium text-ink">{step.name}</span>
              <span className="text-label text-ink-muted">{step.summary}</span>
              {step.done ? (
                <span className="text-label text-ink-muted tabular">
                  {step.ms === null ? '—' : formatDuration(step.ms)}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-brand-200" />
                  <span className="text-label text-brand-200">running</span>
                </span>
              )}
            </div>
          ))}

          {/*
           * The cap, stated only when it was actually reached.
           *
           * Board 14 draws this on a six-of-six trace: "Six tools is the most
           * that can run for one question. The answer below was written with
           * what these returned." Showing it on a two-tool trace would imply a
           * limit was hit when none was.
           */}
          {activity.length >= TOOL_CAP ? (
            <div className="flex items-start gap-2.5 bg-caution-tint px-5 py-3">
              <Icon name="alert" size={14} className="mt-0.5 text-caution" />
              <span className="text-label text-ink-muted">
                {TOOL_CAP} tools is the most that can run for one question. The answer above was
                written with what these returned.
              </span>
            </div>
          ) : null}
        </div>
      </Disclosure>
    </div>
  );
}

/** `240 ms` under a second, `1.59 s` over it — the spec's own two forms. */
function formatDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}
