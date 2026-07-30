import type { ReactNode } from 'react';

interface VisuallyHiddenProps {
  children: ReactNode;
  /** Render as a different element when the context needs one, e.g. a `<span>` inside a paragraph. */
  as?: 'span' | 'div';
}

/**
 * Visible to a screen reader, invisible on screen.
 *
 * Uses the clip-rect technique rather than `display: none` or `visibility:
 * hidden`, both of which remove the content from the accessibility tree — which
 * is the opposite of what this is for.
 */
export function VisuallyHidden({ children, as: Tag = 'span' }: VisuallyHiddenProps) {
  return <Tag className="sr-only">{children}</Tag>;
}
