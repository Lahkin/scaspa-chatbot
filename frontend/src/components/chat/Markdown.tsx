import { memo, useMemo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import { MARKER_ATTRIBUTE, rehypeCitations } from '@/lib/markdown/rehypeCitations';
import { CitationChip } from './CitationChip';
import { ScheduleTable } from './ScheduleTable';

/**
 * Markdown from a language model, rendered safely.
 *
 * ### The security position, stated plainly
 *
 * react-markdown **escapes raw HTML by default**. `<script>` in model output
 * arrives on screen as the literal characters `<script>`. That default is the
 * protection, and the way it gets lost is by adding `rehype-raw` — which exists
 * precisely to turn embedded HTML back into live nodes. In a component rendering
 * text derived from retrieved documents, that is a stored-XSS sink: a knowledge
 * base row, or a scraped page, becomes script running on the SCASPA origin.
 *
 * So: **no `rehype-raw`, ever**, and no `dangerouslySetInnerHTML` anywhere in
 * this codebase (the ESLint config makes the attribute an error, so it is
 * enforced rather than remembered).
 *
 * `rehype-sanitize` is added as defence in depth. It is *not* what makes this
 * safe — the escaping default is. It is the second lock, for the case where
 * someone adds a plugin in a hurry a year from now: with sanitisation in the
 * pipeline, that change fails closed instead of silently opening the hole.
 */

/**
 * The allow-list, narrowed from hast's default.
 *
 * The default already blocks `script`, `style`, `iframe` and event handlers. Two
 * further restrictions:
 *
 *  - **Headings are capped at h3** by mapping h1/h2 down (see `components`
 *    below). A model has no business emitting an `<h1>` inside a chat bubble:
 *    the page already has one, and a second breaks the document outline a
 *    screen-reader user navigates by.
 *  - **`href` protocols are http, https and mailto only.** The default also
 *    permits `irc`, `ircs` and `xmpp`; none of them are reachable from a
 *    SCASPA answer and each is a way to hand the OS a URL nobody reviewed.
 *    `javascript:` was never on the list and is not being added.
 */
const schema = {
  ...defaultSchema,
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
  },
  attributes: {
    ...defaultSchema.attributes,
    // The renderer sets target/rel itself; accepting them from the document
    // would let content choose its own link behaviour.
    a: [...(defaultSchema.attributes?.a ?? [])],
  },
};

export interface MarkdownProps {
  children: string;
  /** Passed to any table: the "verified on" date from the associated citation. */
  verifiedOn?: string | null | undefined;
  sourceId?: string | null | undefined;
}

/**
 * Every element the model can emit gets a style. An unstyled `<blockquote>` is
 * indistinguishable from a paragraph, and an unstyled `<ol>` loses its numbers
 * to the Tailwind reset — which matters when the list is a set of directions to
 * a barrel collection point.
 */
