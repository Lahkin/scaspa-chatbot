/**
 * SCASPA Assistant — embed loader.
 *
 * Dependency-free, pasteable into a Weebly embed block. No build step, no
 * framework, no globals beyond one namespaced object.
 *
 * Everything is namespaced `scaspa-assistant-*` because it is being dropped into
 * somebody else's page: Weebly ships its own jQuery, its own reset and a great
 * many `.wsite-*` rules, and a generic class name like `.launcher` will
 * eventually collide with one of them. Styles go into a single `<style>` with an
 * id, so pasting the snippet twice cannot duplicate them.
 *
 * Sets no cookie, reads no storage on the host page, and never references
 * pay.scaspa.com. See docs/embed.md for the snippet and the install note.
 */
(function () {
  'use strict';

  var NS = 'scaspa-assistant';

  // Pasted twice into the same page — a real thing that happens in a CMS.
  if (window[NS + '-loaded']) return;
  window[NS + '-loaded'] = true;

  var script = document.currentScript;

  /**
   * Where the assistant is served from.
   *
   * Derived from this script's own `src`, so the snippet has one fewer thing to
   * get wrong. `data-origin` overrides it.
   */
  var origin = (function () {
    var explicit = script && script.getAttribute('data-origin');
    if (explicit) return explicit.replace(/\/+$/, '');
    if (script && script.src) {
      try {
        return new URL(script.src).origin;
      } catch (error) {
        /* fall through */
      }
    }
    return window.location.origin;
  })();

  var WIDGET_URL = origin + '/widget';
  var state = { open: false, iframe: null, launcher: null, panel: null };

  // ── styles ────────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById(NS + '-styles')) return;
    var style = document.createElement('style');
    style.id = NS + '-styles';
    style.textContent = [
      '.' + NS + '-launcher{',
      'position:fixed;z-index:2147483000;',
      // Safe-area insets: on an iPhone the home indicator sits over the bottom
      // ~34px, and a launcher without this is half behind it and hard to tap.
      'right:calc(16px + env(safe-area-inset-right,0px));',
      'bottom:calc(16px + env(safe-area-inset-bottom,0px));',
      'display:flex;align-items:center;min-height:48px;padding:0 18px;',
      'border:0;border-radius:24px;background:#0069b4;color:#fff;',
      'font:600 15px/1 system-ui,-apple-system,"Segoe UI",sans-serif;',
      'box-shadow:0 4px 16px rgba(23,28,34,.24);cursor:pointer;',
      '}',
      '.' + NS + '-launcher:hover{background:#005490}',
      '.' + NS + '-launcher:focus-visible{outline:3px solid #308cca;outline-offset:2px}',
      '.' + NS + '-panel{',
      'position:fixed;z-index:2147483000;',
      'right:calc(16px + env(safe-area-inset-right,0px));',
      'bottom:calc(16px + env(safe-area-inset-bottom,0px));',
      'width:380px;height:600px;',
      'max-width:calc(100vw - 24px);max-height:calc(100dvh - 24px);',
      'border-radius:12px;overflow:hidden;',
      'box-shadow:0 8px 32px rgba(23,28,34,.28);background:#fff;',
      '}',
      '.' + NS + '-panel iframe{display:block;width:100%;height:100%;border:0}',
      '@media (max-width:420px){.' + NS + '-panel{right:8px;left:8px;width:auto;bottom:8px}}',
      '@media (prefers-reduced-motion:no-preference){',
      '.' + NS + '-launcher{transition:background-color .12s ease}}',
    ].join('');
    document.head.appendChild(style);
  }

  // ── the panel ─────────────────────────────────────────────────────────────

  function openPanel() {
    if (state.open) return;
    state.open = true;

    var panel = document.createElement('div');
    panel.className = NS + '-panel';

    var iframe = document.createElement('iframe');
    iframe.src = WIDGET_URL;
    iframe.title = 'SCASPA Assistant';
    /*
     * `allow="microphone"` is not optional.
     *
     * Without it, getUserMedia inside the frame is refused by permissions policy
     * — silently, with no prompt. Voice then works when /widget is opened
     * directly and fails only when embedded, which is the hardest version of this
     * bug to find.
     */
    iframe.setAttribute('allow', 'microphone; autoplay');
    iframe.setAttribute('loading', 'lazy');

    panel.appendChild(iframe);
    document.body.appendChild(panel);

    state.panel = panel;
    state.iframe = iframe;

    if (state.launcher) {
      state.launcher.setAttribute('aria-expanded', 'true');
      state.launcher.style.display = 'none';
    }

    // Focus follows the panel, or a keyboard user is left behind on the page.
    iframe.addEventListener('load', function () {
      try {
        iframe.focus();
      } catch (error) {
        /* focusing a cross-origin frame can throw in older browsers */
      }
    });
  }

  function closePanel() {
    if (!state.open) return;
    state.open = false;

    if (state.panel && state.panel.parentNode) {
      state.panel.parentNode.removeChild(state.panel);
    }
    state.panel = null;
    state.iframe = null;

    if (state.launcher) {
      state.launcher.style.display = '';
      state.launcher.setAttribute('aria-expanded', 'false');
      // Back to the control that opened it.
      state.launcher.focus();
    }
  }

  // ── messages ──────────────────────────────────────────────────────────────

  /**
   * Inbound messages are validated twice, and both checks are required.
   *
   * Without the origin check, any page in any tab can drive this. Without the
   * source check, so can any *other* iframe on this same page — an ad frame, a
   * third-party widget — because they all share the parent's message bus.
   */
  window.addEventListener('message', function (event) {
    if (event.origin !== origin) return;
    if (!state.iframe || event.source !== state.iframe.contentWindow) return;

    var data = event.data;
    if (!data || typeof data.type !== 'string') return;

    if (data.type === 'scaspa:widget:close') {
      closePanel();
    } else if (data.type === 'scaspa:widget:resize') {
      if (state.panel && typeof data.height === 'number' && data.height > 0) {
        state.panel.style.height = Math.min(data.height, 720) + 'px';
      }
    }
  });

  /** Outbound. `targetOrigin` is the exact origin, never '*'. */
  function post(type, payload) {
    if (!state.iframe || !state.iframe.contentWindow) return;
    var message = { type: type };
    if (payload) {
      for (var key in payload) {
        if (Object.prototype.hasOwnProperty.call(payload, key)) message[key] = payload[key];
      }
    }
    state.iframe.contentWindow.postMessage(message, origin);
  }

  // ── launcher ──────────────────────────────────────────────────────────────

  function createLauncher() {
    var button = document.createElement('button');
    button.type = 'button';
    button.className = NS + '-launcher';
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Open the SCASPA Assistant');
    button.textContent = 'Ask SCASPA';
    button.addEventListener('click', openPanel);
    document.body.appendChild(button);
    state.launcher = button;
  }

  // Escape closes, which is what a keyboard user tries first.
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && state.open) closePanel();
  });

  function init() {
    injectStyles();
    createLauncher();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // One namespaced global, so a host page can drive it if it wants to.
  window.ScaspaAssistant = { open: openPanel, close: closePanel, post: post };
})();
