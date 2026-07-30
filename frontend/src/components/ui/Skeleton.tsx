import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

interface SkeletonProps {
  className?: string;
  /** Rendered as several stacked bars, for a paragraph placeholder. */
  lines?: number;
}

/**
 * A loading placeholder.
 *
 * `aria-hidden`, because a screen reader should hear the live region announcing
 * "loading" once — not a description of grey rectangles.
 */
export function Skeleton({ className, lines = 1 }: SkeletonProps) {
  const reduced = useReducedMotion();
  const base = cn('rounded-sm bg-neutral-200', reduced ? '' : 'animate-pulse');

  if (lines <= 1) {
    return <span aria-hidden="true" className={cn(base, 'block h-4 w-full', className)} />;
  }

  return (
    <span aria-hidden="true" className={cn('block space-y-2', className)}>
      {Array.from({ length: lines }, (_, index) => (
        <span
          key={index}
          className={cn(base, 'block h-4', index === lines - 1 ? 'w-3/5' : 'w-full')}
        />
      ))}
    </span>
  );
}
