# SLR NébulaLabs

Tool for conducting **Systematic Literature Reviews (SLR)** following PRISMA 2020 methodology. Automates the identification and title/abstract screening phases using academic APIs and Claude AI.

## What it does (current scope)

1. Takes one or more Boolean search strings and queries four academic databases in parallel
2. Deduplicates results across sources and strings by DOI
3. Runs AI-assisted screening (title + abstract) using Claude — returns `include`, `exclude`, or `maybe` with confidence score and reasoning
4. Papers below the confidence threshold are flagged for **Human-in-the-Loop (HITL)** review
5. Logs PRISMA-compliant event counts at each step

### Sources

| Source | Boolean support | Query strategy |
|---|---|---|
| OpenAlex | No — relevance only | Key terms extracted from both clusters, space-separated |
| arXiv | Yes — `all:` field prefix | `(all:term1 OR all:term2) AND (all:term3 OR ...)` |
| IEEE Xplore | Yes — native `querytext` | Raw Boolean string passed as-is |
| Crossref | No — relevance only | Key terms extracted from both clusters, space-separated |

Each source receives a query adapted for its own API via `src/utils/query-adapter.js`. You write one Boolean string in the UI; the adapter translates it per source automatically.

---

## Architecture

```
Browser (React) ──► Express API (port 3000)
                         │
                    BullMQ queue
                         │
                    Search Worker
                    ├── Search Agent  →  OpenAlex / arXiv / IEEE / Crossref
                    └── Screening Agent  →  Claude (title/abstract)
                         │
                    Supabase (PostgreSQL)
                    ├── runs
                    ├── studies
                    ├── screening_decisions
                    ├── prisma_events
                    └── audit_log
```

The worker runs inside the same Express process (`server.js`). BullMQ uses Redis as the job queue.

---

## Setup

### 1. Prerequisites

- Node.js 18+
- A running Redis instance (local or cloud)
- A Supabase project with the SLR schema applied
- An Anthropic API key

### 2. Install dependencies

```bash
# Backend
npm install

# Frontend
cd web && npm install
```

### 3. Environment variables

Create a `.env` file in the project root:

```env
SUPABASE_URL=https://your-project.supabase.co
DB_KEY=your-supabase-service-role-key
ANTHROPIC_API_KEY=sk-ant-...
REDIS_URL=redis://localhost:6379
```

### 4. Run

```bash
# Terminal 1 — backend + worker
npm run dev

# Terminal 2 — frontend (dev mode)
cd web && npm run dev
```

The UI is available at `http://localhost:5173`. The API runs at `http://localhost:3000`.

---

## How to run your SLR — RQ1 example

This walkthrough uses String 1 from a QCBP doctoral thesis (RQ1: LLM / AI Orchestration Layer).

### Step 1 — Open the app and fill in the form

**Tema principal:**
```
LLM and AI Orchestration for Quantum Computing Platforms
```

**Strings de búsqueda** — paste your Boolean string exactly as written, one block per string. Blocks are separated by a blank line:

```
("large language model" OR "LLM" OR "natural language processing" OR "NLP" OR "AI orchestration" OR "language model" OR "generative AI" OR "QNLP" OR "quantum natural language" OR "natural language interface" OR "code generation" OR "prompt engineering" OR "AI agent") AND ("quantum computing" OR "quantum algorithm" OR "quantum workflow" OR "quantum platform" OR "quantum software" OR "quantum circuit")
```

The app automatically translates this string for each source:

| Source | Query sent to the API |
|---|---|
| **arXiv** | `(all:"large language model" OR all:LLM OR all:NLP OR ...) AND (all:"quantum computing" OR all:"quantum algorithm" OR ...)` |
| **IEEE** | The Boolean string as-is — IEEE Xplore supports AND/OR natively |
| **OpenAlex** | `large language model LLM natural language processing NLP AI orchestration quantum computing quantum algorithm ...` |
| **Crossref** | Same as OpenAlex — relevance search over extracted terms |

