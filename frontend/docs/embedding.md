# Embedding the widget on scaspa.com

The widget is `/widget`, loaded in an iframe by `public/embed.js` at a fixed
380 × 600.

---

## ⚠️ First, a correction to raise with whoever specified this

**A framing policy cannot be set from a `<meta>` tag.** This is worth stating
plainly because the instinct — and the instruction this file was written against —
is to add one, and a `<meta>` tag that looks like a security control but is
inert is worse than no tag at all: it moves the item to "done" on a checklist
while leaving the site framable by anyone.

Two separate mechanisms, both header-only:

| Mechanism             | `<meta http-equiv>` | Response header |
| --------------------- | ------------------- | --------------- |
| `X-Frame-Options`     | **Ignored**         | Honoured        |
| CSP `frame-ancestors` | **Ignored**         | Honoured        |

`X-Frame-Options` has never been supported as a `<meta>` element. CSP is
_partially_ supported via `<meta http-equiv="Content-Security-Policy">`, but the
specification explicitly ignores `frame-ancestors`, `report-uri` and `sandbox`
when the policy is delivered that way — precisely because a document cannot be
trusted to declare who is allowed to frame it after it has already been framed.

So `index.html` carries a comment where the tag would go, pointing here, rather
than a tag that does nothing. **The deploy configuration below is the actual
control.** Nothing in the application code can substitute for it.

---

## What the deploy must send

Serve these headers on the application's HTML responses:

```
Content-Security-Policy: frame-ancestors 'self' https://www.scaspa.com https://scaspa.com
X-Frame-Options: SAMEORIGIN
```

Notes:

- `frame-ancestors` is the one that matters; `X-Frame-Options` is there for
  browsers that predate CSP Level 2. They disagree by design — `X-Frame-Options`
  cannot express an allow-list — so where both are present, `frame-ancestors`
  wins in any browser that understands it.
- List **exact origins**, scheme included. `scaspa.com` and `www.scaspa.com` are
  different origins and both are listed because the site serves both.
- Do **not** use `frame-ancestors *`. It is the same as having no policy.
- If the widget is ever embedded on a partner site (a cruise line, a hotel), that
  origin is added here and to `VITE_EMBED_ALLOWED_ORIGIN`, in the same change.

### Netlify (`netlify.toml` / `_headers`)

```
/*
  Content-Security-Policy: frame-ancestors 'self' https://www.scaspa.com https://scaspa.com
  X-Frame-Options: SAMEORIGIN
```

### Nginx

```nginx
add_header Content-Security-Policy "frame-ancestors 'self' https://www.scaspa.com https://scaspa.com" always;
add_header X-Frame-Options "SAMEORIGIN" always;
```

### Verifying it, rather than assuming it

```bash
curl -sI https://<deployed-host>/widget | grep -i -E 'frame-ancestors|x-frame-options'
```

If that prints nothing, the widget is framable by any site on the internet,
whatever this document says. A phishing page can embed a real SCASPA assistant
inside a fake SCASPA layout, and a passenger reading it has no way to tell.

---

## The parent ↔ widget message contract

The widget cannot close itself: it does not own the iframe. It asks.

**Widget → parent**

```js
window.parent.postMessage({ type: 'scaspa:widget:close' }, 'https://www.scaspa.com');
```

The target origin is `VITE_EMBED_ALLOWED_ORIGIN` and is **never `'*'`**. A
wildcard posts the message to whatever page happens to be embedding us, which
defeats the point of having an allow-list at all.

**Parent → widget**, in `embed.js`:

```js
window.addEventListener('message', (event) => {
  // Both checks are required. Without the origin check any page in any tab can
  // drive this; without the source check, so can any other iframe on the page.
  if (event.origin !== ASSISTANT_ORIGIN) return;
  if (event.source !== iframe.contentWindow) return;
  if (event.data?.type === 'scaspa:widget:close') hide();
});
```

---

## Sizing

`380 × 600` is fixed by `embed.js`. The shell uses `w-widget h-widget` from
`tokens.css` plus `max-w-full max-h-dvh`, so if the host constrains the frame, or
someone opens `/widget` directly on a 320px phone, the box shrinks rather than
forcing a horizontal scrollbar.

`dvh`, not `vh` — see the note in `FullPageShell.tsx`. iOS Safari's collapsing
toolbar makes `100vh` taller than what is visible, which hides the composer.
