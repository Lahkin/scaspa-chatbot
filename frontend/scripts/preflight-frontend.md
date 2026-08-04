# Frontend preflight

Run this **in the venue, on the venue network, on the presenting machine**, about
twenty minutes before presenting. It takes five minutes.

The point is not to discover that everything works. It is to discover the one
thing that does not, while there is still time.

> **This checklist is the machine, not the demo.** What to walk through, what to
> say, the chat questions, the fallback and the answers for SCASPA's IT staff all
> live in **`docs/demo-day.md`**, which is the single runbook.
>
> This file used to carry its own walkthrough. It went stale — it had no
> operations screens at all, having been written before they existed — and two
> runbooks that disagree are worse than one. The walkthrough sections below now
> point at `demo-day.md` rather than repeating it.
>
> **The demo runs on `npm run dev`, not a deployed build** (`demo-day.md` §0).
> That is what keeps `/dev/rehearsal` reachable; it is `import.meta.env.DEV`-only
> by design, so a production build 404s it and the recovery path disappears.

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
- [ ] Backend running and reachable — `http://localhost:8000/api/health` in a tab.
- [ ] **It is the backend you just started.** `lsof -ti:8000`. A stale instance
      holds the port, the new one cannot bind, and the old one answers with the
      configuration it booted with. This has cost a walkthrough once already.

## 1. The app loads

- [ ] `npm run dev`, and open `http://localhost:5173`. **Not a deployed build** —
      see the note at the top, and `demo-day.md` §0.
- [ ] **No console errors.** Open devtools, reload, read the console. A red line
      here is worth five minutes now.
- [ ] The footer shows "Information verified as of …" with a date. If it does
      not, `/api/health` is unreachable and nothing else on this list will work.

## 2. Health

- [ ] `http://localhost:8000/api/health` returns `"status": "ok"`.
- [ ] `index.ready` is `true`.
- [ ] `kb_version` is the version you expect. **Write it down here:** `__________`
- [ ] No degraded banner across the top of the app.

## 3. The demo questions — **see `docs/demo-day.md` §3**

The list lives there, verified by the T-23 rehearsal rather than assumed. Two
questions this file used to recommend do not survive that check: the corpus
publishes no fixed ferry timetable, and the real tariff schedule is still blocked
on SCASPA — so _"what time is the last ferry back from Nevis?"_ and _"how much is
a 40-foot container?"_ refuse rather than answer. A graceful refusal is a fine
thing to **show deliberately** (`demo-day.md` §4); it is a poor thing to walk
into while expecting a cited answer.

- [ ] Each question in `demo-day.md` §3 returns an answer **with at least one
      numbered source**, fast enough to talk over.
- [ ] If one is slow, note which: `__________`. Lead with a different one.

## 4. The moments worth showing — **see `docs/demo-day.md` §2 and §4**

- [ ] **The refusal** — `demo-day.md` §4. The escalation card with three tappable
      numbers. The most persuasive moment in the demo, and most teams hide it.
- [ ] **A source.** Tap a numbered chip. The panel opens at that source, showing
      the date it was verified.
- [ ] **The five screens** in `demo-day.md` §2 — `/chat`, `/vessels`, `/flights`,
      `/tariffs`, `/support` — each loads, with its source notice intact.

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

- [ ] **You are running `npm run dev`.** Confirm it, do not assume it. On a
      production build `/dev/rehearsal` 404s and this whole step is fiction —
      the route is `import.meta.env.DEV`-only by design
      (`src/routes/dev.rehearsal.tsx:14,27`). If someone deployed the app since
      the last rehearsal, the recovery path left with it.
- [ ] Open `/dev/rehearsal`. The recorded conversation renders with **no network
      at all**.
- [ ] `VITE_ENABLE_MOCKS=true npm run dev` also serves every screen from the
      mock layer — the wider fallback, when it is the backend rather than the
      network that has gone.
- [ ] Have the tab **already open in the background**. Reaching it should not
      involve typing a URL in front of people.
- [ ] Say the line out loud once: _"the venue wifi has gone — here is the same
      conversation recorded earlier."_ Rehearsing the sentence is what makes it
      sound calm rather than apologetic.

---

## If something fails

The full table, with what to say as well as what to check, is in
**`docs/demo-day.md`**. The three that are about _this machine_:

| Symptom                            | First thing to check                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Page loads, answers do not         | CORS — `ALLOWED_ORIGINS` in the backend must include this page's origin. The fix is never in the frontend.                    |
| Screens say "no source configured" | A **stale backend** on `:8000`, answering with the config it booted with. `lsof -ti:8000`. This has cost a walkthrough twice. |
| The microphone button is missing   | The page is not on HTTPS. Do not plan to show voice.                                                                          |

**Composure beats perfection.** Every failure has a next action, and the audience
remembers how the presenter handled it far longer than they remember what broke.
