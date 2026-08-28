import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import { clearConversationId } from '@/features/chat/conversation';
import { resetDraft } from '@/features/chat/draft';
import { SCASPA_PHONE_LINES, SCASPA_POSTAL_ADDRESS } from '@/features/chat/contact';
import { getLocale, stringsFor } from '@/features/i18n';

/**
 * The last line of defence.
 *
 * **A React error must never leave a white screen in front of an audience.** A
 * thrown render is the one failure the rest of this codebase cannot catch: no
 * amount of zod at the boundary or typed errors helps once a component has
 * already started rendering and hits an `undefined`.
 *
 * ### Recovery resets the chat, not just the boundary
 *
 * Offering only "reload the page" is the common shape and it is the wrong one
 * twice over. It is slow — a full reload on venue wifi is ten seconds of white —
 * and it usually does not work, because the state that caused the crash is
 * frequently the conversation itself: a malformed message, a citation that broke
 * an assumption. Reloading restores the `conversation_id` from sessionStorage and
 * walks straight back into it.
 *
 * So "Start a new conversation" clears the id, the draft and the mounted tree.
 * Reload is still offered, second, for the case where the reset does not take.
 *
 * ### It is a class component, and there is no alternative
 *
 * `componentDidCatch` has no hook equivalent. React has never shipped one.
 */

interface Props {
  children: ReactNode;
  /** Named in the dev-only detail so a crash points at a route. */
  routeName: string;
}

interface State {
  error: Error | null;
}

export class RouteErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Dev console only. Nothing is sent anywhere — see features/chat/telemetry.ts
    // for the standing position on that.
    if (import.meta.env.DEV) {
      console.error(`[boundary:${this.props.routeName}]`, error, info.componentStack);
    }
  }

  private reset = (): void => {
    // Clear the state most likely to have caused it before remounting, or the
    // remount walks straight back into the same crash.
    clearConversationId();
    resetDraft();
    this.setState({ error: null });
  };

  override render(): ReactNode {
    /*
     * `stringsFor(getLocale())` and not `useStrings()`.
     *
     * This is a class component, because an error boundary has to be — React
     * offers no hook equivalent of `getDerivedStateFromError`. The non-reactive
     * lookup exists for exactly this caller. It does not re-render when the
     * locale changes, which is the correct trade here: the screen it draws is
     * shown after something has already gone wrong, and the user's next action
     * is a reload.
     */
    const t = stringsFor(getLocale());
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-dvh items-start justify-center bg-surface p-4 text-ink">
        <div className="mt-8 w-full max-w-measure space-y-4">
          <div className="space-y-2">
            <h1 className="text-h2 font-semibold">{t.errors.routeErrorTitle}</h1>
            <p className="text-small text-ink-muted">{t.errors.routeErrorBody}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={this.reset}>{t.errors.startNewConversation}</Button>
            <Button variant="secondary" onClick={() => window.location.reload()}>
              {t.errors.reloadPage}
            </Button>
          </div>

          {/* The way out that does not depend on any of this working. */}
          <div className="rounded-md border border-border bg-surface-muted p-3">
            <p className="text-small font-semibold">{t.errors.reachDirectly}</p>
            <ul className="mt-1 flex flex-wrap gap-x-4">
              {SCASPA_PHONE_LINES.map((line) => (
                <li key={line.href}>
                  <a
                    href={line.href}
                    className="inline-flex min-h-touch items-center text-small font-medium text-blue-700 underline tabular"
                  >
                    {line.text}
                  </a>
                </li>
              ))}
            </ul>
            <address className="mt-1 text-caption text-ink-subtle not-italic">
              {SCASPA_POSTAL_ADDRESS.join(', ')}
            </address>
          </div>

          {/*
            The message, in dev only. A stack trace in front of an audience is
            both frightening and useless to them — and the standing rule is that
            no internal detail reaches a user.
          */}
          {import.meta.env.DEV && (
            <pre className="overflow-x-auto rounded-md bg-surface-sunken p-3 text-caption">
              {error.message}
            </pre>
          )}
        </div>
      </div>
    );
  }
}
