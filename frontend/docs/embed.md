# Putting the assistant on scaspa.com

One paste, one place. No developer needed.

---

## The snippet

In the Weebly editor, drag an **Embed Code** block to the bottom of the page you
want the assistant on — or into the site footer, if you want it on every page —
and paste this in:

```html
<script src="https://ASSISTANT-HOST/embed.js" defer></script>
```

Replace `ASSISTANT-HOST` with the address the assistant is deployed at. That is
the only edit.

Publish the page. A blue **Ask SCASPA** button appears in the bottom-right corner.

### If the assistant is on a different address from the script

```html
<script src="https://cdn.example/embed.js" data-origin="https://ASSISTANT-HOST" defer></script>
```

Normally unnecessary — the script works out where it came from.

---

## What it does

- Adds one button, bottom-right. Nothing else on the page changes.
- On click, opens the assistant in a 380 × 600 panel. On a phone it fills the
  width with a small margin.
- **Escape** closes it, and the button comes back with focus on it.
- Respects the iPhone home-indicator area, so the button is never half hidden
  behind it.

## What it does not do

- Sets **no cookie** and stores nothing on your website.
- Loads **no third-party code** — no analytics, no fonts, no libraries.
- Does not read or change anything else on the page.
- Never touches `pay.scaspa.com`.

---

## Before it works: two things for whoever manages the hosting

**1. Allow scaspa.com to frame the assistant.** The assistant refuses to be put in
a frame by default — that is deliberate, so a phishing site cannot wrap it in a
fake SCASPA layout. Add these response headers on the assistant's host:

```
Content-Security-Policy: frame-ancestors 'self' https://www.scaspa.com https://scaspa.com
X-Frame-Options: SAMEORIGIN
```

Full detail, including per-platform configuration, is in `docs/embedding.md`.

**2. Allow scaspa.com to call the assistant.** Add the site's address to
`ALLOWED_ORIGINS` in the backend configuration:

```
ALLOWED_ORIGINS=https://www.scaspa.com,https://scaspa.com
```

If the button opens a panel that then says it cannot reach SCASPA, this is
almost certainly why.

---

## Checking it worked

1. Open the published page. The **Ask SCASPA** button is bottom-right.
2. Click it. The assistant opens and shows its suggested questions.
3. Tap a suggested question. An answer arrives with a numbered source under it.
4. Press **Escape**. The panel closes.
5. On a phone, check the button is not sitting under the home indicator.

If the panel opens but stays blank, the framing headers in step 1 above are
missing. If it opens and cannot answer, `ALLOWED_ORIGINS` in step 2 is missing.

## Voice inside the frame

The microphone works in the embedded panel because the frame is created with
`allow="microphone"`. Two conditions still apply:

- **scaspa.com must be served over HTTPS.** Browsers refuse microphone access on
  plain HTTP, silently. If the site is HTTP, the microphone button does not
  appear at all — which is intended, rather than a button that does nothing.
- The visitor is asked for permission the first time they tap the microphone,
  never on page load.

## Removing it

Delete the embed block. Nothing else is left behind — no cookie, no stored data,
no script that keeps running.
