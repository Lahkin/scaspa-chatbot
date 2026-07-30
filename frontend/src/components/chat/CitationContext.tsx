import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import type { Reconciliation } from '@/features/chat/citations';

/**
 * Wires the chips to the source panel.
 *
 * Context rather than prop-drilling because a chip is rendered deep inside a
 * markdown tree — nested in a paragraph, inside a list item, possibly inside a
 * table cell — and threading callbacks down through react-markdown's `components`
 * map would mean rebuilding that map on every hover.
 */
interface CitationContextValue {
  reconciliation: Reconciliation;
  /** kb id currently hovered or focused, in either direction. */
  highlighted: string | null;
  setHighlighted: (id: string | null) => void;
  /** Open the source panel scrolled to this entry. */
  openSource: (id: string) => void;
}

const CitationCtx = createContext<CitationContextValue | null>(null);

export function useCitations(): CitationContextValue | null {
  return useContext(CitationCtx);
}

export function CitationProvider({
  reconciliation,
  onOpenSource,
  children,
}: {
  reconciliation: Reconciliation;
  onOpenSource?: ((id: string) => void) | undefined;
  children: ReactNode;
}) {
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const value = useMemo<CitationContextValue>(
    () => ({
      reconciliation,
      highlighted,
      setHighlighted,
      openSource: (id: string) => {
        setHighlighted(id);
        onOpenSource?.(id);
      },
    }),
    [reconciliation, highlighted, onOpenSource]
  );

  return <CitationCtx.Provider value={value}>{children}</CitationCtx.Provider>;
}
