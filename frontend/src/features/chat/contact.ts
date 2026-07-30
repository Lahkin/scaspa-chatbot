/**
 * SCASPA's published contact route.
 *
 * One module, because these strings appear in the escalation card, the ungrounded
 * notice, every high-volatility source entry and both shell headers — and a phone
 * number that is right in three places and wrong in the fourth is worse than one
 * that is wrong everywhere, because nobody notices.
 *
 * Taken from the published contact details, not invented.
 */

/** Full international form, so it dials from a foreign handset — a cruise passenger's. */
export const SCASPA_TEL_HREF = 'tel:+18694658121';
export const SCASPA_TEL_TEXT = '869-465-8121';

/**
 * The switchboard runs three lines. Each is a separate `tel:` link, because a
 * single link containing "8121 / 2 / 3" dials nothing at all — and someone
 * standing at a terminal should be able to try the next line with one tap.
 */
export const SCASPA_PHONE_LINES = [
  { href: 'tel:+18694658121', text: '869-465-8121' },
  { href: 'tel:+18694658122', text: '869-465-8122' },
  { href: 'tel:+18694658123', text: '869-465-8123' },
] as const;

export const SCASPA_POSTAL_ADDRESS = [
  'P.O. Box 963',
  'Bird Rock',
  'Basseterre',
  'St. Kitts',
] as const;

/**
 * ⚠️ Pending from the client.
 *
 * scaspa.com obfuscates the address to defeat scrapers, so it cannot be read off
 * the site and **must not be guessed**. A wrong email on a handoff card sends
 * someone's cargo query into a void and they never learn it did not arrive.
 *
 * The slot is rendered and visibly marked as pending rather than omitted: an
 * omitted field is invisible to whoever needs to chase it, and a visible one is a
 * standing question on screen at every demo.
 */
export const SCASPA_EMAIL: string | null = null;
