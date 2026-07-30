import { useQuery } from '@tanstack/react-query';
import { getHealth } from '@/lib/api';
import { config } from '@/lib/config';
import type { HealthResponse } from '@/lib/types';

/**
 * Poll `GET /api/health`.
 *
 * This is the step that turns an ops endpoint into an honesty feature. The backend
 * already knows when its index is missing or stale; without this the user finds
 * out by asking a question and getting a worse answer than they expected.
 *
 * Polling rather than checking once: a deploy that rebuilds the index mid-session
 * should clear the banner without the user reloading, and a service that degrades
 * mid-session should raise one.
 *
 * `retry: false` and a swallowed error on purpose — a failing health check is not
 * itself worth telling anyone about. If the service is genuinely down, the next
 * question produces a real error with real copy; a banner saying "we could not
 * check whether we are healthy" is noise.
 */
export function useHealth() {
  const query = useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: getHealth,
    refetchInterval: config.healthPollMs,
    // The users are on metered roaming data. Re-checking because they changed tab
    // spends their money to learn something that changes hourly at most.
    refetchOnWindowFocus: false,
    retry: false,
    staleTime: config.healthPollMs,
  });

  return query.data ?? null;
}

/**
 * Whether the knowledge base is old enough to mention.
 *
 * Not an error and not a banner — a quiet note. The information may be perfectly
 * current; "last verified on" is a fact the reader can weigh, which is the whole
 * posture of this product.
 */
export function isStale(health: HealthResponse | null): boolean {
  const updated = health?.index.kb_updated_at;
  if (!updated) return false;
  const parsed = Date.parse(updated);
  if (Number.isNaN(parsed)) return false;
  return Date.now() - parsed > config.kbStaleAfterDays * 24 * 60 * 60 * 1000;
}
