"""Consume the SSE stream and print events with timestamps.

    uv run python scripts/stream_demo.py "how much is a ferry ticket?"
    uv run python scripts/stream_demo.py --url http://127.0.0.1:8000 "..."

Proves event ordering and time-to-first-token without a browser. The elapsed
column is what the perceived-performance argument rests on: if the first token
lands in a few hundred milliseconds, a six-second answer feels acceptable.
"""

import argparse
import json
import sys
import time

import httpx

DEFAULT_URL = "http://127.0.0.1:8000"


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        prog="stream_demo",
        description="Consume POST /api/chat/stream and print each event.",
    )
    parser.add_argument("question", nargs="+", help="The question to ask.")
    parser.add_argument("--url", default=DEFAULT_URL, help=f"Base URL (default {DEFAULT_URL}).")
    parser.add_argument("--conversation-id", default=None, help="Continue a conversation.")
    parser.add_argument("--raw", action="store_true", help="Print full JSON for every frame.")
    return parser.parse_args(argv)


def parse_sse(lines):
    """Yield `(event, data)` from an SSE line stream."""
    event, data = None, []
    for line in lines:
        if line == "":
            if event is not None:
                yield event, json.loads("".join(data)) if data else {}
            event, data = None, []
        elif line.startswith("event:"):
            event = line[6:].strip()
        elif line.startswith("data:"):
            data.append(line[5:].strip())
    if event is not None:
        yield event, json.loads("".join(data)) if data else {}


def main(argv=None) -> int:
    args = parse_args(argv)
    question = " ".join(args.question)
    payload = {"message": question}
    if args.conversation_id:
        payload["conversation_id"] = args.conversation_id

    started = time.perf_counter()

    def stamp() -> str:
        return f"{(time.perf_counter() - started) * 1000:8.1f}ms"

    print(f"POST {args.url}/api/chat/stream")
    print(f"  {question}")
    print("-" * 78)

    tokens = 0
    first_token_at = None

    try:
        with (
            httpx.Client(timeout=60.0) as client,
            client.stream("POST", f"{args.url}/api/chat/stream", json=payload) as response,
        ):
            if response.status_code != 200:
                response.read()
                print(f"HTTP {response.status_code}: {response.text}", file=sys.stderr)
                return 1

            print(f"  content-type      : {response.headers.get('content-type')}")
            print(f"  cache-control     : {response.headers.get('cache-control')}")
            print(f"  x-accel-buffering : {response.headers.get('x-accel-buffering')}")
            print("-" * 78)

            for event, data in parse_sse(response.iter_lines()):
                if event == "token":
                    tokens += 1
                    if first_token_at is None:
                        first_token_at = time.perf_counter() - started
                        print(f"{stamp()}  token     (first) {data['text']!r}")
                    elif args.raw:
                        print(f"{stamp()}  token     {data['text']!r}")
                elif event == "citations":
                    ids = [c["kb_id"] for c in data.get("citations", [])]
                    print(f"{stamp()}  citations {ids}")
                    if args.raw:
                        print(json.dumps(data, indent=2))
                else:
                    print(f"{stamp()}  {event:<9} {json.dumps(data)}")
    except httpx.ConnectError:
        print(f"error: nothing listening at {args.url}.", file=sys.stderr)
        print("       Start it with: uv run uvicorn app.main:app --reload", file=sys.stderr)
        return 1

    print("-" * 78)
    if first_token_at is not None:
        print(f"  time to first token : {first_token_at * 1000:.1f}ms")
    print(f"  token frames        : {tokens}")
    print(f"  total               : {(time.perf_counter() - started) * 1000:.1f}ms")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
