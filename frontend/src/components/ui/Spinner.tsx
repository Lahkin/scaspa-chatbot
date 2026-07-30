import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Announced to screen readers. Set to null when a parent already announces the wait. */
  label?: string | null;
}

const SIZES = {
  sm: 'size-4 border-2',
  md: 'size-5 border-2',
  lg: 'size-8 border-[3px]',
} as const;

/**
 * A busy indicator.
 *
 * Under reduced motion it does not spin — it renders a static ring instead. A
 * spinner that keeps rotating is exactly the kind of perpetual motion the
 * preference exists to stop, and "the duration is 0.01ms" does not help when the
 * animation is infinite.
 */
export function Spinner({ size = 'md', className, label = 'Loading' }: SpinnerProps) {
  const reduced = useReducedMotion();

  return (
    <>
      <span
        aria-hidden="true"
        className={cn(
          'inline-block rounded-full border-current border-t-transparent align-[-0.125em]',
          SIZES[size],
          reduced ? 'opacity-60' : 'animate-spin',
          className
        )}
      />
      {label ? <span className="sr-only">{label}</span> : null}
    </>
  );
}
