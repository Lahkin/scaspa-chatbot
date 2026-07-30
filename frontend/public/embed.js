/**
 * Widget loader — NOT IMPLEMENTED YET (built in F11).
 *
 * This file is the script scaspa.com will include. When built it will inject an
 * iframe pointing at /widget, size it, and talk to it over postMessage with an
 * exact-origin check on both ends.
 *
 * Constraints it must honour when written:
 *   - postMessage targetOrigin is the exact configured origin, never '*'.
 *   - Incoming messages are rejected unless event.origin matches exactly.
 *   - It sets no cookie and reads no storage on the host page.
 *   - It never references pay.scaspa.com.
 *
 * Shipped now as a placeholder so the path in index.html and the deploy story are
 * real, rather than a 404 discovered later.
 */
(function () {
  'use strict';
  if (typeof console !== 'undefined' && console.warn) {
    console.warn('[SCASPA] embed.js is a placeholder; the widget loader is not built yet.');
  }
})();
