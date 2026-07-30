# Privacy

Written plainly, because that is more useful than a confident one — and because
the presenters should be able to say all of this out loud without checking.

## The short version

**We store the questions. We do not store who asked them.**

There is no account, no login, no cookie, no analytics tag, and no IP address in
any log or file. A conversation is a random number that expires within the hour.

## What is stored

| What | Where | For how long |
| --- | --- | --- |
| Question text | `data/questions.jsonl`, and the application log | Until deleted by hand |
| Whether the question was answered and grounded | same | same |
| Conversation history (question + answer text) | Server memory only | `CONVERSATION_TTL_MINUTES` (default 60), and lost on restart |
| Synthesised speech audio | `data/tts_cache/` on disk | Until evicted by an LRU cap |
| Token counts and a spend estimate | Server memory only | Until restart |

## What is never collected

- IP addresses. The rate limiter needs to tell clients apart, so it hashes the IP
  with a random per-process salt, uses it as a dictionary key, and discards it. It
  is never written to a log or a file. Restarting rotates the salt, so keys from
  two runs cannot be matched.
- User agents, device fingerprints, screen sizes.
- Cookies, accounts, logins, email addresses, names.
- Any session identifier beyond the ephemeral `conversation_id`.
- **Uploaded audio.** A voice recording is held in memory, sent for
  transcription, and dropped. It is never written to disk and never logged.
- **Transcripts.** The text of what someone said is returned to their browser and
  is not logged.

The application log formatter **raises an exception** if a log record carries a
field named like an identifier — `ip`, `user_agent`, `session_id`, `audio`,
`transcript` and others. That is enforced in code and covered by a test, not left
to reviewer discipline.

## Why the question text is kept

It is the most useful thing this project produces. A record of what travellers and
hauliers actually ask tells SCASPA which information is missing from its published
material, and it feeds the researchers' gaps list directly.

Keeping it is defensible **because** the identifiers are absent: it is a record of
*questions*, not of *people*. If the file leaked, it would reveal curiosity, not
identity.

`scripts/export_questions.py` produces the shareable CSV. It refuses to run if it
finds an identifier-shaped field in the source file, and it deliberately omits the
`conversation_id` — including it would let two questions be linked into one
person's visit.

## Why conversations are in memory only

Conversation state lives in the serving process and nowhere else. Nothing is
written to disk, no database is involved, nothing survives a restart.

The trade is real and accepted: lose the conversation id and the conversation is
gone, and with multiple workers history is best-effort. That is preferred to
holding a durable transcript tied to a session — for people passing through a port
or an airport, that would be a record of where someone was, when, and what they
were about to do.

## Third parties

Questions and answer text are sent to **OpenAI** for generation, embedding,
transcription and speech. Audio is sent for transcription. Nothing else is shared
with anyone, and no analytics or advertising service is used.

## Deleting data

- Conversations: expire on their own, or restart the process.
- Question log: delete `data/questions.jsonl`.
- Speech cache: delete `data/tts_cache/`.

There are no per-person deletion requests to service, because there is no way to
identify a person's data — which is the point.
