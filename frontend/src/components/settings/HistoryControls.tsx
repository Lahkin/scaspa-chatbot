import { useState } from 'react';
import { Button } from '@/components/ui';
import { SettingRow } from './SettingsSection';
import { clearConversationId } from '@/features/chat/conversation';
import { setDraft } from '@/features/chat/draft';
import { resetLocale, useStrings } from '@/features/i18n';

/**
 * The chat-history section: what is kept where, and the two controls that clear
 * it.
 *
 * ## Three rows before either button, on purpose
 *
 * "Clear chat history" on most products means "delete the transcript the service
 * is holding about you". Here there is no such transcript to delete, and a button
 * with that label would imply one exists and had just been destroyed — a false
 * reassurance, which is a worse outcome than no button at all.
 *
 * So the section states the actual position first: one anonymous id on the
 * device, conversation text held in server memory for an hour, and nothing that
 * identifies anyone anywhere. Only then does it offer the two things that
 * genuinely do something.
 *
 * ## No confirmation dialog on either
 *
 * There is nothing recoverable to lose. The transcript is not stored anywhere the
 * user could get it back from, so "are you sure?" would be a modal guarding
 * something that does not exist. Same call as the sidebar's New conversation
 * button, and made for the same reason.
 *
 * ## Why `role="status"` and not `aria-live="assertive"`
 *
 * Both actions are user-initiated, so the result is expected rather than urgent.
 * `status` is polite: it waits for the screen reader to finish the sentence it is
 * on. An assertive region would interrupt mid-word to announce something the user
 * just asked for and already knows happened.
 */
export function HistoryControls() {
  const t = useStrings();
  const [done, setDone] = useState<'cleared' | 'reset' | null>(null);

  return (
    <>
      <SettingRow title={t.settings.history.onDeviceTitle} body={t.settings.history.onDeviceBody} />
      <SettingRow title={t.settings.history.onServerTitle} body={t.settings.history.onServerBody} />
      <SettingRow title={t.settings.history.neverTitle} body={t.settings.history.neverBody} />

      <SettingRow title={t.settings.history.clearTitle} body={t.settings.history.clearBody}>
        <Button
          variant="secondary"
          onClick={() => {
            clearConversationId();
            // The composer draft goes too. Leaving a half-typed question behind
            // after the user asked to start fresh is the one part of this they
            // would actually notice, and it is message content.
            setDraft('');
            setDone('cleared');
          }}
        >
          {t.settings.history.clearAction}
        </Button>
      </SettingRow>

      {/*
        The kiosk exit.

        `/settings` is reachable from a shared cruise-terminal tablet, and by this
        point the app has a second thing worth forgetting — the stored language.
        This clears both, which is what someone walking away from a public device
        means by "reset", rather than making them find two separate controls.

        `danger` rather than `secondary`: it discards more than the button above
        it, and the two sitting side by side in identical clothing is how the
        wrong one gets pressed.
      */}
      <SettingRow title={t.settings.history.resetTitle} body={t.settings.history.resetBody}>
        <Button
          variant="danger"
          onClick={() => {
            clearConversationId();
            setDraft('');
            resetLocale();
            setDone('reset');
          }}
        >
          {t.settings.history.resetAction}
        </Button>
      </SettingRow>

      {/*
        One live region for both buttons rather than one each.

        Two regions would both be watched, and clearing after resetting would
        leave the stale "reset" message sitting under the new "cleared" one — two
        contradictory confirmations on screen at once.

        `min-h-5` reserves the line so the section does not jump when a message
        appears under the user's thumb.
      */}
      <p role="status" className="min-h-5 px-1 text-small font-medium text-ops-ink">
        {done === 'cleared' ? t.settings.history.cleared : null}
        {done === 'reset' ? t.settings.history.resetDone : null}
      </p>

      <div className="rounded-md border border-ops-outline-variant border-l-4 border-l-ops-sky bg-ops-surface p-3">
        <h3 className="text-small font-semibold text-ops-ink">{t.settings.history.noListTitle}</h3>
        <p className="mt-1 max-w-measure text-small text-ops-ink-variant">
          {t.settings.history.noListBody}
        </p>
      </div>
    </>
  );
}
