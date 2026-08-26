import { createFileRoute } from '@tanstack/react-router';
import { FullPageShell } from '@/components/shells/FullPageShell';

/**
 * Full-page chat.
 *
 * The route is deliberately empty of chat logic: it mounts the shell and nothing
 * else. `FullPageShell` owns the layout and mounts a `ChatCore` placeholder; the
 * conversation, streaming and citations arrive in a later prompt without this file
 * changing.
 */
function ChatRoute() {
  return <FullPageShell />;
}

export const Route = createFileRoute('/chat')({
  component: ChatRoute,
  head: () => ({
    meta: [
      { title: 'Chat — SCASPA Assistant' },
      {
        name: 'description',
        content: 'Ask a question about SCASPA ferries, cruise arrivals, cargo or the airport.',
      },
    ],
  }),
});
