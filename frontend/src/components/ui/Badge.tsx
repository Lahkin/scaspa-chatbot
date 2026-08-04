import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'board';

interface BadgeProps {
  tone?: Tone;
  children: ReactNode;
  /** Prefixed text for screen readers, e.g. "Status: ". Colour is not a message. */
  srPrefix?: string;
}

/**
 * A small status label.
 *
 * Note `warning` and `board`. The warning tone uses `--amber-text`, the readable
 * amber. The `board` tone is the only place `--amber-board` appears, and it is a
 * FILL on dark navy — never text on a light surface, where it measures 2.03:1.
 * tests/contrast.test.ts asserts both.
 */
const TONES: Record<Tone, string> = {
  neutral: 'bg-neutral-100 text-ink-muted',
  info: 'bg-blue-50 text-blue-700',
  success: 'bg-success-surface text-success',
  warning: 'bg-amber-surface text-amber-text',
  danger: 'bg-danger-surface text-danger',
  // Departure-board style: bright amber as a fill on a dark ground.
  board: 'bg-amber-board text-ink-on-bright',
};

export function Badge({ tone = 'neutral', children, srPrefix }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm px-2 py-0.5',
        'text-caption font-medium',
        TONES[tone]
      )}
    >
      {srPrefix ? <span className="sr-only">{srPrefix}</span> : null}
      {children}
    </span>
  );
}
