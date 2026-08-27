"""End-to-end voice check: audio in, answer, audio out.

    uv run python scripts/voice_smoke.py question.wav
    uv run python scripts/voice_smoke.py --text "How much is a ferry ticket?"
    uv run python scripts/voice_smoke.py --preview-only --text "**Call** 869-465-8121 / 2 / 3"

Records nothing. It takes an audio file you already have, posts it to
`/api/stt`, sends the transcript to `/api/chat`, sends the answer to `/api/tts`,
and writes the MP3 out.

**Then listen to it.** Reading the sanitised text catches most problems, but
hearing it catches the rest — a phone number that still sounds like a quantity,
a run-on with nowhere to breathe, an abbreviation the voice model mangles. This
is the fastest way to find a sanitisation bug.

`--preview-only` skips both providers and just prints what would be spoken, so
you can iterate on sanitisation without spending anything.
"""

import argparse
import mimetypes
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx  # noqa: E402

DEFAULT_URL = "http://127.0.0.1:8000"


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        prog="voice_smoke", description="Drive STT -> chat -> TTS end to end."
    )
    parser.add_argument("audio", nargs="?", type=Path, help="An existing audio file.")
    parser.add_argument("--text", default=None, help="Skip STT and use this question.")
    parser.add_argument("--url", default=DEFAULT_URL, help=f"Base URL (default {DEFAULT_URL}).")
    parser.add_argument("--out", type=Path, default=Path("voice_smoke.mp3"), help="Where to write.")
    parser.add_argument(
        "--preview-only",
        action="store_true",
        help="Print the sanitised speech text and exit. No provider calls.",
    )
    parser.add_argument(
        "--voices",
        action="store_true",
        help="List the ElevenLabs account's voices with their ids, and exit.",
    )
    return parser.parse_args(argv)


def show(label: str, value: str) -> None:
    print(f"\n{label}")
    print("-" * len(label))
    print(value)


def list_voices() -> int:
    """Print the account's voices, so a human can choose one.

    ── WHY THIS EXISTS ─────────────────────────────────────────────────────────

    `ELEVENLABS_VOICE_ID` has no default, deliberately. Picking one in source
    would choose an accent, a gender and a register for a Caribbean port
    authority on the strength of whatever a developer saw first in a list —
    and it is the voice every caller hears.

    So the choice belongs to somebody entitled to make it, and this is what
    hands them the options. Until one is set, `/api/health` reports synthesis as
    unavailable and the speak-aloud control is not drawn: a half-configured
    provider is not offered as a working one.

    Runs in-process against `.env` rather than against a running server, because
    it is a configuration question and answering it should not need the API up.
    """
    from app.config import get_settings
    from app.voice.provider import elevenlabs_voices

    settings = get_settings()
    if not settings.ELEVENLABS_API_KEY.strip():
        print("ELEVENLABS_API_KEY is not set in backend/.env", file=sys.stderr)
        return 1

    try:
        voices = elevenlabs_voices(settings)
    except Exception as exc:  # noqa: BLE001 — a CLI reports rather than raises
        print(f"could not reach ElevenLabs: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1

    if not voices:
        print("this account has no voices")
        return 1

    current = settings.ELEVENLABS_VOICE_ID.strip()
    print(f"{len(voices)} voice(s) on this account:")
    print()
    for voice_id, name in voices:
        marker = "  <- ELEVENLABS_VOICE_ID" if voice_id == current else ""
        print(f"  {voice_id}  {name}{marker}")
    if not current:
        print()
        print("Set one in backend/.env:")
        print()
        print("    ELEVENLABS_VOICE_ID=<id from above>")
    return 0


def main(argv=None) -> int:
    args = parse_args(argv)

    if args.voices:
        return list_voices()

    if not args.audio and not args.text:
        print("error: give an audio file, or --text to skip STT", file=sys.stderr)
        return 1

    with httpx.Client(base_url=args.url, timeout=120.0) as client:
        # ---- 1. speech to text ------------------------------------------
        if args.text:
            question = args.text
            print(f"[1/3] STT skipped; using --text: {question!r}")
        else:
            if not args.audio.exists():
                print(f"error: no such file: {args.audio}", file=sys.stderr)
                return 1
            guessed = mimetypes.guess_type(args.audio.name)[0] or "audio/webm"
            print(
                f"[1/3] POST /api/stt  ({args.audio.name}, {guessed}, "
                f"{args.audio.stat().st_size:,} bytes)"
            )
            try:
                response = client.post(
                    "/api/stt",
                    files={"audio": (args.audio.name, args.audio.read_bytes(), guessed)},
                )
            except httpx.ConnectError:
                print(f"error: nothing listening at {args.url}", file=sys.stderr)
                print("       uv run uvicorn app.main:app --reload", file=sys.stderr)
                return 1
            if response.status_code != 200:
                print(f"  STT failed: {response.status_code} {response.text}", file=sys.stderr)
                return 1
            question = response.json()["text"]
            show("Transcript (the user would edit this before sending)", question)

        # ---- 2. the answer ----------------------------------------------
        print("\n[2/3] POST /api/chat")
        response = client.post("/api/chat", json={"message": question})
        if response.status_code != 200:
            print(f"  chat failed: {response.status_code} {response.text}", file=sys.stderr)
            return 1
        body = response.json()
        answer = body["answer"]
        show("Answer (as shown on screen)", answer)
        print(
            f"\n  grounded={body['grounded']} refusal={body['refusal']} "
            f"citations={[c['kb_id'] for c in body['citations']]}"
        )

        # ---- 3. what will actually be spoken ----------------------------
        preview = client.post("/api/tts/preview", json={"text": answer})
        if preview.status_code == 200:
            spoken = preview.json()["text"]
            show("Sanitised for speech (read this carefully)", spoken)
            for problem, needle in (
                ("markdown asterisk", "*"),
                ("citation marker", "[kb-"),
                ("raw URL", "http"),
                ("table pipe", "|"),
                ("JSON brace", '{"'),
            ):
                if needle in spoken:
                    print(f"  WARNING: {problem} survived sanitisation ({needle!r})")

        if args.preview_only:
            print("\n--preview-only: stopping before synthesis. Nothing was spent.")
            return 0

        # ---- 4. synthesis ------------------------------------------------
        print("\n[3/3] POST /api/tts")
        response = client.post("/api/tts", json={"text": answer})
        if response.status_code != 200:
            print(f"  TTS failed: {response.status_code} {response.text}", file=sys.stderr)
            print("  Voice is an enhancement — the text path above still worked.", file=sys.stderr)
            return 1

        args.out.write_bytes(response.content)
        print(f"  {len(response.content):,} bytes -> {args.out}")
        print(
            f"  cache: {response.headers.get('x-tts-cache')}  etag: {response.headers.get('etag')}"
        )

        # A repeat proves the cache, which is the point of having one.
        again = client.post("/api/tts", json={"text": answer})
        print(
            f"  repeat cache: {again.headers.get('x-tts-cache')} "
            f"(should be 'hit' — canned answers are paid for once)"
        )

    print(f"\nNow LISTEN to {args.out}.")
    print("Check: is the phone number writeable? any asterisks? anywhere to breathe?")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
