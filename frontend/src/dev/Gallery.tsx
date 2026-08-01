import { useRef, useState, useSyncExternalStore } from 'react';
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
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/hooks/useReducedMotion';
import { SCENARIOS, getScenario, setScenario, subscribeToScenario } from '@/mocks/scenarios';
import { setDraft as setComposerDraft } from '@/features/chat/draft';
import { Markdown } from '@/components/chat/Markdown';
import { StreamingMarkdown } from '@/components/chat/StreamingMarkdown';
import { AgentStatus } from '@/components/chat/AgentStatus';
import { SuggestedQuestions } from '@/components/chat/SuggestedQuestions';
import { MessageBubble } from '@/components/chat/MessageBubble';
import {
  CITATIONS_WITH_VOLATILITY,
  CITATION_FARES,
  CITATION_LOW,
  CITATION_SCHEDULE,
  TABLE_ANSWER,
} from '@/mocks/fixtures';
import { CitationProvider } from '@/components/chat/CitationContext';
import { EscalationCard } from '@/components/chat/EscalationCard';
import { SourceList } from '@/components/chat/SourceList';
import { reconcile } from '@/features/chat/citations';
import { ErrorState } from '@/components/chat/ErrorState';
import { NoAnswerCard } from '@/components/chat/NoAnswerCard';
import { ThinkingIndicator } from '@/components/chat/ThinkingIndicator';
import { ERROR_COPY } from '@/features/chat/errorCopy';
import type { FailureKind } from '@/features/chat/errorCopy';
import { HEALTH_DEGRADED, HEALTH_STALE, NO_ANSWER_RESPONSE } from '@/mocks/fixtures';
import { isStale } from '@/features/chat/queries';
import { ChartBlock } from '@/components/chat/ChartBlock';
import { ALL_CHART_FIXTURES } from '@/mocks/chartFixtures';
import { VoiceButton } from '@/components/chat/VoiceButton';
import { SpeakButton } from '@/components/chat/SpeakButton';
import {
  CANDIDATE_MIME_TYPES,
  detectVoiceCapability,
  pickMimeType,
} from '@/features/voice/capabilities';
import { config as appConfig } from '@/lib/config';
import { ScaspaMark } from '@/components/shells/ScaspaMark';
import { LogoLockup } from '@/components/brand/LogoLockup';
import { Sidebar } from '@/components/shells/Sidebar';
import { LanguagePicker } from '@/components/settings/LanguagePicker';
import {
  SettingRow,
  SettingsLinkRow,
  SettingsSection,
} from '@/components/settings/SettingsSection';
import { resetLocale } from '@/features/i18n';
import { SidebarDrawer } from '@/components/shells/SidebarDrawer';
import { AboutScaspa } from '@/components/about/AboutScaspa';
import { CardBlock } from '@/components/chat/CardBlock';
import {
  CARD_FLIGHTS,
  CARD_TARIFF,
  CARD_TICKET,
  CARD_VESSELS,
  CARD_VESSELS_EMPTY,
} from '@/mocks/opsFixtures';

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

      <Section
        title="ScheduleTable"
        note="The signature component. Column type is read from the cells, never the header."
      >
        <Markdown verifiedOn="2026-04-01" sourceId="kb-014">
          {TABLE_ANSWER}
        </Markdown>
        <p className="text-caption text-ink-subtle">
          Narrow the window to 390px: it becomes a labelled, focusable scroll region with a
          right-edge gradient that disappears at the end of the scroll.
        </p>
      </Section>

      <Section title="Markdown elements" note="Every element the model can emit, styled.">
        <div className="max-w-measure rounded-md border border-border bg-surface-muted p-4">
          <Markdown>{MARKDOWN_SAMPLE}</Markdown>
        </div>
      </Section>

      <Section
        title="Streaming markdown"
        note="A half-written table renders as plain text until it closes — drag the slider."
      >
        <StreamingPreview />
      </Section>

      <Section title="Message bubbles">
        <div className="max-w-measure space-y-4">
          <MessageBubble
            message={{
              id: 'g-user',
              role: 'user',
              text: 'How much is a 40-foot container?',
              at: new Date('2026-04-01T14:30:00Z'),
            }}
          />
          <MessageBubble
            message={{
              id: 'g-assistant',
              role: 'assistant',
              text: 'The placeholder charge is **XCD 888.88** per container [kb-014].',
              at: new Date('2026-04-01T14:30:04Z'),
              citations: [],
            }}
          />
          <MessageBubble
            message={{
              id: 'g-error',
              role: 'assistant',
              text: 'The placeholder charge is',
              at: new Date('2026-04-01T14:30:06Z'),
              error: {
                code: 'INTERNAL',
                message: 'Something went wrong at our end. Please call SCASPA on 869-465-8121.',
                request_id: 'demo',
              },
            }}
          />
        </div>
      </Section>

      <Section
        title="AgentStatus"
        note="Every string comes from the backend. None is invented here."
      >
        <div className="max-w-measure space-y-4">
          <div>
            <p className="mb-1 text-caption text-ink-subtle">Running</p>
            <AgentStatus activity={AGENT_RUNNING} answerStarted={false} />
          </div>
          <div>
            <p className="mb-1 text-caption text-ink-subtle">Collapsed once the answer starts</p>
            <AgentStatus activity={AGENT_DONE} answerStarted />
          </div>
        </div>
      </Section>

      <Section title="SuggestedQuestions">
        <div className="max-w-measure space-y-6">
          <SuggestedQuestions onSelect={() => {}} variant="empty" />
          <SuggestedQuestions onSelect={() => {}} variant="idle" />
        </div>
      </Section>

      <Section
        title="Citations — reconciliation"
        note="The rule the credibility story rests on. [kb-047] is cited in the text and absent from the citations array."
      >
        <CitationDemo />
      </Section>

      <Section
        title="Source panel entries"
        note="Volatility drives emphasis. High shows the travel line and a tel: link; low shows the date quietly."
      >
        <div className="max-w-measure rounded-md border border-border bg-surface-muted p-3">
          <SourceList
            entries={[
              { citation: CITATIONS_WITH_VOLATILITY[1]!, index: 1 },
              { citation: CITATIONS_WITH_VOLATILITY[0]!, index: 2 },
              { citation: CITATION_LOW, index: null },
            ]}
          />
        </div>
        <p className="text-caption text-ink-subtle">
          A citation with <strong>no</strong> volatility field — which is every citation the API
          sends today — is treated as high. The cautious default is deliberate.
        </p>
      </Section>

      <Section
        title="EscalationCard"
        note="refusal: true. A successful 200 and the system working as designed — so it must not look like an error."
      >
        <div className="max-w-measure space-y-4">
          <EscalationCard category="personal_record" />
          <EscalationCard category="vessel_or_aircraft_operations" />
        </div>
      </Section>

      <Section
        title="The three assistant states"
        note="Grounded, ungrounded and refusal, side by side — they must be tellable apart at a glance."
      >
        <div className="max-w-measure space-y-4">
          {ASSISTANT_STATES.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </div>
      </Section>

      <Section
        title="Unhappy paths — every failure, one place"
        note="The screens nobody demos and everybody hits. This is the Phase 3 QA page."
      >
        <div className="max-w-measure space-y-4">
          {(Object.keys(ERROR_COPY) as FailureKind[]).map((kind) => (
            <div key={kind} className="space-y-1">
              <p className="text-caption font-semibold text-ink-subtle">{kind}</p>
              <ErrorState
                kind={kind}
                requestId="demo-request-id-never-rendered"
                retryAfterS={kind === 'UPSTREAM_RATE_LIMITED' ? 8 : null}
                onRetry={() => {}}
                onDismiss={() => {}}
              />
            </div>
          ))}
        </div>
        <p className="text-caption text-ink-subtle">
          None of these shows a code, a request id, an HTTP status or a model name. The request id
          is logged to the console in dev and nowhere else.
        </p>
      </Section>

      <Section
        title="No verified answer"
        note="Task 3. Calm, not an error. Copy comes from the backend's NO_ANSWER_MESSAGE verbatim."
      >
        <div className="max-w-measure">
          <NoAnswerCard message={NO_ANSWER_RESPONSE.answer} />
        </div>
      </Section>

      <Section title="Thinking" note="The elapsed counter appears after three seconds.">
        <ThinkingDemo />
      </Section>

      <Section
        title="Health banners"
        note="A backend ops endpoint turned into a user-facing honesty feature."
      >
        <div className="max-w-measure space-y-3">
          <div className="overflow-hidden rounded-md border border-border">
            <StaticDegradedBanner />
          </div>
          <div className="overflow-hidden rounded-md border border-border">
            <StaticStaleBanner />
          </div>
          <p className="text-caption text-ink-subtle">
            Live versions are driven by the Health mock scenarios above; these are static so both
            are visible at once. Stale threshold: {String(isStale(HEALTH_STALE))} for{' '}
            {HEALTH_STALE.index.kb_updated_at}.
          </p>
        </div>
      </Section>

      <Section
        title="Composer edge cases"
        note="The counter appears at 900 and disables send above 1000, so the backend's 422 is unreachable."
      >
        <ComposerDemo />
      </Section>

      <Section
        title="Charts"
        note="Every shape the real subjects take. Recharts loads lazily — the first one here fetches it."
      >
        <ChartGallery />
      </Section>

      <Section
        title="Voice"
        note="Accessibility, not novelty. The mic renders nothing at all when it cannot work — check the console for the reason."
      >
        <VoiceSection />
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

      <NavigationSection />

      <CardSection />
    </div>
  );
}

