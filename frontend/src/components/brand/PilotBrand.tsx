import { cn } from '@/lib/cn';
import { PilotAvatar, type PilotAvatarState } from './PilotAvatar';

/**
 * The product lockup: the Pilot mark, PILOT, and SCASPA Digital Guide.
 *
 * ## Two brands, never merged
 *
 * This is NOT `LogoLockup`, and the distinction is the whole brand architecture:
 *
 *   SCASPA        the Authority. Institutional, official, the owner of the
 *                 information. Its seal is a supplied asset used verbatim.
 *   Pilot         the digital guide. The conversational identity, the thing
 *                 that answers, the thing with an avatar.
 *
 * The two marks appear together and are never combined into a hybrid. A page
 * may carry the SCASPA seal in its institutional header and this lockup as the
 * product identity; nothing may draw a seal with a compass in it.
 *
 * The same rule decides who "speaks" in the transcript: an assistant message is
 * fronted by the Pilot avatar, never by the Authority's seal. SCASPA owns the
 * service; Pilot is the one talking.
 *
 * ## Why the wordmark is text and not an image
 *
 * The supplied lockup is a raster. Setting PILOT as text instead means it
 * inherits the interface font, scales without a second asset, translates its
 * descriptor, is selectable, and is read aloud correctly — and the descriptor
 * genuinely does translate, so an image would have needed three of them.
 */

export type PilotBrandSize = 'sm' | 'md' | 'lg';

/**
 * Three sizes, an enum rather than a number.
 *
 * Same reasoning as `LogoLockup`: a free numeric prop lets a caller invent a
 * pairing of mark and type that nothing has drawn, and the first sign of it is a
 * wordmark sitting a pixel off its mark on one screen.
 *
 * `avatar` is in px because the mark is a fixed-ratio SVG; the type sizes are
 * tokens.
 */
const SIZES: Record<PilotBrandSize, { avatar: number; word: string; descriptor: string }> = {
  sm: { avatar: 32, word: 'text-section', descriptor: 'text-micro' },
  md: { avatar: 44, word: 'text-h2', descriptor: 'text-caption' },
  lg: { avatar: 84, word: 'text-display', descriptor: 'text-lead' },
};

export interface PilotBrandProps {
  size?: PilotBrandSize;
  state?: PilotAvatarState;
  /**
   * Render the mark alone, with the words available only to a screen reader.
   * For a constrained header, where the spec says to fall back to the mark.
   */
  markOnly?: boolean;
  className?: string;
}

export function PilotBrand({
  size = 'sm',
  state = 'idle',
  markOnly = false,
  className,
}: PilotBrandProps) {
  const scale = SIZES[size];

  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {/*
        The mark is decorative HERE, because the words beside it say the same
        thing — an avatar with a label next to a visible "PILOT" makes a screen
        reader announce the name twice.
      */}
      <PilotAvatar size={scale.avatar} state={state} />

      <span className={cn('min-w-0', markOnly && 'sr-only')}>
        {/*
          Tracked out, because the approved wordmark is. Uppercase as characters
          rather than as a text-transform: PILOT is a name, and a screen reader
          that meets `text-transform: uppercase` on a lowercase word may spell it
          out letter by letter.

          `text-ink`, not `text-brand-500`. The spec asks for a deep-blue PILOT
          on the light ground and a white one on the dark ground, which is
          precisely what the primary ink already is — #10264f on white, #f5f8fc
          on navy. A brand step would have given a bright blue wordmark in the
          dark theme, which is not what the approved lockup shows, and fixing
          that would have taken a theme-conditional class.
        */}
        <span className={cn('block truncate font-bold tracking-wordmark text-ink', scale.word)}>
          PILOT
        </span>
        <span className={cn('block truncate font-semibold text-aqua-text', scale.descriptor)}>
          SCASPA Digital Guide
        </span>
      </span>
    </span>
  );
}
