import { useState, useSyncExternalStore } from 'react';
import {
  Badge,
  Button,
  Card,
  Chip,
  IconButton,
  Input,
  Sheet,
  Skeleton,
  Spinner,
  Textarea,
  Tooltip,
  VisuallyHidden,
} from '@/components/ui';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { SCENARIOS, getScenario, setScenario, subscribeToScenario } from '@/mocks/scenarios';

/**
 * Component gallery — every primitive in every state, one scrollable page.
 *
 * This is how the designers do their QA pass without cloning the repo, and how a
 * broken disabled state gets caught here rather than in front of a judge.
 *
 * Dev only: in production the route 404s, so it cannot be reached from a deployed
 * URL even by guessing the path.
 *
 * Adding a component? Add every one of its states here. A state that is only
 * reachable by driving the app into it is a state nobody ever looks at.
 */
export function Gallery() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [chipOn, setChipOn] = useState(true);
  const [text, setText] = useState('');
  const reduced = useReducedMotion();

  return (
    <div className="space-y-10 pb-24">
      <header className="space-y-2">
        <h1 className="text-h1 font-semibold">Component gallery</h1>
        <p className="text-small text-ink-muted">
          Every primitive in every state. Tab through the page: every focus ring must be visible and
          the order must make sense.
        </p>
        <p className="text-caption text-ink-subtle">
          Reduced motion is currently <strong>{reduced ? 'ON' : 'off'}</strong> — animations are
          gated on it.
        </p>
      </header>

      <Section title="Button" note="All four variants across all six states.">
        <StateGrid columns={['default', 'disabled', 'loading']}>
          {(['primary', 'secondary', 'ghost', 'danger'] as const).map((variant) => (
            <Row key={variant} label={variant}>
              <Button variant={variant}>Ask SCASPA</Button>
              <Button variant={variant} disabled>
                Ask SCASPA
              </Button>
              <Button variant={variant} loading loadingLabel="Asking">
                Ask SCASPA
              </Button>
            </Row>
          ))}
        </StateGrid>
        <p className="text-caption text-ink-subtle">
          Hover, focus-visible and active are live — use a mouse and the Tab key. Loading keeps the
          button the same size so the row does not reflow under a thumb.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
          <Button fullWidth>Full width</Button>
        </div>
      </Section>

      <Section
        title="IconButton"
        note="Label is required — an unlabelled icon button is invisible to a screen reader."
      >
        <div className="flex flex-wrap items-center gap-3">
          {(['primary', 'secondary', 'ghost', 'danger'] as const).map((variant) => (
            <IconButton key={variant} label={`Send (${variant})`} variant={variant}>
              <span aria-hidden="true">↑</span>
            </IconButton>
          ))}
          <IconButton label="Disabled send" disabled>
            <span aria-hidden="true">↑</span>
          </IconButton>
          <IconButton label="Sending" loading>
            <span aria-hidden="true">↑</span>
          </IconButton>
        </div>
      </Section>

      <Section title="Input">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Default input" placeholder="Type a question" />
          <Input
            label="Input with hint"
            hint="We never store what you type."
            placeholder="Question"
          />
          <Input label="Input with error" error="Please enter a question." defaultValue="" />
          <Input label="Disabled input" disabled defaultValue="Cannot edit" />
          <Input label="Numeric (tabular)" numeric defaultValue="1,234.56" />
          <Input label="Hidden label" labelHidden placeholder="Label is hidden but announced" />
        </div>
      </Section>

      <Section
        title="Textarea"
        note="Auto-grows to a cap, then scrolls — so the send button stays reachable."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Textarea
            label="Auto-growing"
            hint="Grows to 6 rows, then scrolls."
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Type several lines to watch it grow"
          />
          <Textarea
            label="Textarea with error"
            error="That question is too long."
            defaultValue="…"
          />
          <Textarea label="Disabled textarea" disabled defaultValue="Cannot edit" />
        </div>
      </Section>

      <Section title="Chip" note="How most people start a conversation without typing.">
        <div className="flex flex-wrap gap-2">
          <Chip>Ferry times</Chip>
          <Chip selected={chipOn} onClick={() => setChipOn((v) => !v)}>
            Toggle me
          </Chip>
          <Chip disabled>Disabled</Chip>
        </div>
      </Section>

      <Section
        title="Badge"
        note="`board` is the ONLY place the bright amber appears, and it is a fill on navy."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Neutral</Badge>
          <Badge tone="info">Info</Badge>
          <Badge tone="success" srPrefix="Status: ">
            Verified
          </Badge>
          <Badge tone="warning" srPrefix="Status: ">
            Unverified
          </Badge>
          <Badge tone="danger">Error</Badge>
          <Badge tone="board">Departure board</Badge>
        </div>
      </Section>

      <Section title="Card">
        <div className="grid gap-4 sm:grid-cols-3">
          <Card title="Default">Elevated surface.</Card>
          <Card title="Muted" tone="muted">
            Recessed surface.
          </Card>
          <Card title="Outlined" tone="outlined">
            Stronger boundary.
          </Card>
        </div>
      </Section>

      <Section
        title="Sheet"
        note="Bottom sheet on mobile, side panel from sm up. Traps focus, Escape closes, focus is restored."
      >
        <Button onClick={() => setSheetOpen(true)}>Open sheet</Button>
        <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Sources">
          <div className="space-y-3">
            <p className="text-small text-ink-muted">
              Tab around: focus stays inside. Press Escape: it closes and focus returns to the
              button that opened it.
            </p>
            <Button variant="secondary">A focusable thing</Button>
            <Button variant="ghost">Another one</Button>
          </div>
        </Sheet>
      </Section>

      <Section
        title="Tooltip"
        note="Supplementary only. Unreachable by touch, so nothing essential lives here."
      >
        <Tooltip content="Verified against a SCASPA source on 2026-04-01.">
          <Button variant="secondary">Hover or focus me</Button>
        </Tooltip>
      </Section>

      <Section title="Spinner">
        <div className="flex items-center gap-6">
          <Spinner size="sm" />
          <Spinner size="md" />
          <Spinner size="lg" />
          <span className="text-caption text-ink-subtle">
            Static ring under reduced motion, not a slower spin.
          </span>
        </div>
      </Section>

      <Section title="Skeleton">
        <div className="grid max-w-md gap-4">
          <Skeleton />
          <Skeleton lines={3} />
        </div>
      </Section>

      <Section title="VisuallyHidden">
        <p className="text-small">
          There is hidden text here
          <VisuallyHidden> — only a screen reader hears this part.</VisuallyHidden>. Inspect the DOM
          or use a screen reader to find it.
        </p>
      </Section>

      <Section
        title="Shells"
        note="Rendered in real iframes at real widths — the only way to see a breakpoint is to be at it."
      >
        <ShellPreviews />
      </Section>

      <Section
        title="Mock scenarios"
        note="Every state the backend can genuinely return. Switching here changes what the API serves for the whole app."
      >
        <ScenarioPicker />
      </Section>

      <Section title="Typography scale">
        <div className="space-y-1">
          <p className="text-display font-semibold">Display 36</p>
          <p className="text-h1 font-semibold">Heading 1 — 30</p>
          <p className="text-h2 font-semibold">Heading 2 — 24</p>
          <p className="text-h3 font-semibold">Heading 3 — 20</p>
          <p className="text-lead">Lead 18</p>
          <p className="text-body">Body 16 — the default reading size.</p>
          <p className="text-small text-ink-muted">Small 14</p>
          <p className="text-caption text-ink-subtle">Caption 12</p>
        </div>
      </Section>

      <Section
        title="Tabular figures"
        note="Quantities line up. A fare column that jitters is easy to misread."
      >
        <div className="grid max-w-sm grid-cols-2 gap-x-6">
          <div>
            <p className="text-caption text-ink-subtle">Default figures</p>
            <p>1,111.11</p>
            <p>44.44</p>
            <p>333.33</p>
          </div>
          <div>
            <p className="text-caption text-ink-subtle">.tabular</p>
            <p className="tabular">1,111.11</p>
            <p className="tabular">44.44</p>
            <p className="tabular">333.33</p>
          </div>
        </div>
      </Section>

      <Section title="Colour tokens" note="Interim. Replaced wholesale when the designers deliver.">
        <Swatches
          label="Blue ramp"
          tokens={[
            'bg-blue-50',
            'bg-blue-100',
            'bg-blue-200',
            'bg-blue-300',
            'bg-blue-400',
            'bg-blue-500',
            'bg-blue-600',
            'bg-blue-700',
            'bg-blue-800',
            'bg-blue-900',
          ]}
        />
        <Swatches
          label="Neutral ramp"
          tokens={[
            'bg-neutral-0',
            'bg-neutral-50',
            'bg-neutral-100',
            'bg-neutral-200',
            'bg-neutral-300',
            'bg-neutral-400',
            'bg-neutral-500',
            'bg-neutral-600',
            'bg-neutral-700',
            'bg-neutral-800',
            'bg-neutral-900',
          ]}
        />
        <Swatches
          label="Status"
          tokens={['bg-amber-board', 'bg-amber-text', 'bg-success', 'bg-danger']}
        />
      </Section>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="border-b border-border pb-1 text-h2 font-semibold">{title}</h2>
        {note ? <p className="mt-1 text-caption text-ink-subtle">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function StateGrid({ columns, children }: { columns: string[]; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[7rem_repeat(3,minmax(0,1fr))] gap-3 text-caption text-ink-subtle">
        <span />
        {columns.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_repeat(3,minmax(0,1fr))] items-center gap-3">
      <span className="text-small text-ink-muted">{label}</span>
      {children}
    </div>
  );
}

function Swatches({ label, tokens }: { label: string; tokens: string[] }) {
  return (
    <div className="space-y-1">
      <p className="text-caption text-ink-subtle">{label}</p>
      <div className="flex flex-wrap gap-2">
        {tokens.map((token) => (
          <div key={token} className="text-center">
            <div className={`size-12 rounded-sm border border-border ${token}`} />
            <code className="text-caption text-ink-subtle">{token.replace('bg-', '')}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

/** The five widths the layout is verified at. */
const BREAKPOINTS = [320, 390, 768, 1024, 1440];

function ShellPreviews() {
  const [route, setRoute] = useState('/chat');
  const [width, setWidth] = useState(390);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {['/chat', '/widget'].map((path) => (
          <Chip key={path} selected={route === path} onClick={() => setRoute(path)}>
            {path}
          </Chip>
        ))}
        <span className="w-4" />
        {BREAKPOINTS.map((value) => (
          <Chip key={value} selected={width === value} onClick={() => setWidth(value)}>
            {value}px
          </Chip>
        ))}
      </div>

      <p className="text-caption text-ink-subtle">
        An iframe is a real viewport, so media queries, <code>dvh</code> and the docked source panel
        behave exactly as they will on a device. Scaling a screenshot would show none of that.{' '}
        <code>npm run check:responsive</code> measures the same widths in headless Chromium and
        fails on overflow.
      </p>

      {/* The frame can be wider than this page at 1440px, so it scrolls inside its
          own container rather than making the gallery scroll sideways. */}
      <div className="overflow-x-auto rounded-md border border-border bg-surface-sunken p-3">
        <iframe
          key={`${route}-${width}`}
          title={`${route} at ${width}px`}
          src={route}
          style={{ width: `${width}px` }}
          className="h-[600px] rounded-sm border border-border-strong bg-surface"
        />
      </div>
    </div>
  );
}

function ScenarioPicker() {
  const scenario = useSyncExternalStore(subscribeToScenario, getScenario, () => 'happy');

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {SCENARIOS.map((entry) => (
          <Chip
            key={entry.id}
            selected={scenario === entry.id}
            onClick={() => setScenario(entry.id)}
          >
            {entry.label}
          </Chip>
        ))}
      </div>
      <p className="text-small text-ink-muted">
        <strong>{SCENARIOS.find((entry) => entry.id === scenario)?.label}</strong> —{' '}
        {SCENARIOS.find((entry) => entry.id === scenario)?.expected}
      </p>
      <p className="text-caption text-ink-subtle">
        The same switch is on the floating control in the corner of every page, so a failure can be
        reproduced without leaving the screen it broke on.
      </p>
    </div>
  );
}

export default Gallery;
