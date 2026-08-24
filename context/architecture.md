# Architecture Context

## Stack

| Layer            | Technology                          | Role                                                      |
| ----------------- | ------------------------------------ | ----------------------------------------------------------- |
| Runtime           | Node.js + TypeScript                 | CLI runs locally via `node`/compiled `dist/`                |
| CLI framework     | Commander                            | Argument parsing, `init`/`tailor` subcommands               |
| LLM access        | Provider adapters (own HTTP calls)   | One adapter per vendor behind a shared interface             |
| Spreadsheet output| exceljs                              | Writes the match-report .xlsx                                |
| Docx parsing      | mammoth                              | Extracts plain text from a .docx resume                      |
| Config storage    | Local JSON file (`~/.job-agent/`)    | Stores provider + API key between runs                       |

No database, no server process, no network listener. The only outbound
network calls are to the single LLM provider Anshul has configured.

## System Boundaries

- `src/commands/` — CLI entry points only (`init`, `config`, `tailor`).
  Each command parses flags, calls into `src/lib/`, and handles top-level
  error/output formatting. No business logic lives here. `config` is
  strictly read-only — it never writes `~/.job-agent/config.json` and
  never triggers the first-run prompt (an unconfigured install just
  prints "not configured yet, run `job-agent init`").
- `src/lib/providers/` — one file per LLM vendor (`claude.ts`, `openai.ts`,
  `grok.ts`, `gemini.ts`, `openrouter.ts`), each implementing the same
  `LLMProvider` interface (see Invariants). `src/lib/providers/index.ts`
  resolves the configured provider name to its adapter — this is the only
  place that switches on provider name.
- `src/lib/parsers/` — turns the three input files (job-scan Markdown,
  resume, dream-companies list) into typed in-memory structures. Knows
  nothing about LLMs or output formats.
- `src/lib/match/` — orchestrates scoring: builds the rubric prompt, calls
  the configured provider per job (concurrency-limited, with retry/backoff),
  applies the dream-company override and the 40% threshold.
- `src/lib/tailor/` — orchestrates resume tailoring: builds the
  no-fabrication prompt per surviving job, calls the provider, writes the
  per-company Markdown file.
- `src/lib/excel/` — builds the .xlsx report from scored jobs. Knows
  nothing about how the jobs were scored.
- `src/lib/config.ts` — reads/writes `~/.job-agent/config.json`; resolves
  effective config (env var override > saved file).
- `src/types.ts` — shared types (`JobListing`, `MatchResult`, `ScoredJob`,
  `JobAgentConfig`, `LLMProvider` interface).

## Storage Model

- **Config**: `~/.job-agent/config.json` — `{ provider, apiKey, model }`.
  `model` is set during `init`/first-run (see Invariant 7) — not left
  implicit — but remains overridable per-run via `--model`. File
  permissions restricted to the owning user. This is the *only*
  persistent state the CLI keeps between runs.
- **Inputs**: read from wherever the user points `--jobs` / `--resume` /
  `--dream` — never copied or cached elsewhere.
- **Outputs**: written to `--out` (default `./output`) — the .xlsx report
  and one tailored-resume .md per surviving company. Nothing is written
  outside the specified output directory except the config file above.

## Auth and Access Model

- Single local user, no accounts, no multi-user concept.
- The provider API key is the only credential in the system. It is
  supplied once (first run or `job-agent init`), stored locally, and sent
  only in requests to that provider's own API endpoint — never logged,
  never sent anywhere else.

## Invariants

1. No LLM API call is ever made without a resolved, explicit provider +
   key. If none is configured, the CLI prompts before doing anything else
   — it never silently no-ops or falls back to a hardcoded default key.
2. `src/lib/providers/*.ts` are the only files that know a specific
   vendor's request/response shape (auth header format, endpoint,
   payload schema, structured-output mechanism). `src/lib/match/` and
   `src/lib/tailor/` call only the shared `LLMProvider` interface.
3. The tailoring prompt must never instruct or allow the model to invent
   experience, employers, dates, titles, or skills not already present in
   the parsed source resume. This is enforced in the prompt template
   itself, not left to model discretion.
4. Re-running `tailor` against the same job-scan file does not silently
   clobber a prior run's output — tailored resume filenames include the
   company/role, and the excel report filename includes a timestamp.
5. No network calls other than to the one configured LLM provider — no
   telemetry, no analytics, no third-party calls of any kind.
6. Adding a sixth provider means adding one new file under
   `src/lib/providers/` that implements `LLMProvider` — no changes to
   `src/lib/match/`, `src/lib/tailor/`, or `src/commands/`.
7. Model choice is explicit, not hardcoded: every adapter implements an
   optional `listModels(): Promise<string[]>` when the vendor exposes a
   models-list endpoint; `init` calls it right after the key is entered
   so the user picks from what's actually live today. When a vendor has
   no such endpoint, the adapter exposes a `defaultModel` constant used
   only as a pre-filled suggestion for free-text entry — never silently
   applied without the user seeing and confirming it.
