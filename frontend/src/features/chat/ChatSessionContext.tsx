import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { reconcile, type CitationEntry } from './citations';
import { useChatSession } from './useChatSession';
import type { ChatState } from './types';

/**
 * Holds the conversation for one shell.
 *
 * It exists because the chips and the source panel are **siblings, not
 * relatives**: the chips render deep inside `ChatCore`'s markdown tree, and the
 * panel is a docked column or a sheet owned by the shell. Activating a chip has
 * to open the panel and scroll it to an entry, which no amount of prop-drilling
 * between them can express.
 *
 * The alternative — moving `useChatSession` into each shell — would have meant
 * two copies of the wiring and would have broken the F003 contract that
 * `ChatCore` fills its parent and owns its own behaviour.
 */
interface ChatSessionValue {
  state: ChatState;
  send: (text: string) => Promise<void>;
  stop: () => void;
  dismissError: () => void;

  /** Sources for the most recent assistant answer. */
  entries: CitationEntry[];
  /** kb id highlighted by hover or focus, in either direction. */
  highlighted: string | null;
  setHighlighted: (id: string | null) => void;
  /** Set when a chip is activated; the panel scrolls to it. */
  scrollTo: string | null;
  /** Mobile / widget sheet visibility. */
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  openSource: (kbId: string) => void;
  /**
   * When the current request started, or null when nothing is in flight.
   *
   * Cleared as soon as the first token or tool event lands, because from that
   * point `AgentStatus` says something more specific than "thinking".
   */
  thinkingSince: number | null;
}

const Ctx = createContext<ChatSessionValue | null>(null);

export function useChatSessionContext(): ChatSessionValue {
  const value = useContext(Ctx);
  if (!value) {
    throw new Error('useChatSessionContext must be used inside <ChatSessionProvider>');
  }
  return value;
}

export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const session = useChatSession();
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [scrollTo, setScrollTo] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  // The panel shows the sources for the newest assistant answer. Older answers
  // keep their own chips, which stay numbered against the citations they were
  // reconciled with — the panel simply follows the current one.
  const latest = useMemo(
    () => [...session.state.messages].reverse().find((message) => message.role === 'assistant'),
    [session.state.messages]
  );

  const entries = useMemo(() => {
    if (!latest || latest.streaming) return [];
    return reconcile(latest.text, latest.citations ?? null, latest.grounded ?? true).entries;
  }, [latest]);

  // The generic indicator gives way the moment there is something specific to
  // show. A spinner alongside "Searching SCASPA knowledge base" is redundant.
  const pending = latest?.streaming === true;
  const nothingYet = pending && latest.text.length === 0 && (latest.activity?.length ?? 0) === 0;
  const thinkingSince = nothingYet ? latest.at.getTime() : null;

  const openSource = useCallback((kbId: string) => {
    setHighlighted(kbId);
    // A new object identity each time, so activating the same chip twice still
    // re-triggers the scroll effect.
    setScrollTo(kbId);
    setPanelOpen(true);
  }, []);

  const value = useMemo<ChatSessionValue>(
    () => ({
      ...session,
      entries,
      highlighted,
      setHighlighted,
      scrollTo,
      panelOpen,
      setPanelOpen,
      openSource,
      thinkingSince,
    }),
    [session, entries, highlighted, scrollTo, panelOpen, openSource, thinkingSince]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
