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

/*
 * There is deliberately no email constant in this module.
 *
 * One lived here, `SCASPA_EMAIL = null`, with a comment claiming its slot was
 * "rendered and visibly marked as pending". Nothing imported it and nothing
 * rendered it, so the comment described a screen that did not exist — and it
 * contradicted `AboutScaspa`, which omits the row instead. Two modules
 * disagreeing in prose about one address is exactly the failure the header of
 * this file warns about, with the added twist that the losing copy was dead.
 *
 * The address is a low-volatility published fact and belongs with the others in
 * `lib/scaspa-facts.ts`, which is the single source and is guarded by
 * `tests/scaspa-facts.test.ts`. Import it from there.
 */
