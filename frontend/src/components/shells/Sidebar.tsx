import { useId, useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import { PilotBrand } from '@/components/brand/PilotBrand';
import { HumanHelpCard } from '@/components/chat/HumanHelpCard';
import { DataSourceCard } from '@/components/ops/DataSourceCard';
import { ProvenanceBadge } from '@/components/ops/ProvenanceBadge';
import { Icon, type IconName } from '@/components/ui/Icon';
import type { DataSource, OperatorProfile } from '@/lib/types';

/**
 * The navigation sidebar — handoff §2.1, and the cover board draws it whole.
 *
 * 240px, `--surface-2`, a 1px right hairline, `16px 12px 12px` of padding, and
 * six things stacked in a fixed order:
 *
 *   1. the brand lockup, with the panel-collapse control beside it
 *   2. a 36px search field
 *   3. three nav groups — Assistant, Operations, Conditional
 *   4. the recorded questions, running under a fade
 *   5. the data-source status card
 *   6. the demonstration profile row
 *
 * ## Three rules in here are correctness, not layout
 *
 * **A recorded question re-asks; it does not restore a conversation.** History
 * is recorded and never fed back into the prompt, so a follow-up will not
 * resolve pronouns. Nothing in that list may imply otherwise — no "continue",
 * no thread affordance, no message count. `08-blocked-and-forbidden.md` lists
 * "any UI promising conversational memory" among the things that must not be
 * built at all.
 *
 * **The bottom row is not a user row.** No name, no organisation, no avatar
 * image, no menu, no sign-out. It renders the demo `OperatorProfile`, whose
 * `is_demo` is a required literal `true` precisely so it cannot quietly become
 * a real identity. In production `profile` is null and **the row is not
 * rendered at all** — no placeholder, no silhouette, no "sign in".
 *
 * **Console and Admin are conditionally present.** When a route is not built,
 * no entry appears: no disabled row, no lock, nothing. The dashed
 * "Admin — absent unless built" row on the board is documentation of that
 * absence, not a shipping state.
 *
 * ## Why the destinations are anchors and not router links
 *
 * A TanStack `<Link>` reads the router from context, and a sidebar full of them
 * makes `FullPageShell` un-renderable without one. This component stays
 * router-free and takes the current path as a prop, which is also what lets it
 * be tested on its own. The cost is a document load per navigation; the
 * destinations are seven whole screens rather than tabs, so that cost is paid
 * once each and is not what makes this product feel slow.
 */

/** A destination. `count` is the advisory badge; only Console carries one. */
interface NavItem {
  label: string;
  href: string;
  icon: IconName;
}

interface NavGroup {
  label: string;
  items: readonly NavItem[];
}

/**
 * Two groups, named for what a reader is doing rather than for how the routes
 * were classified.
 *
 * They used to read **ASSISTANT**, **OPERATIONS** and **CONDITIONAL**. The
 * first two are jargon and the third is not even a category — it is a note to
 * the developer that the route may not exist. "Conditional" as a heading above
 * a customer's navigation is the clearest possible sign of an interface that
 * was labelled from the inside out, and the Pilot spec names all three
 * explicitly as things to stop showing.
 *
 * Console joined Services rather than keeping a group of its own, because a
 * group heading reading "Console" above a single item called "Console" is a
 * heading that says nothing twice. It is still filtered out below when its
 * route does not exist — that behaviour was the only real content of the old
 * "Conditional" label, and it is a property of the item, not something a
 * reader needs a heading to be told.
 *
 * Admin has no route in this build and therefore no entry — and, per §2.8,
 * nothing in the search returns it either.
 */
const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: 'Ask Pilot',
    items: [{ label: 'Chat', href: '/chat', icon: 'sparkle' }],
  },
  {
    label: 'Services',
    items: [
      { label: 'Vessels', href: '/vessels', icon: 'ship' },
      { label: 'Flights', href: '/flights', icon: 'plane' },
      { label: 'Tariffs', href: '/tariffs', icon: 'receipt' },
      { label: 'Support', href: '/support', icon: 'headset' },
      { label: 'Console', href: '/ops', icon: 'chart' },
    ],
  },
];

