"""Voice tests.

The sanitisation tests carry the weight. They are the part that is fully
verifiable without an API key, and they are where the bugs that make audio
useless actually live — a phone number read as a large integer, or an answer
that synthesises to silence.

No test here performs network I/O or writes audio outside a tmp directory.
"""

import struct

import pytest
from fastapi.testclient import TestClient

from app.agent.prompts import NO_ANSWER_MESSAGE, REFUSAL_MESSAGE
from app.config import get_settings
from app.main import create_app
from app.voice import tts as tts_module
from app.voice.stt import (
    MAX_AUDIO_BYTES,
    AudioRejected,
    normalise_content_type,
    validate_audio,
    wav_duration,
)
from app.voice.tts import sanitise_for_speech, synthesise, text_digest

# --------------------------------------------------------- THE PHONE NUMBER


def test_local_numbers_beside_a_full_one_are_also_spoken_as_digits() -> None:
    """── THE BUG THIS PINS ────────────────────────────────────────────────────

    `kb-005` — the answer people ring about — reads:

        Call SCASPA at (869) 465-8121, 465-8122, 465-8123, or 465-8124.

    Only the first matched the phone pattern, because the rest are seven digits
    with the area code left implicit. The end-to-end smoke check produced

        8 6 9, 4 6 5, 8 1 2 1, 465-8122, 465-8123, or 465-8124

    so three of the four lines would have been read aloud as "four hundred
    sixty-five dash eight thousand one hundred twenty-two". That is precisely
    the failure this whole module exists to prevent, on the most-spoken answer
    in the product — and it was found by reading the sanitised text, which is
    what that step of `scripts/voice_smoke.py` is for.
    """
    spoken = sanitise_for_speech("Call SCASPA at (869) 465-8121, 465-8122, 465-8123.")

    for leftover in ("465-8121", "465-8122", "465-8123"):
        assert leftover not in spoken, f"{leftover} was left as a quantity"
    assert "4 6 5, 8 1 2 2" in spoken
    assert "4 6 5, 8 1 2 3" in spoken


def test_a_number_range_is_not_mistaken_for_a_telephone_number() -> None:
    r"""The other half, and the reason the local pattern is context-gated.

    `\d{3}-\d{4}` matches "berths 100-2000" perfectly well. Expanding that into
    digits is a small degradation where missing a phone number is a real
    failure, so the aggressive reading applies only to text that already
    contains a full telephone number.
    """
    assert sanitise_for_speech("Berths 100-2000 are on the west side.") == (
        "Berths 100-2000 are on the west side."
    )

    # And a date, which is the same shape as nothing in particular but is the
    # commonest four-digit group in a verified answer.
    assert "2026-07-31" in sanitise_for_speech("This was verified on 2026-07-31.")


def test_phone_number_is_spoken_as_digits() -> None:
    """`869-465-8121` as a number is "eight hundred sixty-nine million…".

    Nobody can write that down, and this string ends every refusal.
    """
    spoken = sanitise_for_speech("Call 869-465-8121 for help.")

    assert "8 6 9, 4 6 5, 8 1 2 1" in spoken
    assert "869-465-8121" not in spoken


def test_scaspa_published_number_expands_to_three_lines() -> None:
    """`869-465-8121 / 2 / 3` means three numbers, not stray digits."""
    spoken = sanitise_for_speech("Telephone: 869-465-8121 / 2 / 3")

    assert "8 1 2 1" in spoken
    assert "8 1 2 2" in spoken
    assert "8 1 2 3" in spoken
    assert "/" not in spoken, "a slash read aloud is noise"


@pytest.mark.parametrize("message", [NO_ANSWER_MESSAGE, REFUSAL_MESSAGE])
def test_canned_messages_are_listenable(message: str) -> None:
    """These are the most-spoken strings in the product."""
    spoken = sanitise_for_speech(message)

    assert "8 6 9, 4 6 5, 8 1 2 1" in spoken
    assert "\n" not in spoken
    assert "  " not in spoken
    assert "869-465-8121" not in spoken


# ------------------------------------------------------------- sanitisation


