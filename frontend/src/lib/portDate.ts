/**
 * Calendar dates, in the port's time zone rather than the reader's.
 *
 * ## Why this is not `new Date().toISOString().slice(0, 10)`
 *
 * SCASPA publishes a cruise schedule in whole days — `2026-09-02`, no time zone
 * attached — and "today" on that schedule means today **in St Kitts**. Two
 * shortcuts both get it wrong, in opposite directions:
 *
 * | Shortcut | What breaks |
 * | --- | --- |
 * | UTC (`toISOString`) | St Kitts is UTC−4. From 20:00 local until midnight, UTC has already rolled over, so a passenger checking the evening board is shown **tomorrow's** ships under the heading "Today". |
 * | The browser's local date | Correct in Basseterre and wrong everywhere else. A traveller's laptop is very often still on the time zone they left, and this product's readers are, by definition, people who have just arrived from somewhere. |
 *
 * So the port's zone is named explicitly and resolved through `Intl`, which
 * knows it. St Kitts and Nevis observes no daylight saving, but naming the zone
 * rather than hardcoding −4 means that stays a fact about the world instead of a
 * fact baked into this file.
 *
 * ## Everything here is a `YYYY-MM-DD` string, never a `Date`
 *
 * The API compares `call_date` as a string, so the client does too. A `Date` at
 * local midnight serialises to the previous day in any negative-offset zone,
 * which is exactly the class of bug this module exists to remove — reintroducing
 * `Date` objects between here and the query parameters would put it straight
 * back.
 */

/** The zone the schedule is published in. Not the reader's. */
export const PORT_TIME_ZONE = 'America/St_Kitts';

const PORT_DATE = new Intl.DateTimeFormat('en-GB', {
  timeZone: PORT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Today's calendar date in the port, as `YYYY-MM-DD`.
 *
 * Assembled from `formatToParts` rather than from a locale that happens to
 * print ISO order: `en-CA` does, on the engines anyone has checked, and relying
 * on that is relying on a locale database staying still.
 */
export function portToday(now: Date = new Date()): string {
  const parts = PORT_DATE.formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

/**
 * `days` after an ISO calendar date.
 *
 * Goes through `Date.UTC` so month and year rollover are the platform's problem
 * rather than this file's, and comes back out as a string immediately. UTC is
 * safe *here* precisely because both ends are plain dates with no clock on
 * them — the arithmetic never touches a zone.
 */
export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  const shifted = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) + days * 86_400_000);
  return shifted.toISOString().slice(0, 10);
}

const DISPLAY = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/**
 * `2026-09-02` → `2 Sep 2026`.
 *
 * Formatted in UTC deliberately, which looks like a contradiction of everything
 * above and is not: the string has already been fixed as a calendar date, and
 * `new Date('2026-09-02')` is parsed as UTC midnight. Formatting *that* instant
 * in the reader's zone is what would shift it — a reader in São Paulo would see
 * every cruise call a day early.
 */
export function formatCallDate(iso: string): string {
  const when = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(when.getTime()) ? iso : DISPLAY.format(when);
}