interface SidebarProps {
  /** Re-ask a recorded question. It sends; it does not restore anything. */
  onAsk: (question: string) => void;
  /**
   * The questions asked in this session, newest first.
   *
   * Held in memory by the chat session and never written to the device —
   * `frontend/CLAUDE.md` rule 5. An empty list renders the group heading and
   * nothing under it rather than an "it will appear here" placeholder.
   */
  recordedQuestions: readonly string[];
  /**
   * Where this session's operational figures come from — §2.2.
   *
   * Null until the first ops response resolves, and the card is then absent
   * rather than placeholdered: a skeleton in this slot would occupy the space
   * reserved for a provenance claim without making one.
   */
  dataSource?: DataSource | null | undefined;
  /** The demonstration profile. **Null in production, and then no row.** */
  profile?: OperatorProfile | null | undefined;
  /** Right-aligned count on the Console row, in caution. Absent when zero. */
  advisoryCount?: number | undefined;
  /** Marks the current destination. Defaults to the document's own path. */
  currentPath?: string | undefined;
  /** Called after any action that should dismiss a drawer. No-op when docked. */
  onNavigate?: (() => void) | undefined;
  /**
   * Collapse the panel. Absent means the sidebar cannot collapse, and the
   * control is not rendered rather than rendered inert.
   */
  onToggleCollapsed?: (() => void) | undefined;
}

