import { useId } from 'react';
import { cn } from '@/lib/cn';

/**
 * The Pilot mark — compass, ring, rays, beacon, navigator.
 *
 * ## This is a transcription, not a redrawing
 *
 * The approved asset is a raster image on a white page. It cannot be used as it
 * stands: at 28px beside a chat message it turns to mush, on the navy sidebar it
 * arrives inside a white box, and no part of it can be animated for the thinking
 * state. So it is redrawn as geometry — and the geometry was MEASURED off the
 * asset rather than eyeballed, because "close at 96px and wrong at 28px" is
 * exactly what an eyeballed transcription produces.
 *
 * Every proportion below is a fraction of the source image, times 96:
 *
 *   ring          outer radius 0.3045, stroke 0.033        -> r 27.6, width 3.2
 *   compass tip   0.030 from the edge                      -> y 2.9
 *   compass base  0.242, half-width 0.034                  -> y 23.2, ±3.3
 *   beacon        centre y 0.358, radius 0.043             -> cy 34.4, r 4.1
 *   figure        top 0.397, widest 0.212 at y 0.64,
 *                 base 0.692                               -> 38.1, ±10.2, 66.4
 *
 * The spec's prohibitions are absolute and worth restating where someone might
 * be tempted: no lighthouse, no aircraft, no boat, no face, no eyes, no pilot
 * hat, no mascot. The mark IS the avatar.
 *
 * ## One artwork, two themes
 *
 * Not two drawings. The geometry is identical and only the colours resolve
 * differently, through the same tokens as everything else: `--color-brand-*`
 * carries the compass (a deep navy on white, a bright blue on navy — both
 * legible on their own ground), `--color-aqua` the ring, `--color-beacon` the
 * one warm point. That is the spec's "same logo, adapted for contrast" with no
 * second asset to keep in step.
 *
 * ## The gradient
 *
 * The one gradient in the product, and asked for by name: "deep blue -> aqua
 * through the central figure". `tests/contrast.test.ts` bans gradients on
 * READING surfaces, which is decision 0025's actual concern — contrast against a
 * gradient changes down a paragraph. A 28px mark carries no paragraph.
 *
 * ## Why the ids are generated
 *
 * `useId`, because a chat transcript renders one of these per assistant message
 * and duplicate `<defs>` ids in one document is undefined behaviour — the second
 * avatar silently borrows the first one's gradient.
 */

export type PilotAvatarState = 'idle' | 'thinking' | 'listening' | 'verified' | 'attention';

export interface PilotAvatarProps {
  /** 28-32 beside a message, 40-48 in the sidebar, large on the landing page. */
  size?: number;
  state?: PilotAvatarState;
  /**
   * Announced name, when the mark is the only thing identifying the speaker.
   * Omit it where a visible "PILOT" sits beside the mark — then it is
   * decorative and repeating it is noise in a screen reader.
   */
  label?: string;
  className?: string;
}

export function PilotAvatar({ size = 32, state = 'idle', label, className }: PilotAvatarProps) {
  const id = useId();
  const figureGradient = `pilot-figure-${id}`;
  const decorative = !label;

  return (
    <svg
      viewBox="0 0 96 96"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      role={decorative ? 'presentation' : 'img'}
      aria-hidden={decorative || undefined}
      aria-label={label}
      focusable="false"
    >
      {!decorative && <title>{label}</title>}

      <defs>
        <linearGradient id={figureGradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-brand-500)" />
          <stop offset="100%" stopColor="var(--color-aqua)" />
        </linearGradient>
      </defs>

      {/*
        The pale diagonal rays, drawn first so everything else sits over them.
        Four thin spikes at 45 degrees, the faintest thing in the mark.

        `--color-brand-200` at 45%, and both halves of that were arrived at by
        rendering it. Translucent AQUA was the first try and it is wrong in the
        dark theme: a transparent colour over navy darkens towards the navy, so
        the rays turned into muddy teal smudges on the one ground where they most
        need to read as light. brand-200 is a strong blue on white and a pale
        blue on navy, so at partial opacity it lands correctly on both — pale
        blue over white, silver-blue over navy.
      */}
      <g fill="var(--color-brand-200)" opacity="0.45">
        {[45, 135, 225, 315].map((angle) => (
          <path
            key={angle}
            d="M48 5 L50.4 44 L48 48 L45.6 44 Z"
            transform={`rotate(${angle} 48 48)`}
          />
        ))}
      </g>

      {/*
        The ring. Its stroke-width is animated for the listening state, so it is
        set as an attribute rather than a class — the keyframes need something to
        interpolate from.
      */}
      <circle
        cx="48"
        cy="48"
        r="27.6"
        fill="none"
        stroke="var(--color-aqua)"
        strokeWidth="3.2"
        className={cn(state === 'listening' && 'animate-ring')}
      />

      {/*
        The four cardinal points, each a kite in two facets — the asset draws
        them faceted, and a flat triangle loses the thing that makes it read as a
        compass rose rather than as an arrow.
      */}
      <g>
        {[0, 90, 180, 270].map((angle) => (
          <g key={angle} transform={`rotate(${angle} 48 48)`}>
            <path d="M48 2.9 L44.7 23.2 L48 27.5 Z" fill="var(--color-brand-600)" />
            <path d="M48 2.9 L51.3 23.2 L48 27.5 Z" fill="var(--color-brand-400)" />
          </g>
        ))}
      </g>

      {/* The navigator: a cloak, a bright core, and the beacon above it. */}
      <path
        d="M48 38.1 C43.2 38.1 40.2 44.5 38.6 57 L37.8 63.5 L48 66.4 L58.2 63.5 L57.4 57 C55.8 44.5 52.8 38.1 48 38.1 Z"
        fill={`url(#${figureGradient})`}
      />
      <path d="M48 44 L55.5 63.5 L48 66.4 L40.5 63.5 Z" fill="var(--color-aqua)" />

      <circle
        cx="48"
        cy="34.4"
        r="4.1"
        fill="var(--color-beacon)"
        className={cn(state === 'thinking' && 'animate-beacon')}
      />

      {/*
        Status badges, bottom-right, drawn INSIDE the mark's box so the avatar
        stays one square at every size.

        The mark itself never changes for a state — the spec is explicit that
        there is no warning robot and no second avatar. A badge is added beside
        it and the identity holds.
      */}
      {state === 'verified' && (
        <g>
          <circle cx="76" cy="76" r="16" fill="var(--color-positive)" />
          <path
            d="M68 76.5 L74 82.5 L85 71"
            fill="none"
            stroke="var(--color-ink-on-bright)"
            strokeWidth="5.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
      {state === 'attention' && (
        <g>
          <circle cx="76" cy="76" r="16" fill="var(--color-caution)" />
          <path
            d="M76 67 V78"
            stroke="var(--color-ink-on-bright)"
            strokeWidth="5.5"
            strokeLinecap="round"
          />
          <circle cx="76" cy="85" r="2.9" fill="var(--color-ink-on-bright)" />
        </g>
      )}
    </svg>
  );
}
