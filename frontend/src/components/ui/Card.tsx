import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

interface CardProps {
  children: ReactNode;
  /** Renders a heading and associates it with the region for screen readers. */
  title?: string;
  tone?: 'default' | 'muted' | 'outlined';
  className?: string;
  /** Use `<section>` with a label rather than a bare `<div>`. */
  as?: 'div' | 'section' | 'article';
}

const TONES = {
  default: 'bg-surface border border-border shadow-card',
  muted: 'bg-surface-muted border border-border',
  outlined: 'bg-surface border border-border-strong',
} as const;

export function Card({ children, title, tone = 'default', className, as: Tag = 'div' }: CardProps) {
  return (
    <Tag className={cn('rounded-md p-4', TONES[tone], className)}>
      {title ? <h3 className="mb-2 text-h3 font-semibold text-ink">{title}</h3> : null}
      {children}
    </Tag>
  );
}