/**
 * The sidebar, the lockup and the About panel — every state on one screen.
 *
 * The sidebar is rendered at its real docked width inside a fixed-height box,
 * because its internal `min-h-0` scrolling only behaves when it has a bounded
 * parent. Dropped into an unbounded page it looks correct and proves nothing.
 */
function NavigationSection() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [lastAsked, setLastAsked] = useState<string | null>(null);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);

  const sidebarProps = {
    onAsk: (question: string) => setLastAsked(question),
    onNewConversation: () => setLastAsked(null),
    onOpenSources: () => {},
    onOpenAbout: () => setAboutOpen(true),
    busy: false,
    hasConversation: true,
  };

  return (
    <>
      <Section
        title="LogoLockup"
        note="The asset is a documented placeholder — vector files, a reversed variant and written permission are outstanding client items. Below 32px the badge is dropped for a wordmark, because the real mark is a circular seal that turns to mud at that size."
      >
        <div className="flex flex-wrap items-end gap-6">
          <Figure label="lg — 48px">
            <LogoLockup size="lg" tagline="Ports and travel, St. Kitts" />
          </Figure>
          <Figure label="md — 32px, the sidebar header">
            <LogoLockup size="md" tagline="Ports and travel, St. Kitts" />
          </Figure>
          <Figure label="sm — wordmark fallback, no badge">
            <LogoLockup size="sm" />
          </Figure>
          <Figure label="nameHidden — the mark carries the name">
            <LogoLockup size="lg" nameHidden />
          </Figure>
        </div>
        <div className="rounded-md bg-navy p-4">
          <Figure label="reversed on navy — badge withheld until the asset arrives" inverse>
            <LogoLockup size="lg" variant="reversed" tagline="Ports and travel, St. Kitts" />
          </Figure>
        </div>
      </Section>

      {/*
        The dark-ground variants, on a dark ground.

        These could not go in the loops above: those render on the gallery's own
        light surface, where `onNavy` is white text on a brand-blue fill floating
        on white — legible by accident, and a completely misleading picture of
        the state it is meant to document. A component state has to be shown on
        the surface it was designed and measured for, or the gallery is showing
        something that does not exist.

        The panel is `--grad-sidebar` rather than a flat navy for the same
        reason: these variants live on a gradient, and a control that looks right
        against one navy can still fail against the other end of one.
      */}
      <Section
        title="On a navy ground"
        note="Sidebar, widget header and landing hero. Measured against the WORSE endpoint of the gradient — see tests/contrast.test.ts."
      >
        <div className="space-y-4 rounded-md bg-grad-sidebar p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="onNavy">Ask a question</Button>
            <Button variant="onNavy" disabled>
              Ask a question
            </Button>
            <Button variant="onNavy" loading loadingLabel="Asking">
              Ask a question
            </Button>
            <IconButton label="Show sources (onNavy)" variant="onNavy">
              <span aria-hidden="true">☰</span>
            </IconButton>
          </div>

          <ScaspaMark reversed />

          {/* The 1px horizon, at the size it is actually used. */}
          <div aria-hidden="true" className="h-px bg-hairline-horizon" />

          <div className="space-y-1">
            <p className="text-small text-on-navy-primary">
              on-navy-primary — headings and primary items, 10.89:1
            </p>
            <p className="text-small text-on-navy-secondary">
              on-navy-secondary — sub-labels and secondary text, 8.46:1
            </p>
            <p className="text-small text-on-navy-muted">
              on-navy-muted — icons, dividers, timestamps, 4.83:1
            </p>
            <p className="text-small text-on-navy-accent tabular">
              on-navy-accent — 1,111.11 — quantities and nothing else, 5.38:1
            </p>
          </div>
        </div>
      </Section>

      <Section
        title="Sidebar — docked"
        note="From lg up. Four facility groups, collapsed. No conversation history: the backend keeps conversations in memory for 60 minutes, lists none of them, and the privacy page says message content never reaches the device."
      >
        <div className="h-160 w-sidebar overflow-hidden rounded-md border border-border">
          <Sidebar {...sidebarProps} sourceCount={0} knowledgeVerifiedAt={null} />
        </div>
      </Section>

      {/*
        Both widths, side by side and live.

        The collapse is a width transition on the wrapper, so a static preview
        of each state would show the two ends and none of the thing that
        matters. The toggle here is wired to real state: press it and the rail
        animates exactly as it does in the shell.
      */}
      <Section
        title="Sidebar — collapsed rail, and the transition between"
        note="64px, not 0 — a rail that collapses to nothing takes the navigation away and leaves the user hunting for the way back. Every destination survives: four facilities, new conversation, the source count and the phone number, each with a real accessible name behind its glyph. The state is not persisted; frontend/CLAUDE.md rule 5 permits one key in one storage and this is not it."
      >
        <div className="flex gap-4">
          <div
            className={cn(
              'h-160 overflow-hidden rounded-md border border-border',
              'transition-width',
              railCollapsed ? 'w-sidebar-collapsed' : 'w-sidebar'
            )}
          >
            <Sidebar
              {...sidebarProps}
              sourceCount={3}
              knowledgeVerifiedAt="2026-06-01"
              collapsed={railCollapsed}
              onToggleCollapsed={() => setRailCollapsed((value) => !value)}
            />
          </div>
          <p className="text-caption text-ink-subtle">
            Currently <strong>{railCollapsed ? 'collapsed' : 'expanded'}</strong>. Use the toggle at
            the top of the rail. Tapping a facility while collapsed does both things at once — it
            widens the rail and opens that group, because the tap meant &ldquo;show me this
            one&rdquo;.
          </p>
        </div>
      </Section>

      <Section
        title="Sidebar — with sources and a verified date"
        note="The source count is hidden at xl, where the panel is already docked. The verified-as-of line is omitted entirely when health is unavailable, rather than showing a placeholder."
      >
        <div className="h-160 w-sidebar overflow-hidden rounded-md border border-border">
          <Sidebar {...sidebarProps} sourceCount={4} knowledgeVerifiedAt="2026-06-01" />
        </div>
      </Section>

      <Section
        title="Facility group — expanded"
        note="A real disclosure: aria-expanded on the trigger, aria-controls pointing at a region that is unmounted when closed. Questions use the departure-board treatment, matching the starter chips."
      >
        <p className="text-caption text-ink-subtle">
          Expand any group below. Last question sent: <strong>{lastAsked ?? 'none yet'}</strong>
        </p>
        <div className="h-160 w-sidebar overflow-hidden rounded-md border border-border">
          <Sidebar {...sidebarProps} sourceCount={2} knowledgeVerifiedAt="2026-06-01" />
        </div>
      </Section>

      <Section
        title="Language picker"
        note="The one control on /settings with a side effect. Radios rather than a select: on iOS a select opens a modal wheel that does not commit until Done, so the user picks a language, sees nothing happen, and picks it again. Choosing one repaints this whole page live and moves document.documentElement.lang with it. The real input is sr-only so the card can carry a 44px target without losing native radio semantics — the focus ring is put back on the card with peer-focus-visible, and removing that makes the control keyboard-invisible."
      >
        <div className="max-w-2xl rounded-md border border-border p-4">
          <LanguagePicker />
        </div>
        <p className="mt-2 text-caption text-ink-subtle">
          Chrome only. Assistant answers stay English — the knowledge base is English and CLAUDE.md
          rule 10 wants every figure verbatim from the retrieved chunk, which no translation layer
          can promise. Reset with the button below.
        </p>
        <button
          type="button"
          onClick={() => resetLocale()}
          className="mt-2 inline-flex min-h-touch items-center rounded-md border border-border-strong px-3 text-small font-medium text-ink"
        >
          Reset to English
        </button>
      </Section>

      <Section
        title="Settings section, rows and link rows"
        note="The three shapes /settings is built from. The badge on a row is load-bearing: most of the accessibility section describes things the device controls, and a row that looks identical to one with a button reads as a setting whose switch the user has failed to find. Saying 'Follows your device' turns a missing control into an answer."
      >
        <div className="max-w-2xl space-y-4">
          <SettingsSection
            id="gallery-settings"
            icon="🌐"
            title="Section heading"
            lead="The lead line under a section heading, which says what the section is for."
          >
            <SettingRow
              title="A row the device controls"
              body="Explains where the setting actually lives, rather than leaving the reader hunting for a switch that is deliberately absent."
              badge="Follows your device"
            />
            <SettingRow
              title="A row with a control"
              body="Same shape, but this one does something. The button sits under the explanation, never above it."
            >
              <Button variant="secondary">Do the thing</Button>
            </SettingRow>
            <SettingsLinkRow
              to="/privacy"
              title="A row that goes somewhere"
              body="A Link and not a button that navigates, so it stays middle-clickable, copyable and openable in a new tab."
              action="Read the privacy note"
            />
          </SettingsSection>
        </div>
      </Section>

      <Section
        title="Sidebar — as a drawer"
        note="Below lg. Traps focus, closes on Escape, and returns focus to the hamburger that opened it."
      >
        <div className="flex items-center gap-3">
          <IconButton
            ref={hamburgerRef}
            label="Open navigation"
            variant="secondary"
            aria-expanded={drawerOpen}
            aria-controls="gallery-drawer"
            onClick={() => setDrawerOpen(true)}
          >
            <span aria-hidden="true">☰</span>
          </IconButton>
          <span className="text-caption text-ink-subtle">
            {drawerOpen ? 'Open — press Escape to close' : 'Closed'}
          </span>
        </div>

        <SidebarDrawer
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          returnFocusTo={hamburgerRef}
          id="gallery-drawer"
        >
          <Sidebar
            {...sidebarProps}
            sourceCount={2}
            knowledgeVerifiedAt="2026-06-01"
            onNavigate={() => setDrawerOpen(false)}
          />
        </SidebarDrawer>
      </Section>

      <Section
        title="About SCASPA"
        note="One content component, two placements: this sheet and the /about-scaspa route. Low-volatility facts only — no fees, schedules, hours or statistics, which come from the assistant with a source and a date."
      >
        <Button variant="secondary" onClick={() => setAboutOpen(true)}>
          Open the About sheet
        </Button>
        <div className="max-w-measure rounded-md border border-border p-4">
          <AboutScaspa />
        </div>
        <Sheet open={aboutOpen} onClose={() => setAboutOpen(false)} title="About SCASPA">
          <AboutScaspa />
        </Sheet>
      </Section>
    </>
  );
}

