/**
 * The landing page is a gateway, and the four cards are the gate.
 *
 * What is worth checking here is not that the words render — it is the two
 * things that would be embarrassing in front of a client and are invisible on
 * screen:
 *
 *   - a card that opens a conversation with a question the knowledge base
 *     cannot answer, so the first thing a visitor ever sees Pilot do is fail;
 *   - a card whose announced name is a run of joined-up words, because
 *     accessible-name computation concatenates a title, a line break and two
 *     description lines with no separators between them.
 *
 * The second of those was real: the cards announced "Ferry & NevisSchedules,
 * terminalsand travel information" until it was measured in a browser. jsdom
 * computes no accessible name at all, so nothing here would have caught it —
 * hence an assertion on the attribute rather than on the name.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { JourneyCard } from '@/components/marketing/JourneyCard';
import { TrustStrip } from '@/components/marketing/TrustStrip';
import { SUGGESTED_QUESTIONS } from '@/features/chat/suggestions';
import { PROJECT_ROOT } from './source-files';

const LANDING = readFileSync(resolve(PROJECT_ROOT, 'src/routes/index.tsx'), 'utf8');

describe('the four journeys', () => {
  it('asks only questions the suggestion set already vouches for', () => {
    /*
     * Every label in `SUGGESTED_QUESTIONS` is annotated in that file with the
     * knowledge-base rows that answer it. A card inventing a new phrasing is a
     * card that can open a conversation and immediately get "I do not have
     * that" — the worst possible first impression, and entirely avoidable.
     */
    const asked = [...LANDING.matchAll(/question: '([^']+)'/g)].map((m) => m[1]!);
    expect(asked.length, 'four journey cards').toBe(4);

    const vouched = new Set(SUGGESTED_QUESTIONS.map((s) => s.label));
    for (const question of asked) {
      expect(vouched.has(question), `"${question}" is not a vouched-for question`).toBe(true);
    }
  });

  it('names itself in one piece, rather than letting the layout join the words', () => {
    render(
      <JourneyCard
        icon="ship"
        title="Ferry & Nevis"
        lines={['Schedules, terminals', 'and travel information']}
        onSelect={() => {}}
      />
    );
    const label = screen.getByRole('button').getAttribute('aria-label');
    expect(label).toBe('Ferry & Nevis — Schedules, terminals and travel information');
    // The specific failure this replaced: adjacent text with nothing between it.
    expect(label).not.toMatch(/NevisSchedules|terminalsand/);
  });

  it('makes the whole card the target, not just the heading', () => {
    // A card where only the title works feels broken on a phone and is
    // impossible to hit while walking through a terminal.
    const { container } = render(
      <JourneyCard
        icon="plane"
        title="Airport"
        lines={['Flights, facilities', 'and services']}
        onSelect={() => {}}
      />
    );
    const button = container.querySelector('button')!;
    expect(button.textContent).toContain('Airport');
    expect(button.textContent).toContain('Flights, facilities');
  });
});

describe('the trust strip', () => {
  it('states four checkable things rather than four adjectives', () => {
    render(<TrustStrip />);
    for (const claim of [
      'Verified SCASPA information',
      'Sources shown with answers',
      'Human help when needed',
      'We never ask for your personal data',
    ]) {
      expect(screen.getByText(claim)).toBeTruthy();
    }
  });
});

describe('what the landing page must not lose', () => {
  it('still quotes a real source rather than inventing one — T-18', () => {
    // The page once invented a sailing time here. The example answer is kb-192
    // as retrieved, and it survived the redesign deliberately: shortening a page
    // by deleting its only verified content is the wrong trade on this product.
    expect(LANDING).toContain('Verified on 2026-07-31');
    expect(LANDING).toContain('Official SCASPA website');
  });

  it('still shows the knowledge-base freshness from the running backend', () => {
    // A build constant would be a claim; this is a fact the reader can weigh.
    expect(LANDING).toContain('Information verified as of');
    expect(LANDING).toMatch(/useHealth/);
  });

  it('sends the question through the in-memory store, never the URL', () => {
    /*
     * A query string would put the question in history, in the address bar and
     * in every screenshot taken during a demonstration.
     */
    expect(LANDING).toContain('setPendingQuestion');
    expect(LANDING).not.toMatch(/search:\s*\{/);
  });
});
