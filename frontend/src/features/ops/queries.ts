import { useMutation, useQuery } from '@tanstack/react-query';
import {
  getFlights,
  getSupportDirectory,
  getTariffs,
  getVessels,
  requestTariffQuote,
  submitSupportTicket,
  type ApiError,
  type FlightQuery,
  type TariffQuery,
  type VesselQuery,
} from '@/lib/api';
import { shouldRetry } from '@/features/chat/queries';
import type {
  FlightSchedulesResponse,
  SupportDirectory,
  SupportTicketRequest,
  SupportTicketResponse,
  TariffQuote,
  TariffQuoteRequest,
  TariffTableResponse,
  VesselArrivalsResponse,
} from '@/lib/types';

/**
 * Queries for the operations surfaces.
 *
 * `shouldRetry` is shared with the chat path deliberately — the rate limit is
 * per client across every endpoint, so a vessels page that retried a 429 would
 * spend the budget the user's next question needs.
 *
 * ## Why nothing here polls
 *
 * An operations console invites a refresh interval, and the design has a "Live
 * Refresh" button. But there is no live feed: with `OPS_DATA_SOURCE=none` the
 * answer is a fixed empty state, and polling it burns a rate-limit slot and a
 * traveller's metered data to re-learn nothing. Refresh is a button the user
 * presses, and it stays that way until a real feed exists to justify a timer.
 */

const STALE_MS = 60_000;

export function useVessels(params: VesselQuery = {}) {
  return useQuery<VesselArrivalsResponse, ApiError>({
    queryKey: ['vessels', params],
    queryFn: ({ signal }) => getVessels(params, { signal }),
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
    retry: shouldRetry,
  });
}

export function useFlights(params: FlightQuery = {}) {
  return useQuery<FlightSchedulesResponse, ApiError>({
    queryKey: ['flights', params],
    queryFn: ({ signal }) => getFlights(params, { signal }),
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
    retry: shouldRetry,
  });
}

export function useTariffs(params: TariffQuery = {}) {
  return useQuery<TariffTableResponse, ApiError>({
    queryKey: ['tariffs', params],
    // A published rate table does not change while someone reads it.
    staleTime: 5 * 60_000,
    queryFn: ({ signal }) => getTariffs(params, { signal }),
    refetchOnWindowFocus: false,
    retry: shouldRetry,
  });
}

export function useSupportDirectory() {
  return useQuery<SupportDirectory, ApiError>({
    queryKey: ['support-directory'],
    queryFn: ({ signal }) => getSupportDirectory({ signal }),
    staleTime: 15 * 60_000,
    refetchOnWindowFocus: false,
    retry: shouldRetry,
  });
}

/** A quote is a deliberate action, so it is a mutation and is never retried silently. */
export function useTariffQuote() {
  return useMutation<TariffQuote, ApiError, TariffQuoteRequest>({
    mutationFn: (body) => requestTariffQuote(body),
    retry: false,
  });
}

/**
 * Raising a ticket.
 *
 * **Never retried, not even on a network failure.** A retry that succeeds after
 * an ambiguous timeout raises a second ticket with a second reference, and the
 * user is looking at a receipt for one of them with no way to know. Better to
 * fail visibly and let them press the button again having decided to.
 */
export function useSupportTicket() {
  return useMutation<SupportTicketResponse, ApiError, SupportTicketRequest>({
    mutationFn: (body) => submitSupportTicket(body),
    retry: false,
  });
}
