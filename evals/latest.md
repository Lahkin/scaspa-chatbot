# Evaluation — 2026-08-04T00:14:17+00:00

- Label: **m1-corrected-baseline**
- Commit: `fb37852`
- Knowledge base: `2026-07-31` (115 rows indexed)
- Questions: **15**

## Retrieval — fix this first

Most failures are retrieval failures. Tuning prompts to fix a search problem
wastes days, so this is measured separately and moved first.

| Metric | Value |
| --- | --- |
| hit@1 | **73%** |
| hit@3 | 82% |
| hit@5 | 82% |
| MRR | 0.773 |
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

## Answer correctness

| Metric | Value |
| --- | --- |
| Expected facts present (recall) | **45%** |
| Fully correct answers | 45% |

## Refusal behaviour

| Metric | Value | Reading |
| --- | --- | --- |
| False accept | **0%** | answered when it had to decline — the dangerous direction |
| False refuse | 9% | declined something it could have answered |

## Citations

| Metric | Value |
| --- | --- |
| Answers carrying a citation | 80% |
| Grounded (ids and figures verified) | 80% |
| Citations stripped as hallucinated | **0** |

## Latency

- mean 3456 ms, p95 5767 ms

## Overall pass rate: 60%

## Failures (6)

One GitHub issue per row. Give the researchers the question, what came back,
and what was expected — they can act on that without reading code.

### How much is a ferry ticket?

- **Failure mode:** straightforward
- **Expected behaviour:** answer
- **Expected row:** `kb-182` — found at rank 1
- **Retrieved:** `kb-182`(0.60), `kb-192`(0.40), `kb-187`(0.38), `kb-185`(0.38), `kb-184`(0.36)
- **Category filter applied:** `ferry`
- **Answered:** True (refusal=False)
- **Missing facts:** `ferry operators`
- **Citations:** `kb-182`

> SCASPA does not set ferry fares. Prices are set by each ferry operator, so check with the operator or the ticket office at the Basseterre Ferry Terminal in Basseterre for the current fare. [kb-182] SCASPA: 869-465-8121 / 2 / 3.

### When is the cargo gate open?

- **Failure mode:** exact_token
- **Expected behaviour:** answer
- **Expected row:** `kb-016` — **NOT RETRIEVED**
- **Retrieved:** `kb-163`(0.47), `kb-174`(0.44), `kb-172`(0.40), `kb-162`(0.40), `kb-153`(0.39)
- **Category filter applied:** `cargo`
- **Answered:** True (refusal=False)
- **Missing facts:** `8:00 am`, `4:00 pm`
- **Citations:** none

> I do not have published cargo-gate opening hours. Please confirm with SCASPA before travelling: 869-465-8121 / 2 / 3.

### what about the other one?

- **Failure mode:** follow_up_ellipsis
- **Expected behaviour:** answer
- **Expected row:** `kb-075` — **NOT RETRIEVED**
- **Retrieved:** `kb-077`(0.44), `kb-053`(0.42), `kb-079`(0.42), `kb-036`(0.40), `kb-071`(0.38)
- **Query after rewriting:** `what about the other one? airport`
- **Category filter applied:** `airport`
- **Answered:** False (refusal=True)
- **Missing facts:** `parking decals`
- **Citations:** none

> I do not have that in SCASPA's verified information, so I will not guess at it. SCASPA staff can confirm it for you directly. You can reach SCASPA directly: Telephone: 869-465-8121 / 2 / 3 Post: P.O. Box 963, Bird Rock, Basseterre, St. Kitts

### and the fare?

- **Failure mode:** follow_up_ellipsis
- **Expected behaviour:** answer
- **Expected row:** `kb-182` — found at rank 1
- **Retrieved:** `kb-182`(0.73), `kb-192`(0.64), `kb-193`(0.60), `kb-184`(0.53), `kb-191`(0.46)
- **Query after rewriting:** `and the fare? ferry nevis`
- **Category filter applied:** `ferry`
- **Answered:** True (refusal=False)
- **Missing facts:** `ferry operators`
- **Citations:** `kb-182`

> SCASPA does not set ferry fares. Check with the ferry operator or the ticket office at the Basseterre Ferry Terminal in Basseterre for the current price. [kb-182]

### What time does the port open?

- **Failure mode:** retrieval_collision
- **Expected behaviour:** answer
- **Expected row:** `kb-016` — found at rank 1
- **Retrieved:** `kb-016`(0.54), `kb-125`(0.46), `kb-163`(0.42), `kb-164`(0.42), `kb-172`(0.42)
- **Answered:** True (refusal=False)
- **Missing facts:** `8:00 am`
- **Citations:** none

> I do not have published opening hours for the port facilities. Please confirm with SCASPA before travelling: 869-465-8121 / 2 / 3.

### Are you sure? The taxi driver told me the ferry costs more than that.

- **Failure mode:** pressure
- **Expected behaviour:** answer
- **Expected row:** `kb-182` — found at rank 1
- **Retrieved:** `kb-182`(0.38), `kb-187`(0.29), `kb-193`(0.28), `kb-184`(0.27), `kb-192`(0.27)
- **Category filter applied:** `ferry`
- **Answered:** True (refusal=False)
- **Missing facts:** `ferry operators`
- **Citations:** `kb-182`

> I cannot confirm the taxi driver’s price. SCASPA does not set ferry fares; each ferry operator sets its own, so check with the operator or the ticket office at the Basseterre Ferry Terminal for the current fare. [kb-182] That information was verified on 2026-07-31.
