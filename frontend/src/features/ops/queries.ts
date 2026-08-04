import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import {
  getFlights,
  getGateMap,
  getMarineAdvisories,
  getOperatorProfile,
  getSupportDirectory,
  getTariffs,
  getVesselPositions,
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
  GateMapResponse,
  MarineAdvisoriesResponse,
  OperatorProfileResponse,
  SupportDirectory,
  SupportTicketRequest,
  SupportTicketResponse,
  TariffQuote,
  TariffQuoteRequest,
  TariffTableResponse,
  VesselArrivalsResponse,
  VesselPositionsResponse,
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

/*
 * The map, gate and advisory panels.
 *
 * No params, so no params in the key. They share `STALE_MS` with everything
 * else here and, like everything else here, they do not poll — see the note
 * above. A live AIS feed would be the first thing on this surface with a real
 * claim to a timer, and it would get one then rather than now.
 */
export function useVesselPositions() {
  return useQuery<VesselPositionsResponse, ApiError>({
    queryKey: ['ops', 'positions'],
    queryFn: ({ signal }) => getVesselPositions({ signal }),
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
    retry: shouldRetry,
  });
}

export function useGateMap() {
  return useQuery<GateMapResponse, ApiError>({
    queryKey: ['ops', 'gates'],
    queryFn: ({ signal }) => getGateMap({ signal }),
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
    retry: shouldRetry,
  });
}

export function useMarineAdvisories() {
  return useQuery<MarineAdvisoriesResponse, ApiError>({
    queryKey: ['ops', 'advisories'],
    queryFn: ({ signal }) => getMarineAdvisories({ signal }),
    staleTime: STALE_MS,
    refetchOnWindowFocus: false,
    retry: shouldRetry,
  });
}

/** The demo identity card. Null unless the backend runs the fixture feed. */
export function useOperatorProfile() {
  return useQuery<OperatorProfileResponse, ApiError>({
    queryKey: ['ops', 'profile'],
    queryFn: ({ signal }) => getOperatorProfile({ signal }),
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
    /*
     * Keep the rows on screen while the next set loads.
     *
     * §5.9 puts the search box and the category chips **inside** the table's
     * card, so a filter change that drops to the loading state takes the control
     * the user is operating away with it: the chips vanish on the click that
     * selects one, and the search box unmounts between keystrokes. A new
     * `queryKey` is a new query with no data, so this is not a refetch and
     * `isPending` is genuinely true.
     *
     * The previous page stays until the new one arrives, which is also the
     * honest picture — the rates on screen are rates, just not yet the filtered
     * ones — and `isPlaceholderData` marks the difference for anything that
     * needs it.
     */
    placeholderData: keepPreviousData,
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
