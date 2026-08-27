import { createFileRoute } from '@tanstack/react-router';
import { AboutScaspa } from '@/components/about/AboutScaspa';
import { SCASPA_IDENTITY } from '@/lib/scaspa-facts';

/**
 * `/about-scaspa` — the same content the sidebar's sheet shows.
 *
 * Exists for two reasons the sheet cannot serve: a deep link someone can send
 * to a colleague, and the landing-page footer, where a sheet would be an odd
 * thing to open from a document.
 *
 * It renders `<AboutScaspa>` and adds nothing of its own beyond the heading
 * level, so the two placements cannot drift. This route is **not** self-chromed:
 * it is a document, and it should carry the site's nav and footer.
 */
function AboutScaspaRoute() {
  return <AboutScaspa headingLevel="h1" />;
}

export const Route = createFileRoute('/about-scaspa')({
  component: AboutScaspaRoute,
  head: () => ({
    meta: [
      { title: `About ${SCASPA_IDENTITY.shortName} — Pilot` },
      {
        name: 'description',
        content:
          `${SCASPA_IDENTITY.fullName} is ${SCASPA_IDENTITY.what} ` +
          'What it is, when it formed, the four facilities it runs, and how to contact it.',
      },
    ],
  }),
});