def test_citation_markers_are_removed_without_leaving_a_gap() -> None:
    spoken = sanitise_for_speech("The fare is XCD 44.44 for an adult ticket [kb-008].")

    assert "kb-008" not in spoken
    assert "ticket ." not in spoken, "a space before the full stop reads as an odd pause"
    assert spoken.endswith("adult ticket.")


@pytest.mark.parametrize(
    ("markdown", "unwanted"),
    [
        ("Fee **bold** today", "*"),
        ("Fee *italic* today", "*"),
        ("Fee `code` today", "`"),
        ("Fee [link](https://x.test) today", "]("),
        ("Fee ![img](https://x.test/i.png) today", "!["),
        ("Fee ```\nblock\n``` today", "`"),
        # Line-level constructs must start a line, so they are tested as such.
        ("## Heading\ntext", "#"),
        ("- bullet\n- another", "- "),
        ("> quote\nmore", ">"),
        ("before\n---\nafter", "---"),
    ],
)
def test_markdown_is_not_spoken(markdown: str, unwanted: str) -> None:
    """Nobody wants to hear asterisks read aloud."""
    assert unwanted not in sanitise_for_speech(markdown)


def test_markdown_keeps_the_words() -> None:
    spoken = sanitise_for_speech("The **berth** charge and [the tariff](https://x.test/t.pdf)")

    assert "berth" in spoken
    assert "the tariff" in spoken


def test_urls_are_not_spelled_out() -> None:
    spoken = sanitise_for_speech("See https://www.scaspa.com/port-act.html for details.")

    assert "https" not in spoken
    assert "the SCASPA website" in spoken


def test_json_is_not_spoken() -> None:
    spoken = sanitise_for_speech('Data: {"fare": 44.44, "currency": "XCD"} done')

    assert "{" not in spoken
    assert '"fare"' not in spoken
    assert "done" in spoken


def test_table_cells_are_read_not_dropped() -> None:
    """Deleting the row lost the content — a fee table synthesised to silence."""
    spoken = sanitise_for_speech("| Item | Fee |\n| --- | --- |\n| Berth | EC$100 |")

    assert "|" not in spoken
    assert "Berth" in spoken
    assert "100 East Caribbean dollars" in spoken
    assert "---" not in spoken


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("XCD 44.44", "44.44 East Caribbean dollars"),
        ("EC$100", "100 East Caribbean dollars"),
        ("US$50", "50 US dollars"),
        ("USD 12.50", "12.50 US dollars"),
    ],
)
def test_currency_codes_are_expanded(raw: str, expected: str) -> None:
    assert expected in sanitise_for_speech(f"The charge is {raw} per unit.")


def test_line_breaks_become_sentence_breaks() -> None:
    """A bare space ran two clauses together with nowhere to pause."""
    spoken = sanitise_for_speech("Telephone: 869-465-8121\nPost: P.O. Box 963")

    assert ". Post:" in spoken


def test_empty_input_is_empty_output() -> None:
    assert sanitise_for_speech("") == ""
    assert sanitise_for_speech("   \n  ") == ""


def test_plain_text_is_left_alone() -> None:
    text = "The ferry leaves at 04:04 and 16:16."

    assert sanitise_for_speech(text) == text


# ------------------------------------------------------ audio validation (STT)


def wav_bytes(seconds: float, sample_rate: int = 16000) -> bytes:
    """A minimal valid mono 16-bit WAV of the given duration."""
    frames = int(seconds * sample_rate)
    data = b"\x00\x00" * frames
    return (
        b"RIFF"
        + struct.pack("<I", 36 + len(data))
        + b"WAVE"
        + b"fmt "
        + struct.pack("<IHHIIHH", 16, 1, 1, sample_rate, sample_rate * 2, 2, 16)
        + b"data"
        + struct.pack("<I", len(data))
        + data
    )


def test_wav_duration_is_exact() -> None:
    assert wav_duration(wav_bytes(3.0)) == pytest.approx(3.0, abs=0.01)


@pytest.mark.parametrize(
    "content_type",
    ["audio/webm", "audio/webm;codecs=opus", "audio/mp4", "audio/mpeg", "audio/wav", "audio/ogg"],
)
def test_supported_formats_are_accepted(content_type: str) -> None:
    check = validate_audio(b"x" * 1000, content_type)

    assert check.content_type == normalise_content_type(content_type)


