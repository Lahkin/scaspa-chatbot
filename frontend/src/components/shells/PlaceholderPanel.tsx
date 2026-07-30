interface PlaceholderPanelProps {
  title: string;
  note: string;
}

/**
 * A scaffold placeholder. Deliberately plain: it exists so routing can be
 * verified before any chat UI is built, and it should look unfinished so nobody
 * mistakes it for a design.
 */
export function PlaceholderPanel({ title, note }: PlaceholderPanelProps) {
  return (
    <section
      aria-labelledby="placeholder-title"
      className="rounded-card border border-dashed border-border-subtle bg-surface-muted p-6"
    >
      <h1 id="placeholder-title" className="text-xl font-semibold">
        {title}
      </h1>
      <p className="mt-2 text-sm text-ink-muted">{note}</p>
    </section>
  );
}
