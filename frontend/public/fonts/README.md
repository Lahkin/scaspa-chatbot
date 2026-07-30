# Fonts

**`inter-latin-variable.woff2`** — Inter, latin subset, variable weight axis
100–900. 48 KB.

Self-hosted deliberately. There is no external font CDN anywhere in this app: a
large share of users are on expensive roaming data and a third-party DNS lookup
plus TLS handshake before any text renders is a cost we control by not incurring
it. It is also one fewer third party seeing a request from a traveller's phone.

## Why one file, not four

Google serves Inter as a single **variable** font and declares discrete weights
against it in CSS. Downloading weights 400/500/600/700 produced four
byte-identical files (verified: one md5 across all four). Shipping them
separately would have cost 194 KB to deliver 48 KB of font.

The single `@font-face` in `src/styles/tokens.css` therefore declares
`font-weight: 100 900`, and the browser synthesises every weight from the one
axis.

## Licence

Inter is licensed under the SIL Open Font License 1.1. Vendoring it is permitted;
the licence must ship with any distribution. Add `OFL.txt` here before the
frontend is deployed publicly.

## Replacing it

The typeface is the designers' choice, like the colour tokens. To swap it:
drop the new `.woff2` in, update the `@font-face` src and `--font-sans` in
`tokens.css`, and update the `<link rel="preload">` in `index.html`. Preload
**only** the body weight — preloading more competes with the request that renders
the first answer.
