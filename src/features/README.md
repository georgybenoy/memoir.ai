# Features

Domain logic lives in `src/features/*` as pure TypeScript with **no React imports** (AGENTS.md Architecture Rule 1).

- `ingestion`: document extraction, text chunking, and source tracing
- `concepts`: concept extraction and definition
- `dependency-graph`: DAG algorithms, cycle handling, topological sorting
- `conversation`: dialog state and prompt composition
- `recall`: question generation and recall test handling
- `evaluation`: answer evaluation and scoring
- `mastery`: mastery metrics and learning progress tracking
- `spaced-repetition`: SM-2 scheduling and review intervals
