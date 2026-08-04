/**
 * Icon geometry, transcribed from the design spec's `<symbol>` sprite.
 *
 * Separate from `Icon.tsx` because a module that exports both a component and a
 * constant defeats React fast refresh — the eslint rule that says so is right,
 * and the data is genuinely data.
 *
 * Every path is copied verbatim, on the same 24-unit grid. Redrawing these by
 * eye would produce something that looks close at 16px and wrong at 20px.
 */

/** Every symbol in the spec's sprite that this product actually draws. */
export const ICON_PATHS = {
  // ── navigation and structure ──────────────────────────────────────────────
  'chevron-right': ['M9.5 5l7 7-7 7'],
  'chevron-left': ['M14.5 5l-7 7 7 7'],
  'chevron-down': ['M6 9.5l6 6 6-6'],
  'arrow-left': ['M19.5 12H4.5', 'M11 5.5l-6.5 6.5 6.5 6.5'],
  'arrow-right': ['M4.5 12h15', 'M13 5.5l6.5 6.5-6.5 6.5'],
  'arrow-up': ['M12 19.5V5', 'M5.5 11.5L12 5l6.5 6.5'],
  /*
   * The bar, and nothing else. The frame is a rounded `<rect>` in `RECTS`.
   *
   * This entry used to carry a square-cornered path for the frame AS WELL, and
   * so did `copy`, `microphone` and `headset` — the sprite draws each of those
   * frames with a `<rect rx>`, and transcribing them as paths and then adding
   * the rects left both shapes stacked. At 16px a sharp corner poking out from
   * under a rounded one reads as a rendering fault rather than as a glyph.
   */
  panel: ['M9.5 4.5v15'],
  search: ['M20 20l-3.6-3.6'],
  kebab: [],
  plus: ['M12 5v14', 'M5 12h14'],

  // ── state and meaning ─────────────────────────────────────────────────────
  check: ['M5 12.6l4.6 4.6L19 7.4'],
  x: ['M6.2 6.2l11.6 11.6', 'M17.8 6.2L6.2 17.8'],
  alert: ['M12 4.4l8.6 15.2H3.4L12 4.4z', 'M12 10v4.2', 'M12 17.1h.01'],
  info: ['M12 11.2v5', 'M12 8h.01'],
  clock: ['M12 7v5.2l3.4 2'],
  shield: ['M12 3l7.4 3v6.2c0 4.6-3.1 7.6-7.4 9.2-4.3-1.6-7.4-4.6-7.4-9.2V6L12 3z'],
  refresh: ['M20.4 12a8.4 8.4 0 11-2.6-6.1', 'M20.4 4v5.2h-5.2'],
  lightning: ['M13.2 2.8L4.8 13.6h6L10.4 21.2l8.8-11h-6.4l.4-7.4z'],
  /* Landed, as opposed to arrived. The spec gives these two a glyph each rather
   * than a hue, because "on the ground" and "at the stand" are both green and a
   * reader has to be able to tell them apart in greyscale. */
  'wheels-down': ['M12 4v11.5', 'M6.5 10L12 15.5 17.5 10', 'M5 20h14'],

  // ── domain ────────────────────────────────────────────────────────────────
  ship: [
    'M4.4 12.6l1.7-4.4a2 2 0 011.85-1.3h8.1a2 2 0 011.85 1.3l1.7 4.4',
    'M12 3v3.9',
    'M2.8 14.4c2 0 2.2 1.9 4.6 1.9s2.6-1.9 4.6-1.9 2.2 1.9 4.6 1.9 2.6-1.9 4.6-1.9',
    'M2.8 18.6c2 0 2.2 1.9 4.6 1.9s2.6-1.9 4.6-1.9 2.2 1.9 4.6 1.9 2.6-1.9 4.6-1.9',
  ],
  plane: [
    'M10.4 3.6a1.6 1.6 0 013.2 0V9l7.6 4.3v2L13.6 13v4.2l2.5 1.9v1.5L12 19.4l-4.1 1.2v-1.5l2.5-1.9V13l-7.6 2.3v-2L10.4 9V3.6z',
  ],
  receipt: ['M6 3.2h12v17.6l-3-1.9-3 1.9-3-1.9-3 1.9V3.2z', 'M9 8.2h6', 'M9 12.2h6'],
  anchor: ['M12 7.4V21', 'M7.4 11.6h9.2', 'M4 14.4a8 8 0 0016 0'],
  gate: ['M4.4 20.6V6.4L12 3.4l7.6 3v14.2', 'M3 20.6h18', 'M9.6 20.6v-6h4.8v6'],
  megaphone: ['M4 10v4a2 2 0 002 2h1l9 4V4L7 8H6a2 2 0 00-2 2z', 'M19 9.4a3.6 3.6 0 010 5.2'],
  headset: ['M4.2 14v-2a7.8 7.8 0 0115.6 0v2', 'M19.4 19v.4a2.4 2.4 0 01-2.4 2.4h-3.6'],
  sparkle: [
    'M11 2.8l1.85 4.85L17.7 9.5l-4.85 1.85L11 16.2 9.15 11.35 4.3 9.5l4.85-1.85L11 2.8z',
    'M18.2 14.6l.85 2.25 2.25.85-2.25.85-.85 2.25-.85-2.25-2.25-.85 2.25-.85.85-2.25z',
  ],
  tool: [
    'M19.8 6.6a4.9 4.9 0 01-6.4 6.4L6 20.4 3.6 18l7.4-7.4a4.9 4.9 0 016.4-6.4l-2.9 2.9 2.4 2.4 2.9-2.9z',
  ],
  chart: ['M4 4v16h16', 'M8 16v-4.5', 'M12.4 16V8', 'M16.8 16v-6.5'],
  filter: ['M4 5.2h16l-6.2 7.2v6.4l-3.6 1.8v-8.2L4 5.2z'],
  phone: [
    'M6.4 3.4h3.1l1.5 4-2 1.5a12.2 12.2 0 006.1 6.1l1.5-2 4 1.5v3.1a2 2 0 01-2.2 2C11.6 19 5 12.4 4.4 5.6a2 2 0 012-2.2z',
  ],
  pin: ['M12 21.2s7-5.7 7-11.2a7 7 0 10-14 0c0 5.5 7 11.2 7 11.2z'],
  user: ['M4.6 20a7.4 7.4 0 0114.8 0'],
  copy: ['M15 6.2A2.2 2.2 0 0012.8 4H6.2A2.2 2.2 0 004 6.2v6.6A2.2 2.2 0 006.2 15'],
  microphone: ['M5 11.5a7 7 0 0014 0', 'M12 18.5V21'],

  // ── the eleven the first transcription left out ────────────────────────────
  //
  // Each one is a glyph the handoff names for a control that exists: the
  // composer's attach button, the message-action row's edit and thumb, the
  // chart data table's header, the voice controls, the position map's empty
  // state. Transcribed from the same sprite on the same 24-unit grid.
  attach: [
    'M19.5 11.2l-8 8a4.7 4.7 0 01-6.7-6.7l8.4-8.4a3.3 3.3 0 014.7 4.7l-8.4 8.4a1.9 1.9 0 01-2.7-2.7l7.4-7.4',
  ],
  edit: ['M4 20h4l10.2-10.2a2.7 2.7 0 10-3.8-3.8L4 16.2V20z'],
  /* Thumbs down is this glyph at `rotate(180deg)` — handoff §1.3. There is no
   * separate down variant, because two hand-drawn thumbs never mirror exactly. */
  thumb: [
    'M7.5 21V10.2l4.6-6.7a2.1 2.1 0 011.9 2.9l-1.1 3.8h5.4a2 2 0 011.95 2.45l-1.35 6a2.4 2.4 0 01-2.35 1.85H7.5z',
  ],
  table: ['M3.6 9.6h16.8', 'M9.6 9.6v9.8'],
  file: [
    'M13.2 3.4H7A1.6 1.6 0 005.4 5v14A1.6 1.6 0 007 20.6h10A1.6 1.6 0 0018.6 19V8.8L13.2 3.4z',
    'M13.2 3.4v5.4h5.4',
  ],
  waveform: ['M3 12h2.5', 'M8 6.5v11', 'M12 3.5v17', 'M16 8v8', 'M20.5 12H21'],
  play: ['M7 4.6l12 7.4-12 7.4V4.6z'],
  pause: ['M9 4.6v14.8', 'M15 4.6v14.8'],
  map: ['M9 4.4L3.6 6.6v13l5.4-2.2 6 2.2 5.4-2.2v-13L15 6.6 9 4.4z', 'M9 4.4v13', 'M15 6.6v13'],
  dollar: [
    'M12 3v18',
    'M16.4 7.2c-.7-1.5-2.3-2.4-4.4-2.4-2.6 0-4.4 1.3-4.4 3.3 0 4.6 9 2.4 9 7.1 0 2.1-2 3.4-4.6 3.4-2.3 0-4-1-4.6-2.6',
  ],
} as const;

