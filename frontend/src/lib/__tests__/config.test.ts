import { describe, expect, it } from 'vitest';
import { config } from '@/lib/config';

describe('config', () => {
  it('exposes a base URL with no trailing slash', () => {
    expect(config.apiBaseUrl).not.toMatch(/\/$/);
    expect(config.apiBaseUrl).toMatch(/^https?:\/\//);
  });

  it('exposes feature flags as booleans', () => {
    expect(typeof config.features.voice).toBe('boolean');
    expect(typeof config.features.charts).toBe('boolean');
  });

  it('has a positive stream timeout', () => {
    expect(config.streamTimeoutMs).toBeGreaterThan(0);
  });

  it('never exposes a secret-shaped variable', () => {
    // The frontend holds no credential. If this ever fails, something has been
    // added that must not ship in a browser bundle.
    const keys = Object.keys(import.meta.env);
    const suspicious = keys.filter((k) => /SECRET|API_KEY|TOKEN|PASSWORD/i.test(k));
    expect(suspicious).toEqual([]);
  });
});
