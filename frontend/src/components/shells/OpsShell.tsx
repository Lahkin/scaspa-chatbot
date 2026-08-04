import type { ReactNode } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { setPendingQuestion } from '@/features/chat/pending';
import { FullPageShell } from './FullPageShell';

/**
 * The operations screens, in the same shell as the conversation — handoff §2.1.
 *
 * ## What this replaces, and why it mattered
 *
 * `/vessels`, `/flights`, `/tariffs` and `/support` rendered through `OpsPage`:
 * a 56px navy bar with a "← Assistant" link, in the pre-handoff `ops-*` palette.
 * `/chat` rendered through `FullPageShell`. So a walkthrough that opens on the
 * assistant and moves to the vessel board **changed application at step two** —
 * different chrome, different palette, and a back link instead of navigation.
 *
 * §2.1 puts every operations screen in the 240px-sidebar shell with a 60px
 * header row and the Operations nav group's active row in `--brand-500`. This is
 * that, and it is a composition rather than a second shell: the chrome stays in
 * one component, so the two cannot drift.
 *
 * ## Why this file exists at all rather than props on the routes
 *
 * `FullPageShell` has no router dependency, which is what lets `shells.test.tsx`
 * render it bare. `useNavigate` would take that away and break every one of
 * those tests for no gain. So the navigation lives here, in a component that is
 * only ever rendered inside a route, and the shell stays renderable on its own.
 *
 * ## The sidebar's starter questions
 *
 * On chat they send into the transcript in front of you. Here there is no
 * transcript, so a question sent that way would vanish. It travels to `/chat`
 * through the in-memory handoff the landing page already uses — never a query
 * string, which would put the question in history, in the address bar and in
 * every screenshot.
 */
export function OpsShell({
  title,
  intro,
  children,
}: {
  /** The screen title, in the shell's header row. */
  title: string;
  /**
   * One line under the title. Optional, and genuinely optional: three of the
   * four screens carry one and the fourth reads better without.
   */
  intro?: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <FullPageShell
      title={title}
      onAsk={(question) => {
        setPendingQuestion(question);
        void navigate({ to: '/chat' });
      }}
    >
      {/*
        The content well — §2.1, "centred, max-width 720px". The operations
        tables are wider than a line of prose and the handoff draws them at the
        full column, so this caps the reading measure without capping the table:
        `max-w-5xl` is the width `OpsPage` used and the tables were designed
        against.
      */}
      <div className="mx-auto w-full max-w-5xl px-4 py-6 lg:px-7">
        {intro ? <p className="max-w-measure text-small text-ink-muted">{intro}</p> : null}
        <div className="mt-5 space-y-5">{children}</div>
      </div>
    </FullPageShell>
  );
}
