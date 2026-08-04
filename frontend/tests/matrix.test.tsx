/**
 * Boards 21 and 22 — voice, and the cross-cutting feedback matrix.
 *
 * Board 22 exists so that "the same event never gets two treatments". These
 * tests are mostly about invariants that hold across components rather than
 * about any one of them, which is why they live together.
 */

import { globSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { DiagnosticsPanel } from '@/components/chat/DiagnosticsPanel';
import { TranscriptionResult } from '@/components/chat/TranscriptionResult';
import { BAD_REQUEST, ERROR_COPY, copyFor } from '@/features/chat/errorCopy';
import { MarineAdvisoryPanel } from '@/components/ops/AdvisoryPanel';
import { SourceNotice } from '@/components/ops/SourceNotice';
import { RATE_LIMITS, formatCountdown, rateLimitMessage } from '@/features/chat/rateLimits';

const PROJECT_ROOT = process.cwd();

// ── Board 15: the diagnostics panel, and the row it is waiting on ────────────

describe('DiagnosticsPanel', () => {
  it('is collapsed on arrival — it is evidence, not the answer', () => {
    render(<DiagnosticsPanel latencyMs={4020} recordsSearched={1284} />);
    const trigger = screen.getByRole('button', { name: /Diagnostics/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Answer time')).toBeNull();
  });

  it('quotes the server’s own measurement, in the board’s format', async () => {
    const user = userEvent.setup();
    render(<DiagnosticsPanel latencyMs={4020} recordsSearched={1284} />);
    await user.click(screen.getByRole('button', { name: /Diagnostics/ }));

    // `4.02 s` and `1,284` — §3.14. The time is what the BACKEND measured; a
    // stopwatch started in the browser would include the reader's own network.
    expect(screen.getByText('4.02 s')).toBeInTheDocument();
    expect(screen.getByText('1,284')).toBeInTheDocument();
  });

  it('says unknown rather than zero when the server did not report', async () => {
    const user = userEvent.setup();
    render(<DiagnosticsPanel latencyMs={4020} recordsSearched={null} />);
    await user.click(screen.getByRole('button', { name: /Diagnostics/ }));

    // Global rule 1. Zero rows is a fact about an index that was built; a null
    // is one that has not reported at all.
    expect(screen.getByText('unknown')).toBeInTheDocument();
    expect(screen.queryByText('0')).toBeNull();
  });

  it('omits the rate-limit row until the figure can be supplied', async () => {
    /*
     * `tracked_clients` is computed by `backend/app/ratelimit.py` and returned
     * only from `/admin/stats`, behind the administrator secret. This panel
     * sits beside an ordinary answer and cannot reach it, so the row is built
     * and gated on the field rather than shown with a placeholder.
     */
    const user = userEvent.setup();
    const { unmount } = render(<DiagnosticsPanel latencyMs={4020} recordsSearched={1284} />);
    await user.click(screen.getByRole('button', { name: /Diagnostics/ }));
    expect(screen.queryByText('Rate-limit keys tracked')).toBeNull();
    unmount();

    render(<DiagnosticsPanel latencyMs={4020} recordsSearched={1284} trackedKeys={37} />);
    await user.click(screen.getByRole('button', { name: /Diagnostics/ }));
    expect(screen.getByText('Rate-limit keys tracked')).toBeInTheDocument();
    expect(screen.getByText('37')).toBeInTheDocument();
    // The label and its footnote travel together: the figure is a count of
    // hashed keys and is never labelled users, visitors or addresses.
    expect(screen.getByText('Hashed keys, not users, visitors or addresses.')).toBeInTheDocument();
  });

  it('never labels the count users, visitors or addresses', async () => {
    /*
     * Scoped to the LABELS, not to the whole panel.
     *
     * The footnote is "Hashed keys, not users, visitors or addresses" — the
     * sentence that exists to prevent exactly this reading — so a scan over the
     * rendered text matches the disclaimer and fails on correct copy. The same
     * trap the source-scan in this file hit on its first version.
     */
    const user = userEvent.setup();
    render(<DiagnosticsPanel latencyMs={4020} recordsSearched={1284} trackedKeys={37} />);
    await user.click(screen.getByRole('button', { name: /Diagnostics/ }));

    const labels = [...document.querySelectorAll('dt')].map((dt) => dt.textContent ?? '');
    expect(labels).toContain('Rate-limit keys tracked');
    for (const label of labels) {
      expect(label).not.toMatch(/\b(users?|visitors?|clients?|addresses|IPs?)\b/i);
    }
  });
});

// ── Board 15: eight codes, eight copies ──────────────────────────────────────

describe('the error envelopes', () => {
  it('gives a 404 its own copy rather than the 500 apology', () => {
    /*
     * §3.11: "Never a generic 'something went wrong' for a code that knows
     * better." A 404 knows better — retrying fails identically, and the useful
     * next step is to check the address. It carried the INTERNAL copy.
     *
     * Byte-identical to `NotFound`'s own wording, because §2.8 ships one 404.
     */
    expect(ERROR_COPY.NOT_FOUND.title).toBe('Page not found');
    expect(ERROR_COPY.NOT_FOUND.body).toBe(
      'We could not find that page. Check the address, or go back and ask the assistant.'
    );
    expect(ERROR_COPY.NOT_FOUND.retryable).toBe(false);
  });

  it('names the field and the real limit on a 422', () => {
    // "Names the field and the actual limit it hit — never a generic
    // 'invalid input'."
    expect(ERROR_COPY.VALIDATION_ERROR.body).toMatch(/1,000 characters/);
  });

  it('has copy for a 400, which no wire code covers', () => {
    // `ErrorCode` is the wire contract and has no 400, so this is a client-side
    // kind like OFFLINE. Without it a 400 fell through to INTERNAL and told the
    // user the fault was ours.
    expect(copyFor(BAD_REQUEST).title).toBe('We could not read that request');
    expect(copyFor(BAD_REQUEST).body).toMatch(/malformed/);
  });
});

// ── Board 21: transcription errors name their real limits ────────────────────

describe('TranscriptionResult', () => {
  it('names the actual size, not "too large"', () => {
    render(<TranscriptionResult state={{ kind: 'too-large', megabytes: 26.4 }} />);
    // "That recording is 26.4 MB. The limit is 20 MB." tells someone what to do;
    // "file too large" tells them they failed.
    expect(screen.getByText(/26\.4 MB/)).toBeInTheDocument();
    expect(screen.getByText(/limit is 20 MB/)).toBeInTheDocument();
  });

  it('spells out a duration rather than printing a bare number of seconds', () => {
    render(<TranscriptionResult state={{ kind: 'too-long', seconds: 74 }} />);
    expect(screen.getByText(/1 minute 14 seconds/)).toBeInTheDocument();
    expect(screen.getByText(/limit is 60 seconds/)).toBeInTheDocument();
  });

  it('says the transcript went to the composer, not to the assistant', () => {
    /*
     * "Nevis" versus "never" is exactly the mishearing that happens on stage,
     * and a confident answer to a misheard question is both a bad experience
     * and a bad demo moment.
     */
    render(<TranscriptionResult state={{ kind: 'placed', text: 'What is wharfage' }} />);
    expect(screen.getByText(/Correct it before sending/)).toBeInTheDocument();
  });

  it('keeps voice failures contained — the text path is never blocked', () => {
    render(<TranscriptionResult state={{ kind: 'unavailable' }} />);
    expect(screen.getByText(/You can still type your question/)).toBeInTheDocument();
  });

  it('reports a failure as an alert and progress as a status', () => {
    const { unmount } = render(<TranscriptionResult state={{ kind: 'working' }} />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    unmount();

    render(<TranscriptionResult state={{ kind: 'unsupported-format' }} />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});

// ── Board 22: three rate limits, three copies ────────────────────────────────

describe('the three rate limits', () => {
  it('each names the action it blocks, not a shared "try again"', () => {
    expect(rateLimitMessage('chat', 42)).toMatch(/Send again in 0:42/);
    expect(rateLimitMessage('voice', 26)).toMatch(/Record again in 0:26/);
    expect(rateLimitMessage('ops', 18)).toMatch(/Refresh in 0:18/);
  });

  it('each names its own published budget', () => {
    expect(RATE_LIMITS.chat.perMinute).toBe(15);
    expect(RATE_LIMITS.voice.perMinute).toBe(5);
    expect(RATE_LIMITS.ops.perMinute).toBe(60);
    // Voice is a third of chat; ops is four times it — the contract's split.
    expect(RATE_LIMITS.voice.perMinute * 3).toBe(RATE_LIMITS.chat.perMinute);
    expect(RATE_LIMITS.ops.perMinute).toBe(RATE_LIMITS.chat.perMinute * 4);
  });

  it('formats one clock everywhere', () => {
    expect(formatCountdown(8)).toBe('0:08');
    expect(formatCountdown(75)).toBe('1:15');
    // Never negative, whatever a clock skew hands it.
    expect(formatCountdown(-5)).toBe('0:00');
  });

  it('exposes no remaining-quota figure, because the backend sends none', () => {
    // "No 'questions remaining this minute'. The 429 countdown is the only rate
    // signal that exists." Inventing one would be the client making up a number.
    const source = readFileSync(
      resolve(PROJECT_ROOT, 'src/features/chat/rateLimits.ts'),
      'utf8'
    ).replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
    expect(source).not.toMatch(/\bremaining\b/);
  });
});

// ── Board 22: six mandatory notices, none dismissible ────────────────────────

describe('the mandatory notices', () => {
  it('a fixture source notice offers no way to dismiss it', () => {
    /*
     * "No close control, no 'don't show again', no collapse. Each renders as
     * prominently as the thing it qualifies."
     *
     * Board 17 puts it more sharply: only the LIVE banner is dismissible, and
     * live is the one kind that cannot currently occur. A notice that says the
     * data is not real must outlive the user's patience with it.
     */
    render(
      <SourceNotice
        source={{
          kind: 'fixture',
          label: 'Sample feed',
          as_of: null,
          notice: 'These rows are sample data loaded for testing.',
        }}
      />
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('and neither does an unavailable one', () => {
    render(
      <SourceNotice
        source={{
          kind: 'unavailable',
          label: 'No feed',
          as_of: null,
          notice: 'No live feed is connected to this assistant.',
        }}
      />
    );
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('only the live notice can be dismissed', () => {
    render(
      <SourceNotice
        source={{
          kind: 'live',
          label: 'Port feed',
          as_of: null,
          notice: 'Refreshed from the port feed.',
        }}
      />
    );
    expect(screen.getByRole('button', { name: /Dismiss/ })).toBeInTheDocument();
  });
});

// ── Board 22 / 20: the empty state that is not an all-clear ──────────────────

describe('the marine advisory empty state', () => {
  it('is drawn in caution and says it is not confirmation', () => {
    /*
     * The only empty state in the product drawn in caution rather than neutral.
     * "A quiet screen read as safety has physical consequences here."
     */
    render(<MarineAdvisoryPanel advisories={[]} total={0} />);
    const panel = screen.getByRole('alert');
    expect(panel).toHaveTextContent(/No notice has been published/);
    expect(panel).toHaveTextContent(/not confirmation that conditions are normal/);
    expect(panel.className).toMatch(/bg-caution-tint/);
  });

  it('never uses a tick, a green chip or the word "clear"', () => {
    const { container } = render(<MarineAdvisoryPanel advisories={[]} total={0} />);
    expect(container.textContent).not.toMatch(/\bclear\b|\ball[- ]clear\b|\bnormal conditions\b/i);
    expect(container.querySelector('.text-positive, .bg-positive')).toBeNull();
  });
});

// ── Board 22: no mandatory notice grew a dismiss control anywhere ────────────

describe('nothing quietly makes a mandatory notice optional', () => {
  it('no component offers to hide a disclaimer, caption or provenance notice', () => {
    /*
     * A source-level guard, because this is the kind of thing that arrives as a
     * reasonable-sounding product request — "the notice is noisy on the ops
     * screen, can we collapse it?" — and the answer is recorded in six places
     * in the spec.
     *
     * The one legitimate dismiss is `SourceNotice`'s live branch, which is
     * exempted by name and asserted above.
     */
    const files = globSync('src/**/*.tsx', { cwd: PROJECT_ROOT }).filter(
      (file) =>
        !file.endsWith('SourceNotice.tsx') &&
        // The gallery is a dev catalogue that DESCRIBES these states in prose.
        // Reading its captions as controls would make the guard unmaintainable.
        !file.startsWith('src/dev/')
    );

    const HIDING = /dismiss|hide|collapse|don.t show/i;
    /*
     * `(?<![\w-])` so `text-caption` — a utility class — is not read as the
     * concept "caption". That false positive is exactly why this guard needs a
     * self-test: a pattern this loose either catches everything or nothing.
     */
    const MANDATORY = /(?<![\w-])(disclaimer|caption|notice|provenance|sample data)(?![\w-])/i;

    const offenders: string[] = [];
    for (const file of files) {
      const source = readFileSync(resolve(PROJECT_ROOT, file), 'utf8');
      /*
       * Comments stripped first, and the reason is the same one the storage
       * guard in sidebar.test.tsx records: the files that obey this rule hardest
       * are the ones that EXPLAIN it in prose. `ProvenanceCard` says "the notice
       * is mandatory and has no dismiss control" and "there is no `dismissible`
       * prop", and a line scan flagged both — the component was reported for
       * documenting the rule it enforces.
       *
       * Stripping comments keeps the guard pointed at code, which is where a
       * real dismiss control would have to live.
       */
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
      for (const line of code.split('\n')) {
        if (HIDING.test(line) && MANDATORY.test(line)) {
          offenders.push(`${file}: ${line.trim().slice(0, 70)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the guard still sees a real control once comments are stripped', () => {
    // Without this, stripping comments is indistinguishable from disabling the
    // scan: a guard that reads nothing reports nothing.
    const HIDING = /dismiss|hide|collapse|don.t show/i;
    const MANDATORY = /(?<![\w-])(disclaimer|caption|notice|provenance|sample data)(?![\w-])/i;
    const source = [
      '/* the notice may not be dismissed */',
      // `.notice` rather than `NoticeHidden`: the pattern deliberately rejects a
      // camelCase identifier, so the self-test has to use the concept the way
      // real code would.
      '{dismissed ? null : <p>{source.notice}</p>}',
    ].join('\n');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

    const hits = code.split('\n').filter((line) => HIDING.test(line) && MANDATORY.test(line));
    // The prose line is gone; the real control is still caught.
    expect(hits).toHaveLength(1);
    expect(hits[0]).toContain('dismissed');
  });

  it('the guard can tell a class name from the concept', () => {
    // Without this, tightening the pattern is indistinguishable from disabling it.
    const MANDATORY = /(?<![\w-])(disclaimer|caption|notice|provenance|sample data)(?![\w-])/i;
    expect(MANDATORY.test('className="text-caption"')).toBe(false);
    expect(MANDATORY.test('onDismiss={() => hideCaption()}')).toBe(false);
    expect(MANDATORY.test('const hideDisclaimer = true')).toBe(false);
    expect(MANDATORY.test('{collapsed ? null : <p>{quote.disclaimer}</p>}')).toBe(true);
    expect(MANDATORY.test('dismiss the notice')).toBe(true);
  });
});

// ── Board 22: one event, one treatment ───────────────────────────────────────
//
// §7's first line is the whole board: "One grid, so the same event never gets
// two treatments across screens. **Build these as shared components and
// reference them everywhere; do not re-solve 'empty table' per screen.**"
//
// A source scan, because the failure is invisible in any single component: each
// copy is correct on its own screen, and only reading two screens together shows
// that one event is being answered twice in different words.

describe('one event, one treatment — board 22', () => {
  const SOURCE = globSync('src/**/*.tsx', { cwd: PROJECT_ROOT }).map((file) => ({
    file,
    // Comments quote the handoff constantly, and a quoted sentence is not a
    // second rendering of it. Same reason the mandatory-notice scan strips them.
    code: readFileSync(resolve(PROJECT_ROOT, file), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, ''),
  }));

  function filesRendering(pattern: RegExp): string[] {
    return SOURCE.filter((entry) => pattern.test(entry.code)).map((entry) => entry.file);
  }

  it('the advisory empty state is written once, and it is the caution one', () => {
    /*
     * The one empty state in the product a reader can act on to their harm: a
     * skipper who reads it decides whether to sail. §6.9 and §7.4 give it one
     * sentence, in caution, ending with the number to ring.
     *
     * `/profile` used to draw a second, softer one in neutral — "That is not a
     * statement that there is nothing to know" — for the same fact.
     */
    expect(filesRendering(/No notices? (have|has) been published/)).toEqual([
      'src/components/ops/AdvisoryPanel.tsx',
    ]);
  });

  it('the operational advisory is one component, drawing both boards', () => {
    /*
     * T-16. There were two: this one, and an `AdvisoryPanel` in
     * `console/SidePanels.tsx` rendering the same `OperationalAdvisory` in the
     * console palette. Both call sites passed the identical prop, which is what
     * gave it away — one component with two skins, not two components.
     *
     * The failure mode is the marine panel's, one screen over: two renderings of
     * one payload drift, and the drift is invisible because each has passing
     * tests of its own. This assertion is the cheap guard against a third.
     *
     * `filesRendering` strips comments first, so the note left behind in
     * SidePanels.tsx explaining where the panel went does not trip it.
     */
    expect(filesRendering(/Aviation advisory/)).toEqual(['src/components/ops/AdvisoryPanel.tsx']);
  });

  it('the mock controls need an explicit flag, not just DEV', () => {
    /*
     * The demonstration runs on `npm run dev`, deliberately — that is what keeps
     * `/dev/rehearsal` reachable as the last-resort fallback. Gated on DEV
     * alone, the mock panel therefore sat on screen throughout it: a floating
     * pill reading "Mock: Normal cited answer", overlapping the source panel's
     * footer text in the T-23 screenshots.
     *
     * On a product whose argument is that it is honest about which data is real,
     * a control captioned "Mock" is the worst thing that could be visible — and
     * no automated gate could see it, because in dev it was behaving exactly as
     * designed. So the gate is asserted here instead.
     *
     * Both conditions are build-time literals, so the production fold that keeps
     * MSW out of the bundle is unchanged.
     */
    const root = SOURCE.find((entry) => entry.file === 'src/routes/__root.tsx');
    expect(root, 'src/routes/__root.tsx is missing from the scan').toBeDefined();
    expect(root?.code).toMatch(/VITE_SHOW_MOCK_CONTROLS/);
    // DEV must still be part of it, or the mocks would follow into the bundle.
    expect(root?.code).toMatch(/import\.meta\.env\.DEV\s*&&/);
  });

  it('the landing page quotes a real source rather than inventing one — T-18', () => {
    /*
     * The example answer in the hero used to read "the last placeholder sailing
     * back from Nevis on a weekday is 18:00", cited to "Ferry — schedule ·
     * Official SCASPA website · Verified on 2026-04-01".
     *
     * No such row exists. The corpus holds no ferry departure time anywhere, and
     * kb-192 — the row that does answer this question — is annotated "ROUTING
     * ROW … Never state a sailing time". The first screen a visitor sees was
     * doing the one thing its own cited row forbids.
     *
     * It survived every gate because the landing page had no test at all. This
     * is the cheapest guard that would have caught it: the hero renders a
     * verbatim quote from a confirmed row, and a confirmed row that states a
     * time or a fee does not exist for this question — so neither should appear
     * in the rendered source.
     *
     * Comments are stripped above, which is why the docstring recording the old
     * text does not trip this.
     */
    const landing = SOURCE.find((entry) => entry.file === 'src/routes/index.tsx');
    expect(landing, 'src/routes/index.tsx is missing from the scan').toBeDefined();
    expect(landing?.code).not.toMatch(/\d{1,2}:\d{2}/);
    expect(landing?.code).not.toMatch(/(XCD|EC\$|US\$|\$)\s*\d/);
  });

  it('the escalation block is one component, never re-typed', () => {
    // §7.1: "Every error is followed by the escalation block." `ErrorState` used
    // to re-type the three phone lines and the postal address into a panel of
    // its own.
    expect(filesRendering(/Reach SCASPA directly|Speak to the Authority/)).toEqual([
      'src/components/chat/EscalationBlock.tsx',
    ]);
  });

  it('a table loading is one skeleton, with its headings kept', () => {
    /*
     * §7.5: "Column headers stay so the shape is stable." The console drew three
     * blank cards instead, so the same event had two treatments — and the one
     * that dissolved the table moved every column twice.
     */
    // Every caller of the console's list state hands it the headings, so the
    // loading case is `TableSkeleton` rather than the card placeholders.
    const callers = SOURCE.filter((entry) => /<OpsListState/.test(entry.code));
    expect(callers.length).toBeGreaterThan(0);
    for (const caller of callers) {
      expect(/columns=\{/.test(caller.code), caller.file).toBe(true);
    }
  });
});