export function Sidebar({
  onAsk,
  recordedQuestions,
  dataSource,
  profile,
  advisoryCount,
  currentPath,
  onNavigate,
  onToggleCollapsed,
}: SidebarProps) {
  const navId = useId();
  const searchId = useId();
  const [query, setQuery] = useState('');

  const path = currentPath ?? (typeof window === 'undefined' ? '/' : window.location.pathname);
  const term = query.trim().toLowerCase();

  /*
   * The search filters what is already in the panel and reaches nothing else.
   *
   * §2.8 is explicit that "nothing in the sidebar search returns" an unbuilt
   * admin route — a search that surfaced an address the product does not serve
   * would be the same disclosure the shared 404 exists to prevent.
   */
  const groups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: term
          ? group.items.filter((item) => item.label.toLowerCase().includes(term))
          : group.items,
      })).filter((group) => group.items.length > 0),
    [term]
  );

  const questions = term
    ? recordedQuestions.filter((question) => question.toLowerCase().includes(term))
    : recordedQuestions;

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-border bg-surface-2 pt-4 pr-3 pb-3 pl-3">
      {/* 1 ── who is talking, and the control that narrows the panel ───────── */}
      <div className="flex shrink-0 items-start gap-2 px-0.5 pb-1">
        {/*
          PILOT, not the SCASPA seal.

          This panel sits beside a conversation, and the thing at the top of it
          reads as the identity of whoever is answering. That is Pilot. The
          Authority's seal is in the institutional header on the document pages,
          where it says who owns the service — decisions.md 0035.
        */}
        <PilotBrand />

        {/*
          `aria-expanded` + `aria-controls` describe the region it operates, so
          a screen-reader user is told the state rather than left to infer it
          from a glyph. The label says what the button will DO.
        */}
        {onToggleCollapsed ? (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-expanded={true}
            aria-controls={navId}
            className={cn(
              'inline-flex h-7 w-6 shrink-0 items-center justify-center rounded-ghost',
              'text-ink-muted hover:bg-surface-3 hover:text-ink',
              'transition-colors duration-fast ease-out-soft'
            )}
          >
            <Icon name="panel" size={18} />
            <span className="sr-only">Collapse the navigation</span>
          </button>
        ) : null}
      </div>

      {/*
        Online, and it means the interface — not the backend.

        A dot that claimed to know the server was reachable would be a claim
        this component cannot make and would be wrong for the several seconds
        after a connection drops. `HealthBanner` owns the real answer and says
        so loudly when it is bad. This is the quieter thing the mock-up asks
        for: Pilot is here and listening.
      */}
      <p className="flex shrink-0 items-center gap-2 px-0.5 pb-4 text-label text-ink-muted">
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-positive" />
        Online
      </p>

      {/* 2 ── search ────────────────────────────────────────────────────────── */}
      <div className="shrink-0">
        <label htmlFor={searchId} className="sr-only">
          Search the navigation and this session&rsquo;s questions
        </label>
        <div className="flex h-9 items-center gap-2 rounded-input border border-border bg-surface-3 px-2.5">
          <Icon name="search" size={16} className="text-ink-muted" />
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="min-w-0 flex-1 bg-transparent text-label text-ink outline-none"
          />
        </div>
      </div>

      {/* 3 ── the destinations ──────────────────────────────────────────────── */}
      <nav id={navId} aria-label="Sections" className="shrink-0">
        {groups.map((group) => (
          <div key={group.label}>
            <h2 className="px-2 pt-5 pb-2 text-micro font-semibold tracking-eyebrow text-ink-muted uppercase">
              {group.label}
            </h2>
            <ul>
              {group.items.map((item) => {
                const current = path === item.href || path.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      onClick={() => onNavigate?.()}
                      {...(current ? { 'aria-current': 'page' as const } : {})}
                      className={cn(
                        'flex h-nav-row items-center gap-2.5 rounded-button px-2.5',
                        'text-label font-medium',
                        'transition-colors duration-fast ease-out-soft',
                        current
                          ? 'bg-brand-500 text-ink-inverse'
                          : 'text-ink-muted hover:bg-surface-3 hover:text-ink'
                      )}
                    >
                      <Icon name={item.icon} size={18} />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {/*
                        The one figure in the navigation, and it comes from the
                        server. A count recomputed from visible rows drops to
                        zero under a filter and lies.
                      */}
                      {item.href === '/ops' && advisoryCount ? (
                        <span
                          className={cn(
                            'shrink-0 text-micro font-semibold tabular',
                            current ? 'text-ink-inverse' : 'text-caution'
                          )}
                        >
                          {advisoryCount}
                        </span>
                      ) : null}
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* 4 ── recorded questions ────────────────────────────────────────────── */}
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/*
          The heading appears with the first question, not before it. A labelled
          section with nothing under it reads as something that failed to load —
          and on a fresh load, before anyone has asked anything, it was the first
          thing an eye landed on in the T-23 rehearsal. There is no empty state
          to write here: the list explains itself the moment it has a row, and
          says nothing worth saying while it does not.
        */}
        {questions.length > 0 ? (
          <h2 className="shrink-0 px-2 pt-5 pb-2 text-micro font-semibold tracking-eyebrow text-ink-muted uppercase">
            Recorded questions
          </h2>
        ) : null}
        {/*
          The list runs under a fade to the sidebar's own colour rather than
          being clipped flat, so it reads as "more below" instead of as a list
          that happens to stop. 72px, per the handoff's own gradient.

          `fade-out-bottom` is a MASK rather than the overlay gradient the
          handoff draws, and that is the one difference: nothing is recoloured,
          the fade is in the alpha channel, and the dark system's "no gradients
          inside the frame" rule survives intact. Same picture, and it cannot
          swallow a click on the row beneath it.
        */}
        <ul className="fade-out-bottom min-h-0 flex-1 overflow-y-auto">
          {questions.map((question) => (
            <li key={question}>
              {/*
                It re-asks. It does not reopen anything, and nothing here says
                otherwise — no timestamp, no message count, no "continue".
              */}
              <button
                type="button"
                onClick={() => {
                  onAsk(question);
                  onNavigate?.();
                }}
                className={cn(
                  'flex h-8 w-full items-center rounded-button px-2.5 text-left',
                  'text-label text-ink-muted',
                  'transition-colors duration-fast ease-out-soft hover:bg-surface-3 hover:text-ink'
                )}
              >
                <span className="truncate">{question}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* 5 ── a person, permanently on screen ───────────────────────────────── */}
      <div className="shrink-0 pt-3">
        <HumanHelpCard />
      </div>

      {/* 6 ── where the figures come from ───────────────────────────────────── */}
      {dataSource ? (
        <div className="shrink-0 pt-3">
          <DataSourceCard source={dataSource} />
        </div>
      ) : null}

      {/* 7 ── the demonstration profile, or nothing at all ──────────────────── */}
      {profile ? <DemoProfileRow profile={profile} /> : null}
    </div>
  );
}

/**
 * The bottom row.
 *
 * **This is not a user row.** It renders a fixed demonstration object and says
 * so in two places — the second line and the badge — because the one thing it
 * must never be mistaken for is a signed-in identity. There is no menu, no
 * sign-out, no avatar image and no name that belongs to anybody.
 */
function DemoProfileRow({ profile }: { profile: OperatorProfile }) {
  return (
    <div className="mt-3 flex shrink-0 items-center gap-2.5 border-t border-border pt-3">
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-surface-3 text-brand-300"
      >
        <Icon name="anchor" size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-label font-medium text-ink">
          {profile.display_name}
        </span>
        <span className="block truncate text-micro font-medium text-ink-muted">
          Demonstration profile
        </span>
      </span>
      <ProvenanceBadge kind="demo" short />
    </div>
  );
}