/**
 * Every inline card, in every state.
 *
 * The pairing to look at is the first one: prose that says it cannot see live
 * movements, above a board that shows them. Both are true — the assistant named
 * a kind and nothing more, and the rows came from the feed with their own
 * notice attached.
 */
function CardSection() {
  return (
    <>
      <Section
        title="Inline card — vessel arrivals"
        note="The assistant supplies no rows. It names a kind; the backend fills the board from the feed and stamps the source on. That is what lets the sentence and the card disagree without either being wrong."
      >
        <div className="max-w-measure rounded-md border border-border p-3">
          <p className="text-body text-ink">
            I cannot see live vessel movements — this assistant answers from published information
            and has no operational feed of its own. The arrivals board below comes straight from
            SCASPA&rsquo;s feed and states its own source and age.
          </p>
          <CardBlock card={CARD_VESSELS} />
        </div>
      </Section>

      <Section
        title="Inline card — empty feed"
        note="The production default. An answer promising a board with no board is worse than an empty one, so the card renders and the notice explains it."
      >
        <div className="max-w-measure">
          <CardBlock card={CARD_VESSELS_EMPTY} />
        </div>
      </Section>

      <Section title="Inline card — flight schedules">
        <div className="max-w-measure">
          <CardBlock card={CARD_FLIGHTS} />
        </div>
      </Section>

      <Section
        title="Inline card — fee calculator"
        note="Arrives empty. No figure appears until the user asks for one, and the total comes back through the same QuoteResult the full page uses, so its disclaimer cannot be lost."
      >
        <div className="max-w-measure">
          <CardBlock card={CARD_TARIFF} />
        </div>
      </Section>

      <Section
        title="Inline card — support ticket"
        note="No name, email or attachment field, and it says so before it is filled in rather than after it is sent."
      >
        <div className="max-w-measure">
          <CardBlock card={CARD_TICKET} />
        </div>
      </Section>
    </>
  );
}

