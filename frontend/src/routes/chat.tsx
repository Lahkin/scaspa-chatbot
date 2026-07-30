import { createFileRoute } from '@tanstack/react-router';
import { PlaceholderPanel } from '@/components/shells/PlaceholderPanel';

/** Full-page chat. The conversation UI itself arrives in a later prompt. */
function ChatRoute() {
  return (
    <PlaceholderPanel
      title="Chat"
      note="The conversation view renders here. Streaming, citations and the composer are built in later prompts."
    />
  );
}

export const Route = createFileRoute('/chat')({
  component: ChatRoute,
  head: () => ({
    meta: [
      { title: 'Chat \u2014 SCASPA Assistant' },
      {
        name: 'description',
        content: 'Ask a question about SCASPA ferries, cruise arrivals, cargo or the airport.',
      },
    ],
  }),
});
