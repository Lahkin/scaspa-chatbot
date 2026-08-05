import { useState, useSyncExternalStore } from 'react';
import { SCENARIOS, getScenario, setScenario, subscribeToScenario } from '@/mocks/scenarios';

/**
 * Dev-only control for the mock's failure scenarios.
 *
 * It exists because a failure you have to edit a file to reproduce is a failure
 * nobody reproduces. Every state the backend can genuinely return — a 503 with a
 * `Retry-After`, an `error` event halfway through a stream, a stream that simply
 * stops — is one click away, which is the only way the handling for them gets
 * built at all rather than being assumed.
 *
 * Reached only through a `lazy(() => import(...))` behind `import.meta.env.DEV`,
 * so neither this component nor `@/mocks/*` reaches the production bundle.
 * `tests/mocks-not-in-production.test.ts` greps the built assets to check that,
 * because "it should tree-shake" is a belief and the grep is a fact.
 */
export function MockControls() {
  const scenario = useSyncExternalStore(subscribeToScenario, getScenario, () => 'happy');
  const [open, setOpen] = useState(false);

  const active = SCENARIOS.find((entry) => entry.id === scenario);
  const failing = scenario !== 'happy';

  return (
    <div className="fixed right-2 bottom-2 z-[100] max-w-full print:hidden">
      {open ? (
        <div className="w-72 max-w-[calc(100vw-1rem)] rounded-md border border-border-strong bg-surface shadow-popover">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-small font-semibold">Mock scenario</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="size-touch-min rounded-sm text-ink-muted hover:bg-neutral-100"
              aria-label="Hide mock controls"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            <fieldset>
              <legend className="sr-only">Choose a mock scenario</legend>
              {SCENARIOS.map((entry) => (
                <label
                  key={entry.id}
                  className="flex cursor-pointer items-start gap-2 rounded-sm p-2 hover:bg-neutral-50"
                >
                  <input
                    type="radio"
                    name="mock-scenario"
                    value={entry.id}
                    checked={scenario === entry.id}
                    onChange={() => setScenario(entry.id)}
                    className="mt-1"
                  />
                  <span className="min-w-0 text-small font-medium">
                    {entry.label}
                    <span className="block text-caption font-normal text-ink-subtle">
                      {entry.expected}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            failing
              ? 'min-h-touch rounded-md bg-danger-fill px-3 text-small font-medium text-ink-on-bright shadow-popover'
              : 'min-h-touch rounded-md border border-border-strong bg-surface px-3 text-small font-medium text-ink-muted shadow-card'
          }
        >
          {/* The label carries the active scenario, so a confusing UI state is
              never a mystery — the reason is on the button. */}
          Mock: {active?.label ?? scenario}
        </button>
      )}
    </div>
  );
}
