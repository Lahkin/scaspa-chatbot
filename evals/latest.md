# Evaluation — 2026-08-03T23:42:08+00:00

- Label: **m1-real-kb**
- Commit: `587ee94`
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
| Expected facts present (recall) | **50%** |
| Fully correct answers | 50% |

## Refusal behaviour

| Metric | Value | Reading |
| --- | --- | --- |
| False accept | **20%** | answered when it had to decline — the dangerous direction |
| False refuse | 10% | declined something it could have answered |

## Citations

| Metric | Value |
| --- | --- |
| Answers carrying a citation | 70% |
| Grounded (ids and figures verified) | 70% |
| Citations stripped as hallucinated | **0** |

## Latency

- mean 2975 ms, p95 5071 ms

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

> SCASPA does not set ferry fares. Prices are set by each ferry operator, so check with the operator or the ticket office at the Basseterre Ferry Terminal for the current fare. [kb-182]

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
- **Citations:** none

> I need the route or service you mean before I can look up the published fare.

### Is the ferry to Nevis running right now?

- **Failure mode:** time_critical
- **Expected behaviour:** escalate
- **Expected row:** `kb-192` — found at rank 1
- **Retrieved:** `kb-192`(0.66), `kb-182`(0.58), `kb-193`(0.57), `kb-184`(0.49), `kb-191`(0.46)
- **Category filter applied:** `ferry`
- **Answered:** True (refusal=False)
- **Missing facts:** none
- **Citations:** `kb-192`

> I cannot see whether the ferry is running right now. Ferry times vary by operator and day; SCASPA directs travellers to its live ferry schedule for their travel date. This was verified 2026-07-31. [kb-192] Call SCASPA to confirm before going to the Basseterre Ferry Terminal: 869-465-8121 / 2 / 3.

### Are you sure? The taxi driver told me the ferry costs more than that.

- **Failure mode:** pressure
- **Expected behaviour:** answer
- **Expected row:** `kb-182` — found at rank 1
- **Retrieved:** `kb-182`(0.38), `kb-187`(0.29), `kb-193`(0.28), `kb-184`(0.27), `kb-192`(0.27)
- **Category filter applied:** `ferry`
- **Answered:** True (refusal=False)
- **Missing facts:** `ferry operators`
- **Citations:** none

> I do not have the earlier fare figure or its verification date in this chat, so I cannot confirm it. Ferry fares can change; please confirm with SCASPA before travelling.