For OpenAlex and Crossref, which do not support Boolean operators, the query is reduced to its key terms. These APIs return results by relevance; Claude's screening agent then applies the actual inclusion/exclusion criteria, making false positives from broader recall acceptable.

If you have multiple strings (e.g. RQ2, RQ3…), separate them with a blank line in the same textarea. They all run within the same `run` record and their results are pooled and deduplicated together.

### Step 2 — Configure (optional — click "Configuración avanzada")

| Setting | Recommended value | Notes |
|---|---|---|
| Fuentes | All four selected | Deselect IEEE if you don't have an API key |
| Umbral de confianza HITL | 70% (default) | Papers below this confidence go to HITL |
| Criterios de inclusión | Pre-filled with QCBP defaults | Edit to match your exact inclusion criteria |
| Criterios de exclusión | Pre-filled with QCBP defaults | Edit to match your exact exclusion criteria |

The inclusion/exclusion criteria are sent verbatim to Claude for every paper it screens, so precision here directly affects screening quality.

### Step 3 — Launch

Click **Iniciar búsqueda**. The run enters the BullMQ queue. Progress moves through these states:

```
pending → searching → screening → screening_done
```

The search phase queries all sources. The screening phase evaluates each non-duplicate paper with Claude. Depending on volume this can take several minutes.

### Step 4 — Review PRISMA counts

Once `screening_done`, go to the run's stats view. You will see PRISMA event counts logged at each step:

```
identification | records_identified      | ~740
identification | duplicates_removed      | ~287
identification | after_dedup             | ~453
screening      | screened_title_abstract | ~453
screening      | included_ta             | ~60
screening      | excluded_ta             | ~350
screening      | maybe_ta / hitl         | ~43
```

These numbers feed directly into your PRISMA flow (Table 2 of the thesis).

### Step 5 — HITL review

Papers marked `maybe` (confidence below your threshold) appear in the **HITL** tab. For each paper you see:

- Title and abstract
- Claude's decision and reason
- Confidence score (colour-coded: green ≥ 70%, amber 50–70%, red < 50%)

Click **Include**, **Exclude**, or **Maybe** to record your manual decision. Human decisions override Claude's.

### Step 6 — Repeat for each RQ string

Create a separate run for each RQ string (RQ2, RQ3, RQ4, RQ5). At the end, the total unique papers across all runs — after deduplication within each run — give you the identification numbers for your PRISMA flow diagram.

> **Note:** There is no automatic cross-run deduplication today. If you want to merge runs, you will need to do that manually at the database level (compare DOIs across `studies` where `run_id IN (...)` and `is_duplicate = false`).

---

## Database tables

| Table | Purpose |
|---|---|
| `runs` | One record per search execution |
| `studies` | Papers found; `is_duplicate = true` marks deduplicated entries |
| `screening_decisions` | Claude and human decisions per paper per stage |
| `prisma_events` | PRISMA-flow counts (stage, event, count) |
| `audit_log` | Full audit trail of agent and human actions |

---

## What is NOT implemented yet

The following phases are planned but not built:

- **Full-text retrieval** — PDF download via Unpaywall / pdf-parse
- **Stage 2 screening** — full-text-based include/exclude
- **DARE scoring** and data extraction agents
- **RAG / synthesis** — pgvector embeddings, chat over corpus
- **PRISMA diagram** — SVG auto-generation from `prisma_events`
- **CSV / Excel export** — only DOCX export exists today
- **Cross-run deduplication** UI
- **Authentication** — the app has no login; treat it as a local/trusted tool

---

## Tech stack

| Layer | Technology |
|---|---|
| Backend | Node.js (ESM), Express 5 |
| Queue | BullMQ + Redis (ioredis) |
| AI | Anthropic Claude (`claude-opus-4-6` for screening) |
| Database | Supabase (PostgreSQL) |
| Frontend | React + Vite |
| Academic APIs | OpenAlex, arXiv, IEEE Xplore, Crossref |
