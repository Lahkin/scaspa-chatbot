# Evaluation — 2026-07-30T12:40:07+00:00

- Label: **shipped-defaults**
- Commit: `f4c2fc2`
- Knowledge base: `2026-06-01` (15 rows indexed)
- Questions: **15**

## Retrieval — fix this first

Most failures are retrieval failures. Tuning prompts to fix a search problem
wastes days, so this is measured separately and moved first.

| Metric | Value |
| --- | --- |
| hit@1 | **64%** |
| hit@3 | 100% |
| hit@5 | 100% |
| MRR | 0.818 |
| Questions with an expected row | 11 |

## Configuration

| Setting | Value |
| --- | --- |
| `query_rewrite` | `True` |
| `category_filter` | `True` |
| `hybrid` | `False` |
| `rerank` | `False` |
| `min_score` | `0.3` |
| `top_k` | `5` |
| `fetch_k` | `20` |
| `embedding_model` | `text-embedding-3-large` |

## Answers, refusals and citations — NOT MEASURED

> No `OPENAI_API_KEY`, so the chat model was never called. The retrieval
> numbers above are real; everything downstream of generation is **absent,
> not zero**. Re-run with a key to fill this in.

## Failures (0)

One GitHub issue per row. Give the researchers the question, what came back,
and what was expected — they can act on that without reading code.

None. Every case passed.