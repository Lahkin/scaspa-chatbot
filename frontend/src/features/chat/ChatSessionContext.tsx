import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { groundingOf, reconcile, type CitationEntry, type Grounding } from './citations';
import { useChatSession } from './useChatSession';
import type { ChatMachineState } from './reducer';

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
  state: ChatMachineState;
  /** `thinking` or `streaming`. The composer disables and offers Stop. */
  busy: boolean;
  /** True when the browser says there is no connection. */
  offline: boolean;
  send: (text: string) => Promise<void>;
  stop: () => void;
  dismissError: () => void;
  /** Clears the stored conversation id and the transcript together. */
  startNewConversation: () => void;

  /** Sources for the most recent assistant answer. */
  entries: CitationEntry[];
  /** How well the newest answer is sourced — §3.8. Undefined while streaming. */
  grounding: Grounding | undefined;
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

/**
 * `navigator.onLine`, as a store.
 *
 * Conclusive only when false. True proves nothing — a captive portal answers DNS
 * and drops the rest — which is why a failed fetch is the other half of the
 * signal and is treated as authoritative in `useChatSession`.
 */
function subscribeToOnline(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const session = useChatSession();
  const online = useSyncExternalStore(
    subscribeToOnline,
    () => (typeof navigator === 'undefined' ? true : navigator.onLine),
    () => true
  );
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

  /*
   * The panel's entries, and how well the answer above them is sourced.
   *
   * Reconciled once and read twice: §3.8's grounding badge is derived from the
   * SAME pass that numbers the chips, so the badge and the chips can never
   * disagree about which markers matched.
   */
  const { entries, grounding } = useMemo<{
    entries: CitationEntry[];
    grounding: Grounding | undefined;
  }>(() => {
    if (!latest || latest.streaming) return { entries: [], grounding: undefined };
    const citations = latest.citations ?? null;
    const grounded = latest.grounded ?? true;
    const reconciliation = reconcile(latest.text, citations, grounded);
    return {
      entries: reconciliation.entries,
      grounding: groundingOf(reconciliation, citations, grounded),
    };
  }, [latest]);

  // The generic indicator gives way the moment there is something specific to
  // show. A spinner alongside "Searching SCASPA knowledge base" is redundant.
  // `thinking` is precisely the state this indicator is for: sent, nothing back
  // yet. Once tokens or tool events arrive the status moves to `streaming` and
  // AgentStatus says something more specific.
  const thinkingSince = session.state.status === 'thinking' ? (latest?.at.getTime() ?? null) : null;

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
      busy: session.state.status === 'thinking' || session.state.status === 'streaming',
      offline: !online,
      entries,
      grounding,
      highlighted,
      setHighlighted,
      scrollTo,
      panelOpen,
      setPanelOpen,
      openSource,
      thinkingSince,
    }),
    [
      session,
      online,
      entries,
      grounding,
      highlighted,
      scrollTo,
      panelOpen,
      openSource,
      thinkingSince,
    ]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
