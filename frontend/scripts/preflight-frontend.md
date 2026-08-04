# Frontend preflight

Run this **in the venue, on the venue network, on the presenting machine**, about
twenty minutes before presenting. It takes five minutes.

The point is not to discover that everything works. It is to discover the one
thing that does not, while there is still time.

> **Running the browser checks** (`check:responsive`, `check:a11y`,
> `check:charts`, `check:slow`, `check:browsers`)
>
> **Playwright and `@axe-core/playwright` are saved devDependencies**, pinned
> exactly. `npm install` is enough; the browsers are a separate, explicit step:
>
> ```bash
> npm install
> npx playwright install chromium          # add webkit firefox for check:browsers
> npm run build                            # the checks run the production build
> ```
>
> They were `--no-save` until M5, to stop `npm ci` fetching 300MB of browsers.
> That reasoning was half right: **the npm packages download no browsers at all**
> — `playwright` ships no install scripts, and `@axe-core/playwright`'s `prepare`
> runs only for git and local installs, never a registry tarball. The 300MB was
> always behind `npx playwright install`, which is still explicit.
>
> What being unsaved actually cost: the dependency disappeared three times in one
> working session, and each time `check:a11y` went from green to unrunnable with
> nothing failing to announce it. A gate you must remember to reinstall before
> every use is not a gate you have during a rehearsal. Saving both costs `npm ci`
> about 26MB and cannot reach the bundle — no file under `src/` imports them.
>
> `check:a11y` drives the real chat UI, and the production build does not bundle
> the mocks — so it needs the backend up with its preview origin allowed:
>
> ```bash
> ALLOWED_ORIGINS="http://localhost:5173,http://127.0.0.1:5173,http://localhost:4400" \
>   uv run uvicorn app.main:app
> ```
>
> Without that it reports two manual failures that are about the missing backend,
> not about the UI. **Check the backend on :8000 is the one you just started** —
> a stale instance from an earlier session holds the port, does not have :4400
> in its origins, and produces exactly the same two failures.
> `lsof -nP -iTCP:8000 -sTCP:LISTEN` names the owner.
>
> That stale-instance warning is not hypothetical: it cost a walkthrough during
> M4c. A uvicorn from four hours earlier held :8000, the new one could not bind,
> and the old one answered every request with the configuration it had booted
> with — so the screens reported `source.kind: unavailable` long after the feed
> had been switched on. It reads exactly like a config bug and is a process bug.

---

## 0. Before you start

- [ ] Presenting machine on the **venue wifi**, not a phone hotspot. The venue
      network is the one that will be used, so it is the one to test.
- [ ] Backup phone hotspot ready but **not connected** — known to work, one tap
      away.
- [ ] Backend running and reachable. Ask whoever owns it to confirm, or open
      `https://<host>/api/health` in a tab.

## 1. The app loads

- [ ] Open the deployed URL. The landing page renders within a few seconds.
- [ ] **No console errors.** Open devtools, reload, read the console. A red line
      here is worth five minutes now.
- [ ] The footer shows "Information verified as of …" with a date. If it does
      not, `/api/health` is unreachable and nothing else on this list will work.

## 2. Health

- [ ] `https://<host>/api/health` returns `"status": "ok"`.
- [ ] `index.ready` is `true`.
- [ ] `kb_version` is the version you expect. **Write it down here:** `__________`
- [ ] No degraded banner across the top of the app.

## 3. The four demo questions

Use the **chips**, not the keyboard. A tapped chip cannot be mistyped on stage.

For each of the four, tick only if an answer arrives **with at least one numbered
source** and it feels fast enough to talk over:

- [ ] Where do cruise ships dock in St. Kitts?
- [ ] What time is the last ferry back from Nevis?
- [ ] Where do I collect a barrel shipped to St. Kitts?
- [ ] How much is a 40-foot container?

If one is slow, note which: `__________`. Lead with a different one.

## 4. The moments worth showing

- [ ] **The refusal.** Ask "where is my container?". The escalation card appears
      with three tappable phone numbers. This is the most impressive moment in the
      demo and most teams never show it.
- [ ] **A source.** Tap a numbered chip. The panel opens at that source, showing
      the date it was verified.
- [ ] **A chart**, if one is in the script. It draws, and the caption underneath
      is readable.

## 5. Voice

- [ ] The microphone button is **visible**. If it is missing, the page is not on
      HTTPS — voice cannot work and you must not plan to show it.
- [ ] Tap it, allow permission, say a short question, stop. The transcript lands
      **in the box**, not sent.
- [ ] Tap the speaker on an answer. It plays.
- [ ] **On the presenting device specifically.** iPhone audio needs a user gesture
      first; tapping anything in the app earlier satisfies that, but confirm it
      here rather than on stage.

## 6. The machine itself

- [ ] **Notifications off.** Do Not Disturb / Focus on, on the laptop _and_ the
      phone.
- [ ] Screen sleep and screensaver disabled.
- [ ] Browser zoom at 100%.
- [ ] Only the tabs you need are open. Close the ones with your name in the title.
- [ ] **The tab is warmed up** — load the app and ask one question before the
      session starts. The first request pays for a cold connection, and it is
      always the slowest.

## 7. The fallback, rehearsed

- [ ] Open `/dev/rehearsal`. The recorded conversation renders with **no network
      at all**.
- [ ] Know how to get there without typing a URL in front of people: have the tab
      already open in the background.
- [ ] Say the line out loud once: _"the venue wifi has gone — here is the same
      conversation recorded earlier."_ Rehearsing the sentence is what makes it
      sound calm rather than apologetic.

---

## If something fails

| Symptom                                   | First thing to check                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Page loads, answers do not                | CORS — `ALLOWED_ORIGINS` in the backend must include this page's origin. The fix is never in the frontend.                                 |
| "You appear to be offline" but wifi works | Same as above, or the backend is down. The browser cannot tell a CORS refusal from being offline.                                          |
| Everything is slow                        | Note it, use the chips, keep talking. The fallback answers arrive over plain POST and are often faster on a bad network.                   |
| The microphone button is missing          | The page is not on HTTPS. Do not plan to show voice.                                                                                       |
| A judge trips the rate limit              | Expected. The Send button shows a countdown. Say "several people are asking at once" and carry on — it is a designed state, not a failure. |
| Anything unrecoverable                    | `/dev/rehearsal`, and the sentence from step 7.                                                                                            |

**Composure beats perfection.** Every failure on this list has a next action, and
the audience remembers how the presenter handled it far longer than they remember
what broke.
