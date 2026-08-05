import type { ReactNode } from 'react';
import { Link } from '@tanstack/react-router';

/**
 * The three shapes `/settings` is built from.
 *
 * Extracted because the page assembles five sections and would otherwise be four
 * hundred lines of near-identical markup, which is the state in which one section
 * quietly loses its heading level or its `aria-labelledby` and nobody notices.
 *
 * ## The heading level is not a prop
 *
 * Every section is an `<h2>` under the page's one `<h1>`, and every row inside is
 * an `<h3>`. A `level` prop would let a caller produce `h2 → h4`, which is the
 * single most common way a page's outline is broken for screen-reader users who
 * navigate by heading. Nesting deeper than this is a sign the section wants
 * splitting rather than a fourth level.
 */

export function SettingsSection({
  id,
  icon,
  title,
  lead,
  children,
}: {
  /** Anchors the quick-jump links at the top of the page. */
  id: string;
  /** Decorative. The heading beside it already names the section. */
  icon: string;
  title: string;
  lead: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      /*
       * `scroll-mt-20` clears the sticky navy header.
       *
       * Without it, following a quick-jump link scrolls the section's heading to
       * y=0 — which is underneath the 56px bar — so the user lands on a section
       * whose title is hidden and reads the second paragraph first. It is the
       * classic in-page-anchor bug and costs one utility to avoid.
       */
      className="scroll-mt-20 overflow-hidden rounded-lg border border-ops-outline-variant bg-ops-surface"
    >
      <div className="flex items-start gap-3 border-b border-ops-outline-variant bg-ops-surface-low p-4">
        {/*
          A light tile, and it started out navy.

          These glyphs are colour emoji: the font paints them and `color` is
          ignored, so `text-ink-inverse` did nothing. On the navy tile the anchor
          on "About this assistant" came out dark-navy on navy and was very
          nearly invisible, and the notepad and ring-buoy were not much better.
          Emoji are drawn to sit on a light ground, so the tile is a light one.

          The alternative was hunting for glyphs that happen to render
          monochrome, which varies by platform and font version — a fix that
          works on this machine and quietly fails on someone's Android.
        */}
        <span
          aria-hidden="true"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border border-ops-outline-variant bg-ops-surface text-h3 leading-none"
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h2 id={`${id}-heading`} className="text-h3 font-semibold text-ops-ink">
            {title}
          </h2>
          <p className="mt-1 max-w-measure text-small text-ops-ink-variant">{lead}</p>
        </div>
      </div>

      <div className="space-y-3 p-4">{children}</div>
    </section>
  );
}

/**
 * One setting inside a section: a title, a badge saying where it is controlled,
 * and an explanation.
 *
 * The badge is the load-bearing part. Most of the accessibility section describes
 * things the *device* controls, and a row that looks identical to one with a
 * button on it reads as a setting the user has failed to find the switch for.
 * Saying "Follows your device" turns a missing control into an answer.
 */
export function SettingRow({
  title,
  body,
  badge,
  children,
}: {
  title: string;
  body: string;
  badge?: string | undefined;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-ops-outline-variant bg-ops-surface-low p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="text-small font-semibold text-ops-ink">{title}</h3>
        {badge ? (
          <span className="rounded-full bg-ops-surface-high px-2 py-0.5 text-caption font-medium text-ops-ink-variant">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="mt-1 max-w-measure text-small text-ops-ink-variant">{body}</p>
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}

/**
 * A row that goes somewhere else — support, privacy, About SCASPA.
 *
 * A `<Link>` and not a `<button onClick={navigate}>`: this is a navigation, so it
 * must be middle-clickable, copyable and openable in a new tab. A button that
 * navigates takes all three away from the user for no gain.
 *
 * The whole card is the target rather than a "Learn more" at the bottom, which
 * gives a comfortably-over-44px hit area on a phone without a single sizing
 * utility. The arrow is `aria-hidden` — the link's text already says it leads
 * somewhere, and "arrow right" announced after every one is noise.
 */
export function SettingsLinkRow({
  to,
  title,
  body,
  action,
}: {
  to: string;
  title: string;
  body: string;
  action: string;
}) {
  return (
    <Link
      to={to}
      className="flex min-h-touch items-center gap-3 rounded-md border border-ops-outline-variant bg-ops-surface-low p-3 hover:bg-ops-surface-high"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-small font-semibold text-ops-ink">{title}</span>
        <span className="mt-1 block max-w-measure text-small text-ops-ink-variant">{body}</span>
        <span className="mt-1 block text-small font-medium text-ops-sky underline">{action}</span>
      </span>
      <span aria-hidden="true" className="shrink-0 text-h3 text-ops-ink-variant">
        ›
      </span>
    </Link>
  );
}
