import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, getHealth, sendMessage } from '@/lib/api';
import { config } from '@/lib/config';
import type { ChatResponse, HealthResponse } from '@/lib/types';
import { readConversationId, writeConversationId } from './conversation';

/**
 * Retry policy, in one place.
 *
 * **Never retry a 429.** Retrying a rate limit is how you extend a rate limit:
 * the window slides, the counter climbs, and the client that was trying hardest
 * to recover is the one kept out longest. Same for a 503 that carries a
 * `Retry-After` — the server has said when to come back, and any earlier is
 * ignoring it.
 *
 * **Never retry a 422.** The request was wrong; sending it again unchanged will
 * be wrong again, and the only thing achieved is two identical entries in the
 * server log.
 *
 * Retry only what a retry can plausibly fix: a request that never reached a
 * server, and a 5xx that is not a rate limit. The backend already applies its own
 * bounded retry with backoff on 429 and 5xx, so by the time an `UPSTREAM_*` code
 * arrives it has genuinely failed — hence two attempts here, not five.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!(error instanceof ApiError)) return false;

  // A schema mismatch is a contract bug. Retrying re-fetches the same wrong shape.
  if (error.status === 0) return error.offline;

  if (error.code === 'RATE_LIMITED') return false;
  if (error.code === 'UPSTREAM_RATE_LIMITED') return false;
  if (error.code === 'VALIDATION_ERROR') return false;
  if (error.status === 429) return false;
  if (error.status === 422) return false;

  return error.status >= 500;
}

/**
 * Health, polled in the background.
 *
 * `staleTime` matches the poll interval: index state changes on a deploy, not on
 * a timer, so re-fetching more often spends metered roaming data to learn
 * nothing.
 *
 * A failing health check is deliberately *not* surfaced. If the service is down,
 * the next question produces a real error with real copy; a banner reading "we
 * could not check whether we are healthy" is noise a user cannot act on.
 */
export function useHealth(): HealthResponse | null {
  const query = useQuery<HealthResponse>({
    queryKey: ['health'],
    queryFn: ({ signal }) => getHealth({ signal }),
    refetchInterval: config.healthPollMs,
    staleTime: config.healthPollMs,
    // The users are on metered roaming data. Re-checking because they changed tab
    // spends their money to replace something already on screen.
    refetchOnWindowFocus: false,
    retry: false,
  });

  return query.data ?? null;
}

/**
 * Non-streaming chat.
 *
 * The `conversation_id` is read fresh from storage on every send rather than
 * captured in a closure — another tab, or a "start a new conversation", may have
 * changed it since this component mounted. And whatever comes back is written
 * straight over the stored value: the TTL is 60 minutes and an expired id is
 * replaced by the server, so the id sent is not necessarily the id now held.
 */
export function useSendMessage() {
  const queryClient = useQueryClient();

  return useMutation<ChatResponse, ApiError, string>({
    mutationFn: (message: string) => sendMessage(message, readConversationId()),
    onSuccess: (response) => {
      writeConversationId(response.conversation_id);
      // A successful answer is a live service; drop any stale health failure so
      // the banner does not linger after the thing it warned about recovered.
      void queryClient.invalidateQueries({ queryKey: ['health'] });
    },
    retry: shouldRetry,
  });
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