export type IconName = keyof typeof ICON_PATHS;

/**
 * The circles the spec draws that a `<path>` cannot express as cleanly.
 *
 * Kept separate rather than converted to arc paths: an arc path for a circle is
 * two commands with four flags nobody can read, and getting one flag wrong
 * produces a shape that is subtly not a circle at 14px.
 */
export const CIRCLES: Partial<Record<IconName, ReadonlyArray<[number, number, number]>>> = {
  search: [[11, 11, 7]],
  info: [[12, 12, 8.4]],
  clock: [[12, 12, 8.4]],
  anchor: [[12, 5, 2.4]],
  user: [[12, 8.2, 4]],
  /* The hole in the map pin. Missing from the first transcription, which left a
   * solid teardrop — readable as a pin, and not the sprite's pin. */
  pin: [[12, 10, 2.6]],
  kebab: [
    [12, 5.2, 1.1],
    [12, 12, 1.1],
    [12, 18.8, 1.1],
  ],
};

/** The rounded rectangles, for the same reason. */
export const RECTS: Partial<
  Record<IconName, ReadonlyArray<[number, number, number, number, number]>>
> = {
  panel: [[3, 4.5, 18, 15, 3]],
  copy: [[9, 9, 11, 11, 2.5]],
  microphone: [[9, 3, 6, 11, 3]],
  headset: [
    [2.4, 12.8, 4.4, 6.2, 2],
    [17.2, 12.8, 4.4, 6.2, 2],
  ],
  table: [[3.6, 4.6, 16.8, 14.8, 2.2]],
  thumb: [[2.6, 10.2, 4.4, 10.8, 1.5]],
};