@pytest.mark.parametrize("content_type", ["text/plain", "application/pdf", "image/png", None, ""])
def test_unsupported_formats_are_rejected_clearly(content_type) -> None:
    with pytest.raises(AudioRejected, match="not supported"):
        validate_audio(b"x" * 1000, content_type)


def test_empty_upload_is_rejected() -> None:
    with pytest.raises(AudioRejected, match="empty"):
        validate_audio(b"", "audio/webm")


def test_oversized_upload_is_rejected() -> None:
    with pytest.raises(AudioRejected, match="limit is 20 MB"):
        validate_audio(b"x" * (MAX_AUDIO_BYTES + 1), "audio/webm")


def test_long_wav_is_rejected_on_exact_duration() -> None:
    with pytest.raises(AudioRejected, match="seconds"):
        validate_audio(wav_bytes(120), "audio/wav")


def test_sixty_second_clip_is_accepted() -> None:
    """A genuine 60-second question must not be refused by an approximation."""
    check = validate_audio(wav_bytes(60), "audio/wav")

    assert check.duration_exact is True
    assert check.duration_seconds == pytest.approx(60.0, abs=0.1)


def test_compressed_duration_is_a_lower_bound_not_a_guess() -> None:
    """Ambiguous clips are accepted; only certainly-too-long ones are refused.

    Wrongly refusing a traveller's question is worse than occasionally paying
    for a slightly longer one.
    """
    # 20 MB of webm is far too long at any plausible bitrate.
    with pytest.raises(AudioRejected):
        validate_audio(b"x" * (19 * 1024 * 1024), "audio/webm")

    # A small clip is accepted without complaint.
    assert validate_audio(b"x" * 50_000, "audio/webm").duration_exact is False


# ------------------------------------------------------------------- caching


class FakeSpeech:
    """Counts synthesis calls so a cache hit is provable."""

    def __init__(self) -> None:
        self.calls = 0
        self.audio = type("Audio", (), {"speech": self})()

    def create(self, **kwargs):  # noqa: ANN003, ANN201
        self.calls += 1
        return type("R", (), {"content": b"ID3fake-mp3-bytes"})()


def test_repeat_synthesis_hits_the_cache(tmp_settings) -> None:
    """Rehearsal repeats the same canned answers; pay once."""
    client = FakeSpeech()

    first_audio, first = synthesise(NO_ANSWER_MESSAGE, settings=tmp_settings, client=client)
    second_audio, second = synthesise(NO_ANSWER_MESSAGE, settings=tmp_settings, client=client)

    assert first.hit is False
    assert second.hit is True
    assert client.calls == 1, "the second call must not reach the provider"
    assert first_audio == second_audio


def test_cache_key_ignores_cosmetic_differences(tmp_settings) -> None:
    """The key is the *sanitised* text, so markdown variants share an entry."""
    plain = text_digest(sanitise_for_speech("The fare is XCD 44.44."), tmp_settings)
    marked = text_digest(sanitise_for_speech("The **fare** is XCD 44.44 [kb-008]."), tmp_settings)

    assert plain == marked


def test_cache_key_changes_with_the_voice(tmp_settings) -> None:
    """Changing voice must not serve stale audio in the old one."""
    other = tmp_settings.model_copy(update={"OPENAI_TTS_VOICE": "cedar"})

    assert text_digest("hello", tmp_settings) != text_digest("hello", other)


def test_cache_prunes_to_the_limit(tmp_settings) -> None:
    directory = tts_module.cache_dir(tmp_settings)
    for index in range(10):
        (directory / f"{index:064x}.mp3").write_bytes(b"x")

    tts_module.prune_cache(tmp_settings, max_entries=4)

    assert len(list(directory.glob("*.mp3"))) == 4


def test_empty_after_sanitisation_is_rejected(tmp_settings) -> None:
    with pytest.raises(ValueError, match="nothing to speak"):
        synthesise("[kb-001]", settings=tmp_settings, client=FakeSpeech())