function Figure({
  label,
  inverse = false,
  children,
}: {
  label: string;
  inverse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div>{children}</div>
      <p className={inverse ? 'text-caption text-blue-100' : 'text-caption text-ink-subtle'}>
        {label}
      </p>
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

const MARKDOWN_SAMPLE = [
  '# Heading (capped at h3)',
  '',
  'A paragraph with **bold**, *italic*, ~~struck~~ and `inline code`.',
  '',
  '- An unordered item',
  '- Another, long enough to wrap and show that the second line aligns under the text rather than under the bullet',
  '',
  '1. An ordered item',
  '2. A second',
  '',
  '> A blockquote, for a quoted notice.',
  '',
  '```',
  'a fenced code block',
  '```',
  '',
  '[An external link](https://example.invalid/tariff)',
  '',
  '---',
].join('\n');

const AGENT_RUNNING = [
  {
    id: 'search_scaspa_knowledge-0',
    name: 'search_scaspa_knowledge' as const,
    summary: 'Searching SCASPA knowledge base — container tariff',
    ms: 148,
    done: true,
  },
  {
    id: 'search_site_content-1',
    name: 'search_site_content' as const,
    summary: 'Searching scaspa.com — tariff schedule PDF',
    ms: null,
    done: false,
  },
];

const AGENT_DONE = AGENT_RUNNING.map((step) => ({ ...step, ms: step.ms ?? 90, done: true }));

/** A table revealed one line at a time, so the anti-flicker behaviour is visible. */
function StreamingPreview() {
  const lines = TABLE_ANSWER.split('\n');
  const [upTo, setUpTo] = useState(lines.length);
  const text = lines.slice(0, upTo).join('\n');

  return (
    <div className="max-w-measure space-y-2">
      <label className="block text-caption text-ink-subtle">
        Reveal up to line {upTo} of {lines.length}
        <input
          type="range"
          min={0}
          max={lines.length}
          value={upTo}
          onChange={(event) => setUpTo(Number(event.target.value))}
          className="mt-1 block w-full"
        />
      </label>
      <div className="rounded-md border border-border bg-surface-muted p-4">
        <StreamingMarkdown text={text} streaming />
      </div>
    </div>
  );
}

const CITED_TEXT =
  'The placeholder fare is XCD 44.44 [kb-014]. The terminal opens at 06:00 [kb-047]. ' +
  'The last sailing back is 18:00 [kb-008].';

/** Toggles between pending and reconciled so the transition is visible. */
function CitationDemo() {
  const [arrived, setArrived] = useState(true);
  const citations = arrived ? [CITATION_FARES, CITATION_SCHEDULE] : null;
  const reconciliation = reconcile(CITED_TEXT, citations);

  return (
    <div className="max-w-measure space-y-3">
      <Chip selected={arrived} onClick={() => setArrived((value) => !value)}>
        {arrived ? 'citations event received' : 'still streaming (pending)'}
      </Chip>
      <div className="rounded-md border border-border bg-surface-muted p-4">
        <CitationProvider reconciliation={reconciliation}>
          <Markdown>{CITED_TEXT}</Markdown>
        </CitationProvider>
      </div>
      <p className="text-caption text-ink-subtle">
        <strong>kb-047 is not in the citations array.</strong> It vanishes — no chip, and never the
        raw <code>[kb-047]</code>, which would expose a row id inside an answer someone is being
        asked to trust. The sentence around it survives intact.
      </p>
    </div>
  );
}

const ASSISTANT_STATES = [
  {
    id: 'g-grounded',
    role: 'assistant' as const,
    text: 'The placeholder one-way adult fare is XCD 44.44 [kb-014].',
    at: new Date('2026-04-01T14:30:00Z'),
    grounded: true,
    citations: [CITATION_FARES],
    streaming: false,
  },
  {
    id: 'g-ungrounded',
    role: 'assistant' as const,
    text: 'The placeholder one-way adult fare is XCD 44.44 [kb-014].',
    at: new Date('2026-04-01T14:31:00Z'),
    grounded: false,
    citations: [CITATION_FARES],
    streaming: false,
  },
  {
    id: 'g-refusal',
    role: 'assistant' as const,
    text: 'That is not something I can advise on.',
    at: new Date('2026-04-01T14:32:00Z'),
    refusal: true,
    refusal_category: 'personal_record' as const,
    streaming: false,
  },
];

function ThinkingDemo() {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  return (
    <div className="max-w-measure space-y-2">
      <Chip onClick={() => setStartedAt(Date.now())}>Start the clock</Chip>
      <div className="rounded-md border border-border bg-surface-muted p-3">
        {startedAt === null ? (
          <p className="text-caption text-ink-subtle">Not thinking.</p>
        ) : (
          <ThinkingIndicator startedAt={startedAt} />
        )}
      </div>
    </div>
  );
}

/**
 * Static copies of the two banners.
 *
 * `HealthBanner` reads live query state, so both variants cannot be on screen at
 * once. These duplicate only the markup, from the same fixtures, so a designer can
 * compare them — the live ones are one mock toggle away.
 */
function StaticDegradedBanner() {
  return (
    <div className="flex items-start gap-3 bg-amber-surface px-4 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-small font-medium text-amber-text">
          The assistant is not working properly at the moment
        </p>
        <p className="mt-0.5 text-caption text-ink-muted">
          Its information is being updated, so answers may be missing or incomplete. For anything
          you need now, call SCASPA on 869-465-8121.
        </p>
      </div>
      <span className="min-h-touch shrink-0 px-2 text-caption text-ink-muted underline">
        Dismiss
      </span>
    </div>
  );
}

function StaticStaleBanner() {
  return (
    <div className="bg-surface-muted px-4 py-1.5">
      <p className="text-caption text-ink-subtle">
        SCASPA information was last verified on {HEALTH_STALE.index.kb_updated_at}. Please confirm
        anything time-sensitive before you rely on it.
      </p>
    </div>
  );
}

function ComposerDemo() {
  const lengths = [0, 899, 900, 1000, 1001];
  const [length, setLength] = useState(900);

  return (
    <div className="max-w-measure space-y-2">
      <div className="flex flex-wrap gap-2">
        {lengths.map((value) => (
          <Chip key={value} selected={length === value} onClick={() => setLength(value)}>
            {value} chars
          </Chip>
        ))}
      </div>
      <p className="text-caption text-ink-subtle">
        Degraded health status: {HEALTH_DEGRADED.status}. Set the length, then look at the composer
        on <code>/chat</code> — the draft store is shared, so it is already filled.
      </p>
      <Button variant="secondary" onClick={() => setComposerDraft('a'.repeat(length))}>
        Fill the composer with {length} characters
      </Button>
    </div>
  );
}

/**
 * Every fixture, at a chosen width.
 *
 * The width selector is the point: a twelve-point line chart is fine at 1280px
 * and unreadable at 390px unless the ticks thin and the labels shorten. Narrow it
 * and watch the month names go from "September" to "Sep" and then start skipping.
 */
function ChartGallery() {
  const [width, setWidth] = useState(390);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {[320, 390, 768, 1024].map((value) => (
          <Chip key={value} selected={width === value} onClick={() => setWidth(value)}>
            {value}px
          </Chip>
        ))}
      </div>
      <p className="text-caption text-ink-subtle">
        Sized with a wrapper, not an iframe, so the chart measures its own container the way it does
        inside a message bubble. A bar chart with more than six categories flips to a horizontal
        layout below 640px.
      </p>

      <div className="overflow-x-auto">
        <div className="space-y-6" style={{ width: `${width}px` }}>
          {ALL_CHART_FIXTURES.map(({ label, spec }) => (
            <div key={label} className="rounded-md border border-border bg-surface p-3">
              <p className="mb-1 text-caption font-semibold text-ink-subtle">{label}</p>
              <ChartBlock spec={spec} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VoiceSection() {
  const capability = detectVoiceCapability(appConfig.features.voice);
  const [transcript, setTranscript] = useState('');

  return (
    <div className="max-w-measure space-y-3">
      <dl className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-1 text-caption">
        <dt className="text-ink-subtle">Secure context</dt>
        <dd className="tabular">
          {String(typeof window !== 'undefined' && window.isSecureContext)}
        </dd>
        <dt className="text-ink-subtle">Feature flag</dt>
        <dd className="tabular">{String(appConfig.features.voice)}</dd>
        <dt className="text-ink-subtle">Available</dt>
        <dd className="tabular">
          {String(capability.available)}
          {capability.reason ? ` (${capability.reason})` : ''}
        </dd>
        <dt className="text-ink-subtle">Negotiated format</dt>
        <dd className="tabular">{pickMimeType() ?? 'none supported'}</dd>
        <dt className="text-ink-subtle">Candidates tried</dt>
        <dd className="text-ink-muted">{CANDIDATE_MIME_TYPES.join(', ')}</dd>
      </dl>

      <div className="rounded-md border border-border bg-surface-muted p-3">
        <p className="mb-2 text-caption text-ink-subtle">
          Tap to record. It asks for permission on the tap, never on page load, and the meter is
          driven by real audio — it stays flat when the mic is muted, which is the one useful thing
          to know.
        </p>
        <VoiceButton onTranscript={setTranscript} />
        {transcript && (
          <p className="mt-2 text-small">
            Transcript (would go to the composer, never to the model): <strong>{transcript}</strong>
          </p>
        )}
      </div>

      <div className="rounded-md border border-border bg-surface-muted p-3">
        <p className="mb-2 text-caption text-ink-subtle">
          One shared audio element for the whole app: starting a second playback stops the first.
        </p>
        <div className="flex flex-wrap gap-4">
          <SpeakButton messageId="gallery-1" text="The placeholder fare is XCD 44.44." />
          <SpeakButton messageId="gallery-2" text="The last sailing back from Nevis is 18:00." />
        </div>
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
