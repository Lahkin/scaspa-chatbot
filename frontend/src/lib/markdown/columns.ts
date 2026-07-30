/**
 * Deciding what a table column *is*, from what is in it.
 *
 * The rule that matters: **classify from the cells, not the header.** A column
 * headed "Fee" might hold "On application". A column headed "Berth" might hold
 * "40". Guessing from the header is guessing from a label a model wrote, and it
 * gets the tariff schedule — the thing this product exists to deliver — wrong in
 * exactly the cases that matter.
 *
 * Alignment is the visible consequence. Right-aligned figures share a decimal
 * position, so a column of fees can be scanned down and compared. Left-aligned
 * figures cannot: the eye has to re-find the magnitude on every row.
 */

export type ColumnKind = 'numeric' | 'text';

/**
 * Currency, quantities and times, in the forms the knowledge base actually uses.
 *
 *   XCD 44.44   EC$100    $1,200.00    44.44    1,111    18:00    12%    40ft
 *
 * Deliberately not a general number matcher. "Bay 4" and "Berth 2" are labels
 * that happen to contain a digit, and right-aligning them would be wrong.
 */
const NUMERIC_CELL =
  /^\s*(?:(?:XCD|EC\$|US\$|\$|£|€)\s*)?[-+]?\d[\d,\s]*(?:\.\d+)?\s*(?:%|ft|m|kg|t|hrs?|mins?)?\s*$/i;

/** 18:00, 6:05 pm, 06.30 — a sailing time is a quantity and lines up like one. */
const TIME_CELL = /^\s*\d{1,2}[:.]\d{2}\s*(?:[ap]\.?m\.?)?\s*$/i;

/** Placeholders that carry no figure and should not stop a column being numeric. */
const EMPTY_ISH = /^\s*(?:|-|–|—|n\/?a|tbc|tba|nil|none)\s*$/i;

export function isNumericCell(value: string): boolean {
  const text = value.trim();
  if (text === '') return false;
  return NUMERIC_CELL.test(text) || TIME_CELL.test(text);
}

/**
 * Classify one column from its body cells.
 *
 * A column is numeric when **every** cell that carries content is a figure.
 * Requiring all of them rather than a majority is deliberate: one "On
 * application" in a fee column means the column is not a clean set of
 * quantities, and right-aligning the rest would leave that row hanging oddly
 * while implying a precision the data does not have.
 *
 * Blanks and dashes are ignored rather than counted against — a tariff table
 * routinely has an empty cell, and that says nothing about the column's type.
 */
export function classifyColumn(cells: string[]): ColumnKind {
  const meaningful = cells.filter((cell) => !EMPTY_ISH.test(cell));
  if (meaningful.length === 0) return 'text';
  return meaningful.every(isNumericCell) ? 'numeric' : 'text';
}

/**
 * The column carrying the quantity a reader came for — the fee, the fare, the
 * time. It gets the departure-board amber.
 *
 * The **last** numeric column, because tables read left to right from
 * identifier to value: "Service | Unit | Fee" puts the answer on the right, and
 * so does "Route | Departs | Arrives | Fare". Highlighting the first numeric
 * column would light up "Unit" and leave the fee plain.
 *
 * Returns -1 when there is no numeric column, in which case nothing is
 * highlighted — an emphasis with nothing to emphasise is just decoration.
 */
export function quantityColumnIndex(kinds: ColumnKind[]): number {
  return kinds.lastIndexOf('numeric');
}

/** Zebra striping earns its keep only once rows are hard to track across. Below this, it is noise. */
export const ZEBRA_MIN_ROWS = 4;
