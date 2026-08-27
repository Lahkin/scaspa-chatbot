import { useSyncExternalStore } from 'react';

import type { ResolvedTheme, ThemeChoice } from './choice';
import {
  getResolvedTheme,
  getResolvedThemeServerSnapshot,
  getThemeChoice,
  getThemeChoiceServerSnapshot,
  subscribeToTheme,
} from './store';

export {
  DEFAULT_THEME_CHOICE,
  isThemeChoice,
  resolveTheme,
  systemTheme,
  type ResolvedTheme,
  type ThemeChoice,
} from './choice';
export { getResolvedTheme, getThemeChoice, resetTheme, setThemeChoice } from './store';

/**
 * What the reader chose — including `system`.
 *
 * This is what a settings control binds to: it has to be able to show "System"
 * as the selected option, which `useResolvedTheme` cannot tell it.
 */
export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribeToTheme, getThemeChoice, getThemeChoiceServerSnapshot);
}

/**
 * The palette actually on screen — only ever `light` or `dark`.
 *
 * For the handful of places that genuinely need to know, which is fewer than it
 * looks: anything that can be expressed as a token should be, and then it needs
 * neither this hook nor a re-render. Reach for this only when the DIFFERENCE is
 * not a colour — an image with two exposures, a chart palette computed in JS.
 */
export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribeToTheme, getResolvedTheme, getResolvedThemeServerSnapshot);
}
