# Embedding the widget on scaspa.com

`frontend/src/routes/widget.tsx` points here and this file did not exist. It
does now, because the framing policy it describes is **a deploy concern, not a
markup one** — no meta tag can set it, and getting it wrong fails in one of two
opposite ways.

## The snippet

```html
<script src="https://YOUR-FRONTEND/embed.js" defer></script>
```

That is the whole of it. `public/embed.js` derives the widget URL from its own
`src`, so the snippet has one fewer thing to get wrong, and injects an iframe
pointing at `/widget`.

## `allow="microphone"` is set by the PARENT, and cannot be set by us

`embed.js` puts `allow="microphone; autoplay"` on the iframe it creates. That
attribute is the parent page granting permission downward — a framed document
cannot grant itself a capability the frame did not pass in.

So a hand-written `<iframe>` on scaspa.com that omits it produces a microphone
button that is present, enabled, and silently refused by the browser. Use
`embed.js` rather than hand-rolling the iframe, and if the iframe must be
hand-rolled, copy the `allow` attribute with it.

## Two headers, and they say opposite things on purpose

| Path | Policy | Why |
| --- | --- | --- |
| everything except `/widget` | `frame-ancestors 'none'` | The full application must not be framable. A whole port authority assistant inside somebody else's page, with their chrome around it, is a clickjacking surface and a passing-off risk. |
| `/widget` | `frame-ancestors 'self' https://www.scaspa.com https://scaspa.com` | The widget exists *to* be framed, by the Authority's own site and nowhere else. |

Configured in `frontend/vercel.json`. The catch-all rule uses a negative
lookahead — `/((?!widget).*)` — rather than relying on a later rule overriding
an earlier one, so the two policies cannot be reordered into conflict.

`X-Frame-Options: DENY` accompanies the default only. It is not set on
`/widget`, because it has no syntax for "one specific origin": `ALLOW-FROM` is
obsolete and ignored by every current browser, and `SAMEORIGIN` would block the
Authority's own site, which is a different origin from the frontend host.
`frame-ancestors` is the header that can express this, and it wins wherever both
are understood.

## Both origins, deliberately

`https://www.scaspa.com` and `https://scaspa.com` are different origins to a
browser. The site serves on both — the same trap the backend's default
`ALLOWED_ORIGINS` documents for `localhost` and `127.0.0.1`, and it fails the
same way: a blocked frame is a blank panel, and the console message goes to
whoever opened developer tools, which is nobody.

## Checking it

Framing rules cannot be verified from inside the framed page, so check the
header directly:

```bash
curl -sI https://YOUR-FRONTEND/widget | grep -i content-security-policy
curl -sI https://YOUR-FRONTEND/       | grep -i -E 'content-security-policy|x-frame-options'
```

The first must list the scaspa.com origins. The second must say `'none'`.

Then load the real page with the snippet on it and open the widget. A blocked
frame renders as an empty panel with a CSP message in the console, which looks
exactly like a slow load until you look.

## The backend has to agree

The widget makes the same API calls as the standalone app, from the frontend's
origin. `ALLOWED_ORIGINS` on the backend must therefore contain **the frontend
host**, not scaspa.com — the request comes from the iframe's document, not from
its parent.

Getting that backwards produces a widget that renders perfectly and cannot
answer anything, because every request fails CORS and a browser will not tell
JavaScript why. `scripts/preflight.py --origin https://YOUR-FRONTEND` checks it
from the outside.
