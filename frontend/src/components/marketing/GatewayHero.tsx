import heroDark1200 from '@/assets/hero-dark-1200.webp';
import heroDark640 from '@/assets/hero-dark-640.webp';
import heroLight1200 from '@/assets/hero-light-1200.webp';
import heroLight640 from '@/assets/hero-light-640.webp';
import { useResolvedTheme } from '@/features/theme';

/**
 * The gateway photograph: one island, and every facility SCASPA runs.
 *
 * Mountains, harbour, cranes, a cruise vessel, an aircraft, and a traveller with
 * a suitcase in the foreground. The traveller is the reason the picture works —
 * without a person in it the page is about infrastructure, and a visitor
 * standing on a pier is not looking for infrastructure.
 *
 * ## Two exposures, chosen in JS rather than in CSS
 *
 * The light photograph is tropical daylight; the dark one is the same scene at
 * blue hour, with harbour lights and an illuminated ship. This is the case
 * `useResolvedTheme` was written for — a difference that is not a colour and so
 * cannot be a token.
 *
 * A `<source media="(prefers-color-scheme: dark)">` would have been fewer lines
 * and is WRONG here: the theme can be set explicitly in /settings, and the media
 * query cannot see that choice. A reader who picked Light on a dark phone would
 * get the light interface with the night photograph in it.
 *
 * ## Sizes, and the budget they had to fit
 *
 * 1200 and 640, WebP. `scripts/bundle-budget.mjs` allows 100 kB per image and
 * 250 kB in total across the build; the SCASPA seal already spends 45.8 kB of
 * that, so four hero files had to fit in the remaining 204 kB. They come to
 * 193 kB.
 *
 * 1200 rather than 1440, and that was decided by looking rather than by
 * arithmetic: at the same ~74 kB, 1440 needs quality 39 and visibly smears the
 * traveller's shirt and the hillside buildings, while 1200 holds together at
 * quality 59. The hero occupies roughly 900-960 CSS px at desktop, so 1200 is
 * still comfortably over 1x.
 *
 * ## It is decorative, and says so
 *
 * `alt=""`. Everything the photograph conveys — which facilities this covers —
 * is said in words by the four journey cards immediately beneath it. A long
 * description here would make a screen reader read out a scene the reader has
 * already been told about, before it reaches the controls that actually do
 * something.
 */
export function GatewayHero() {
  const theme = useResolvedTheme();
  const dark = theme === 'dark';

  return (
    <img
      src={dark ? heroDark1200 : heroLight1200}
      srcSet={
        dark
          ? `${heroDark640} 640w, ${heroDark1200} 1200w`
          : `${heroLight640} 640w, ${heroLight1200} 1200w`
      }
      sizes="(min-width: 1024px) 55vw, 100vw"
      alt=""
      /*
       * Eager, and the one image on the site that is. It is the largest thing
       * above the fold, so lazy-loading it only guarantees the layout settles
       * late — `loading="lazy"` on a hero is a well-known way to make a page
       * feel slower while scoring better on a metric nobody experiences.
       */
      loading="eager"
      decoding="async"
      className="h-full w-full object-cover"
    />
  );
}
