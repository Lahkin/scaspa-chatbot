import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import type { Message } from '@/features/chat/types';
import { MessageBubble } from './MessageBubble';

interface MessageListProps {
  messages: Message[];
  /** Rendered in place of the list when there are no messages. */
  emptyState?: React.ReactNode;
  /** Activating a citation chip opens the source panel at that entry. */
  onOpenSource?: ((kbId: string) => void) | undefined;
}

/** How far off the bottom still counts as "at the bottom". */
const BOTTOM_THRESHOLD_PX = 48;

/**
 * The transcript, and the scroll rule.
 *
 * The rule: **follow the newest message, until the user scrolls up. Then stop,
 * completely, and offer a way back.**
 *
 * Nothing about a chat interface is more irritating than being yanked away from
 * a sentence mid-read because another token arrived. It is worse here than in
 * most chat apps, because the thing being read is a fee table someone is copying
 * down — losing their place costs them the figure, not just the sentence.
 *
 * So the moment `scrollTop` moves away from the bottom, auto-scroll is off. It
 * comes back only when the user returns to the bottom themselves, or presses
 * "jump to latest". It is never re-enabled by a new message arriving, which is
 * the bug this is written to avoid.
 *
 * `useLayoutEffect` for the scroll itself: after paint, the user would see one
 * frame at the old position and then a jump.
 */
export function MessageList({ messages, emptyState, onOpenSource }: MessageListProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const [following, setFollowing] = useState(true);
  /**
   * The content signature at the moment the user scrolled away.
   *
   * `hasUnseen` is *derived* from comparing it with the current signature rather
   * than stored as its own flag. A flag would have to be set from the layout
   * effect that handles new content — a setState inside an effect, which cascades
   * an extra render on every token — and it can go stale: a flag set true stays
   * true even after the content it referred to has been read.
   */
  const [leftBottomAt, setLeftBottomAt] = useState<string | null>(null);
  const signatureRef = useRef('');
  const reduced = useReducedMotion();

  const atBottom = useCallback((element: HTMLElement) => {
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    return distance <= BOTTOM_THRESHOLD_PX;
  }, []);

  const scrollToBottom = useCallback(
    (smooth: boolean) => {
      const element = viewport.current;
      if (!element) return;
      element.scrollTo({
        top: element.scrollHeight,
        // Smooth scrolling is motion the user did not ask for. Under the reduced
        // motion preference it jumps instead — still arriving, without the travel.
        behavior: smooth && !reduced ? 'smooth' : 'auto',
      });
    },
    [reduced]
  );

  // Watch the user's own scrolling. This is the only place `following` is turned
  // off, and returning to the bottom is the only thing that turns it back on.
  useEffect(() => {
    const element = viewport.current;
    if (!element) return;

    const onScroll = () => {
      const bottom = atBottom(element);
      setFollowing((wasFollowing) => {
        // Record the signature only on the transition away from the bottom, so
        // "unseen" means "arrived since you left", not "arrived since the last
        // scroll event".
        if (wasFollowing && !bottom) setLeftBottomAt(signatureRef.current);
        if (bottom) setLeftBottomAt(null);
        return bottom;
      });
    };

    element.addEventListener('scroll', onScroll, { passive: true });
    return () => element.removeEventListener('scroll', onScroll);
  }, [atBottom]);

  // New content. Follow it, or record that there is something unseen.
  const lastMessage = messages.at(-1);
  const signature = `${messages.length}:${lastMessage?.text.length ?? 0}`;

  // Nothing but a DOM side effect. No state is set here, so a token does not
  // cost an extra render.
  useLayoutEffect(() => {
    signatureRef.current = signature;
    if (messages.length === 0) return;
    if (following) scrollToBottom(false);
    // Keyed on the signature so a growing final message counts as new content,
    // not just a new array entry — otherwise streaming would not follow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const hasUnseen = !following && leftBottomAt !== null && signature !== leftBottomAt;

  const jumpToLatest = () => {
    setFollowing(true);
    setLeftBottomAt(null);
    scrollToBottom(true);
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <div ref={viewport} className="flex-1 overflow-y-auto px-4 py-4" data-testid="transcript">
        <div className="mx-auto flex max-w-measure flex-col gap-4">
          {messages.length === 0
            ? emptyState
            : messages.map((message) => (
                <MessageBubble key={message.id} message={message} onOpenSource={onOpenSource} />
              ))}
        </div>
      </div>

      {/*
        Only offered when it is useful: the user has scrolled away *and* something
        has arrived since. A permanently visible jump button is chrome that covers
        the last line of the answer.
      */}
      {!following && hasUnseen && (
        <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
          <button
            type="button"
            onClick={jumpToLatest}
            className="pointer-events-auto inline-flex min-h-touch items-center gap-2 rounded-lg border border-border-strong bg-surface px-4 text-small font-medium text-blue-700 shadow-popover hover:bg-blue-50"
          >
            <span aria-hidden="true">↓</span>
            Jump to latest
          </button>
        </div>
      )}
    </div>
  );
}
