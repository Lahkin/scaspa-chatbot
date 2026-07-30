/**
 * Turn `[kb-014]` markers into placeholder elements — on the AST, not the string.
 *
 * ### Why this cannot be a string replace
 *
 * The obvious implementation is `text.replace(/\[kb-\d+\]/g, ...)` before handing
 * the answer to the markdown parser. It corrupts the document in at least three
 * ways, all of which reach the user:
 *
 *   - **Inside a code fence.** An answer explaining the citation format, or
 *     quoting a KB row, contains a literal `[kb-014]` that must render as text.
 *     A string replace rewrites it and the code block shows a chip.
 *   - **Inside a link.** `[kb-014](https://…)` is markdown link syntax. Replacing
 *     the label first destroys the link.
 *   - **Across a construct boundary.** A marker split by an emphasis run, or
 *     sitting inside a table cell, has different meaning depending on where the
 *     parser thinks it is — the string does not know.
 *
 * Running as a **rehype plugin over text nodes** means the parser has already
 * decided what is code, what is a link and what is prose. This visits only the
 * text nodes that survived that, and skips the ones whose ancestors say the text
 * is literal.
 *
 * ### Why it runs *after* rehype-sanitize
 *
 * The nodes this creates would otherwise be stripped by the sanitiser as unknown
 * markup. Running afterwards is safe because the elements are constructed here
 * from a strictly-matched id (`kb-` plus three or four digits) — no attacker-
 * controlled string reaches an attribute. The answer text has already been
 * sanitised by the time this runs.
 */

import type { Element, Root, Text } from 'hast';
import type { Plugin } from 'unified';
import { MARKER_PATTERN } from '@/features/chat/citations';

/**
 * Element types whose text is literal and must never be rewritten.
 *
 * `a` is included because a marker inside link text is part of the link's label,
 * and replacing it would put an interactive chip inside an anchor — invalid HTML
 * and an ambiguous tap target on a phone.
 */
const LITERAL_PARENTS = new Set(['code', 'pre', 'a']);

/** The attribute the renderer looks for. Read by the `span` component override. */
export const MARKER_ATTRIBUTE = 'data-kb-id';

interface Parent {
  type: string;
  tagName?: string;
  children?: unknown[];
}

/**
 * Hand-rolled walk rather than `unist-util-visit`.
 *
 * The visitor needs the *ancestor chain* to answer "is this text inside a code
 * block", and it replaces one node with several — which is exactly the case
 * where a generic visitor's index bookkeeping is easy to get wrong.
 */
export const rehypeCitations: Plugin<[], Root> = () => {
  return (tree: Root) => {
    walk(tree, []);
  };
};

function walk(node: Root | Parent, ancestors: string[]): void {
  const children = node.children;
  if (!Array.isArray(children)) return;

  const tag = node.type === 'element' ? (node.tagName ?? '') : '';
  const chain = tag ? [...ancestors, tag] : ancestors;

  // Inside code or a link, leave every descendant exactly as it is.
  if (chain.some((ancestor) => LITERAL_PARENTS.has(ancestor))) return;

  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index] as Parent & Partial<Text>;

    if (child.type === 'text') {
      const replacement = splitTextNode(child.value ?? '');
      if (replacement) {
        // Iterating backwards means this splice cannot disturb indices we have
        // yet to visit.
        children.splice(index, 1, ...replacement);
      }
      continue;
    }

    walk(child, chain);
  }
}

/**
 * Split one text node on its markers.
 *
 * Returns null when there is nothing to do, so the common case allocates nothing
 * and the tree is left untouched.
 */
function splitTextNode(value: string): (Text | Element)[] | null {
  const pattern = new RegExp(MARKER_PATTERN.source, 'g');
  if (!pattern.test(value)) return null;
  pattern.lastIndex = 0;

  const out: (Text | Element)[] = [];
  let cursor = 0;

  for (const match of value.matchAll(pattern)) {
    const id = match[1];
    const start = match.index ?? 0;
    if (id === undefined) continue;

    if (start > cursor) {
      out.push({ type: 'text', value: value.slice(cursor, start) });
    }

    out.push({
      type: 'element',
      // A `span` rather than a custom tag name: react-markdown maps components by
      // tag, and an unknown element risks being dropped or rendered raw. The
      // renderer distinguishes it by the data attribute.
      tagName: 'span',
      properties: { [MARKER_ATTRIBUTE]: id },
      children: [],
    });

    cursor = start + match[0].length;
  }

  if (cursor < value.length) {
    out.push({ type: 'text', value: value.slice(cursor) });
  }

  return out;
}