def test_overlong_text_is_rejected(tmp_settings) -> None:
    with pytest.raises(ValueError, match="limit is"):
        synthesise("word " * 3000, settings=tmp_settings, client=FakeSpeech())


# ------------------------------------------------------------------- HTTP


@pytest.fixture
def api(tmp_settings, monkeypatch):
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: tmp_settings
    monkeypatch.setattr(tts_module, "build_speech_client", lambda settings=None: FakeSpeech())
    return TestClient(app)


def test_tts_returns_mp3_with_caching_headers(api) -> None:
    response = api.post("/api/tts", json={"text": "The fare is XCD 44.44 [kb-008]."})

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/mpeg"
    assert response.headers["cache-control"] == "public, max-age=3600"
    assert response.headers["etag"]
    assert response.content


def test_tts_second_request_reports_a_cache_hit(api) -> None:
    body = {"text": "The fare is XCD 44.44."}

    first = api.post("/api/tts", json=body)
    second = api.post("/api/tts", json=body)

    assert first.headers["x-tts-cache"] == "miss"
    assert second.headers["x-tts-cache"] == "hit"


def test_tts_etag_gives_a_304(api) -> None:
    body = {"text": "The fare is XCD 44.44."}
    etag = api.post("/api/tts", json=body).headers["etag"]

    again = api.post("/api/tts", json=body, headers={"If-None-Match": etag})

    assert again.status_code == 304
    assert again.content == b""


def test_tts_preview_costs_nothing_and_shows_the_speech(api) -> None:
    response = api.post("/api/tts/preview", json={"text": "**Call** 869-465-8121 [kb-001]."})

    assert response.status_code == 200
    text = response.json()["text"]
    assert "8 6 9, 4 6 5, 8 1 2 1" in text
    assert "*" not in text


def test_tts_rejects_blank_text(api) -> None:
    response = api.post("/api/tts", json={"text": "   "})

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_stt_rejects_a_bad_content_type(api) -> None:
    response = api.post(
        "/api/stt", files={"audio": ("note.txt", b"not audio at all", "text/plain")}
    )

    assert response.status_code == 422
    error = response.json()["error"]
    assert error["code"] == "VALIDATION_ERROR"
    assert "not supported" in error["message"]


def test_stt_rejects_a_long_recording(api) -> None:
    response = api.post("/api/stt", files={"audio": ("long.wav", wav_bytes(200), "audio/wav")})

    assert response.status_code == 422
    assert "seconds" in response.json()["error"]["message"]


def test_stt_returns_only_text(api, monkeypatch) -> None:
    """No answer, no citations — the user edits the transcript first."""
    from app.routers import voice as voice_router

    monkeypatch.setattr(voice_router, "transcribe", lambda *a, **k: "How much is a ferry ticket?")

    response = api.post("/api/stt", files={"audio": ("q.wav", wav_bytes(2), "audio/wav")})

    assert response.status_code == 200
    assert response.json() == {"text": "How much is a ferry ticket?"}


def test_voice_failure_does_not_affect_the_text_path(api, monkeypatch) -> None:
    """Voice is an enhancement. If the mic dies on stage, keep typing."""
    from app.voice.tts import TTSUnavailableError

    def boom(*args, **kwargs):  # noqa: ANN002, ANN003, ANN202
        raise TTSUnavailableError("provider down")

    monkeypatch.setattr("app.routers.voice.synthesise", boom)

    response = api.post("/api/tts", json={"text": "hello"})

    assert response.status_code == 503
    error = response.json()["error"]
    assert "still type your question" in error["message"]
    assert "provider down" not in response.text, "no upstream detail may leak"
    # The text path is untouched.
    assert api.get("/api/health").status_code == 200


def test_no_audio_is_written_to_disk_by_stt(api, tmp_settings, monkeypatch) -> None:
    """Uploaded audio is processed in memory and discarded."""
    from app.routers import voice as voice_router

    monkeypatch.setattr(voice_router, "transcribe", lambda *a, **k: "hello")
    before = set(tmp_settings.scraped_path.parent.rglob("*"))

    api.post("/api/stt", files={"audio": ("q.wav", wav_bytes(2), "audio/wav")})

    assert set(tmp_settings.scraped_path.parent.rglob("*")) == before
