# Learning content packs

Learning content (sources, questions, keys) is separate from application data (members, answers,
consent). A pack never touches session data, and a session freezes its pack (`pack_hash`) at creation,
so a later rebuild can never change an active session's key.

| Pack | Concept | Source | License | Status |
|---|---|---|---|---|
| `compound-change`, `base-rates`, `correlation` | `data/questions.json` | original synthetic RELAY material | repo | reviewed (starter) |
| `sample-successive-change` | `data/sample_round.json` | original sample material | repo | **sample only**: never a live concept, its keys ship to the browser |
| `iris-correlation` | `data/packs/iris/` | UCI Iris, Fisher (1936) | CC BY 4.0 | **draft**, awaiting human review |

## Iris pack (`data/packs/iris/`)

- **Fetched** 2026-10-25T15:30:12Z from `https://archive.ics.uci.edu/static/public/53/iris.zip`
  (archive SHA-256 `d11fe302…62e9`). License confirmed on the dataset page: CC BY 4.0, DOI
  10.24432/C56C76.
- **Snapshot** `bezdekIris.data` (SHA-256 `0fed2a99…7dc`, 150 rows, 50 per species, cm). The archive's
  `iris.data` differs from Fisher (1936) in samples 35 and 38, as its own `iris.names` states;
  `bezdekIris.data` carries the corrections. Both files' documentation is committed.
- **Computed in code** (`scripts/build_iris_pack.py`, refuses a file whose checksum differs):
  r(petal length, petal width) = 0.96 overall; r(sepal length, sepal width) = −0.12 overall but
  +0.74 / +0.53 / +0.46 within setosa / versicolor / virginica; mean petal length 1.46 / 4.26 / 5.55 cm.
- **Items** (original RELAY wording, not written or endorsed by the dataset authors):
  1. *Think privately*: what r = 0.96 does and does not support (not cause, not every flower, not a slope).
  2. *Fresh problem*: why pooling species flips the sepal correlation's sign. A different application of
     the same idea, not the same numbers reordered.
  3. *Delayed check*: what a difference in sample means does and does not show.
- **Tests** (`tests/test_iris_pack.py`): the committed pack equals the build output; every number shown
  is recomputed independently with `statistics.correlation`; a tampered snapshot is refused; a draft
  cannot start a live session (and never in production); keys stay out of public projections.

### To approve it (human review)

Read `pack.json` against the checklist in `manifest.json` (source relevance, wording, difficulty,
computations, keys). If it is right, set `"review": {"status": "reviewed", "reviewed_by": "<name>",
"reviewed_at": "<ISO date>"}` in `scripts/build_iris_pack.py`, rebuild (`python -m scripts.build_iris_pack`)
and run the tests. Until then it appears only with `RELAY_ALLOW_DRAFT_PACKS=true` in local testing.

## Sources not used, and why

- **OpenStax statistics**: the publisher's current page requires prior written permission for
  ingestion into generative-AI offerings. Not ingested.
- **OpenIntro**: many statistics files are CC BY-SA 3.0 with exceptions; each file needs its own check
  and share-alike handling. A later option.
- **World Bank Indicators**: per-indicator terms, units, dates and nulls need review. A later option.
- No scraping, uploads, vector database or RAG pipeline: one small, verifiable pack is the goal.