function buildComponents(verifiedOn?: string | null, sourceId?: string | null): Components {
  return {
    p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,

    // h1 and h2 are demoted rather than dropped: the text is content, the level
    // is presentation, and silently deleting a heading loses the structure.
    h1: ({ children }) => (
      <h3 className="mt-4 mb-2 text-h3 font-semibold first:mt-0">{children}</h3>
    ),
    h2: ({ children }) => (
      <h3 className="mt-4 mb-2 text-h3 font-semibold first:mt-0">{children}</h3>
    ),
    h3: ({ children }) => (
      <h3 className="mt-4 mb-2 text-h3 font-semibold first:mt-0">{children}</h3>
    ),
    h4: ({ children }) => <h4 className="mt-3 mb-1 text-body font-semibold">{children}</h4>,
    h5: ({ children }) => <h5 className="mt-3 mb-1 text-body font-semibold">{children}</h5>,
    h6: ({ children }) => <h6 className="mt-3 mb-1 text-body font-semibold">{children}</h6>,

    // `list-outside` with padding, so a wrapped line aligns under the text and
    // not under the bullet.
    ul: ({ children }) => (
      <ul className="my-2 list-outside list-disc space-y-1 pl-5">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="my-2 list-outside list-decimal space-y-1 pl-5">{children}</ol>
    ),
    li: ({ children }) => <li className="pl-1">{children}</li>,

    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    del: ({ children }) => <del className="line-through opacity-70">{children}</del>,

    blockquote: ({ children }) => (
      <blockquote className="my-3 border-l-4 border-border-strong bg-surface-muted py-2 pl-3 text-ink-muted">
        {children}
      </blockquote>
    ),

    code: ({ className, children, ...rest }) => {
      // react-markdown gives a fenced block a language class; an inline span has
      // none. That is the only reliable way to tell them apart here.
      const fenced = /\blanguage-/.test(className ?? '');
      if (fenced) {
        return (
          <code className="block font-mono text-small break-words whitespace-pre-wrap" {...rest}>
            {children}
          </code>
        );
      }
      return (
        <code
          className="rounded-sm bg-surface-sunken px-1 py-0.5 font-mono text-small break-words"
          {...rest}
        >
          {children}
        </code>
      );
    },

    pre: ({ children }) => (
      <pre className="my-3 overflow-x-auto rounded-md bg-surface-sunken p-3">{children}</pre>
    ),

    hr: () => <hr className="my-4 border-border" />,

    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        // `noopener` stops the opened page reaching back through `window.opener`;
        // `noreferrer` stops it learning where the click came from. Both, always.
        rel="noopener noreferrer"
        className="text-blue-700 underline underline-offset-2 hover:text-blue-800"
      >
        {children}
        {/* The affordance is a real character in the accessible name, not a
            background image: "opens in a new tab" is information a screen-reader
            user needs as much as a sighted one. */}
        <span aria-hidden="true"> ↗</span>
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    ),

    // The signature component. Detected here, in the rendered tree, rather than
    // left to the default renderer.
    table: ({ children }) => (
      <ScheduleTable verifiedOn={verifiedOn} sourceId={sourceId}>
        {children}
      </ScheduleTable>
    ),
    // NOTE: thead/tbody/tr/th/td are deliberately NOT overridden.
    //
    // They were, as no-op pass-throughs, and it broke the table silently:
    // `ScheduleTable` identifies the header by `section.type === 'thead'`, which
    // only matches an *intrinsic* element. With an override in place the type is
    // the override function, so the header row was parsed as data — every column
    // then contained its own heading, classified as text, and the whole
    // right-alignment and amber treatment quietly disappeared. Leaving these to
    // react-markdown keeps the tree intrinsic and the detection working.

    // Citation markers, placed by `rehypeCitations` on the AST. Identified by the
    // data attribute rather than a custom tag name, so react-markdown's component
    // mapping (which is by tag) resolves it reliably.
    span: ({ children, ...rest }) => {
      const kbId = (rest as Record<string, unknown>)[MARKER_ATTRIBUTE];
      if (typeof kbId === 'string') return <CitationChip kbId={kbId} />;
      return <span {...rest}>{children}</span>;
    },

    img: ({ alt }) => (
      // Answers are text. An image in model output is either a hallucination or
      // a remote fetch nobody authorised, so the alt text is shown instead.
      <span className="text-caption text-ink-subtle">[image: {alt ?? 'untitled'}]</span>
    ),
  };
}

function MarkdownImpl({ children, verifiedOn, sourceId }: MarkdownProps) {
  const components = useMemo(() => buildComponents(verifiedOn, sourceId), [verifiedOn, sourceId]);

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      // Order matters. Sanitise first, then insert citation elements: the nodes
      // `rehypeCitations` creates would otherwise be stripped as unknown markup,
      // and they are safe to add afterwards because each is built here from a
      // strictly-matched id, not from arbitrary text.
      rehypePlugins={[[rehypeSanitize, schema], rehypeCitations]}
      components={components}
    >
      {children}
    </ReactMarkdown>
  );
}

/**
 * Memoised on the text. During streaming the parent re-renders on every token,
 * and without this the whole remark/rehype pipeline runs each time even when the
 * throttle has not released new text to parse.
 */
export const Markdown = memo(MarkdownImpl);
