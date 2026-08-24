# Code Standards

## General

- Keep modules small and single-purpose — a parser parses, an adapter
  talks to one vendor's API, a command orchestrates and formats output.
- Fix root causes; do not layer workarounds around a provider quirk or a
  parsing edge case — fix the adapter/parser itself.
- Do not mix unrelated concerns in one file: parsing, LLM calls, and
  output writing each stay in their own layer (see architecture.md's
  System Boundaries).

## TypeScript

- Strict mode required throughout (`"strict": true` in tsconfig).
- Avoid `any` — every provider response gets parsed into an explicit
  interface before use; unknown shapes are validated, not cast.
- Validate unknown external input at system boundaries before trusting
  it: parsed file contents, and every LLM API response, are the two
  boundaries that must never be trusted as-typed without a runtime check.

## CLI (Commander)

- One command per file under `src/commands/`.
- Commands only parse flags, call into `src/lib/`, and format
  success/error output — no parsing, scoring, or file-writing logic
  inline in a command file.
- Every flag is documented so `--help` is self-sufficient; no flag
  requires reading the source to understand.

## Provider Adapters

- All five adapters (`claude`, `openai`, `grok`, `gemini`, `openrouter`)
  implement the same `LLMProvider` interface defined in `src/types.ts`.
- An adapter owns everything vendor-specific: auth header shape, request
  payload, endpoint URL, default model, and how it extracts a structured
  result (tool-call / JSON mode / plain-text parsing) from that vendor's
  response format.
- No file outside `src/lib/providers/` imports a vendor SDK or constructs
  a vendor-specific request.
- Retries/backoff for rate limits and transient errors are implemented
  once in a shared helper (`src/lib/providers/retry.ts`) that every
  adapter uses, not duplicated per adapter.

## Prompts

- The no-fabrication rule for resume tailoring lives in one shared prompt
  template (`src/lib/tailor/prompt.ts`), not duplicated per provider —
  every adapter receives the same instructions.
- Prompt templates are plain exported strings/functions, kept separate
  from the orchestration code that calls them, so they can be reviewed
  and edited without touching control flow.

## Data and Storage

- The only thing written to `~/.job-agent/` is `config.json` (provider +
  key). Nothing else belongs there.
- Generated output (.xlsx, tailored .md files) always goes to the
  user-specified `--out` directory — never to the config directory, never
  next to the source files unless `--out` explicitly points there.
- Large text (job descriptions, resume text, tailored resume content)
  stays in plain files — never embedded into the config file.

## File Organization

- `src/commands/` — CLI entry points (`init.ts`, `tailor.ts`)
- `src/lib/providers/` — one adapter per LLM vendor + shared interface/retry helper
- `src/lib/parsers/` — job-scan / resume / dream-companies parsing
- `src/lib/match/` — scoring orchestration + rubric + filtering
- `src/lib/tailor/` — tailoring orchestration + prompt template
- `src/lib/excel/` — .xlsx report writer
- `src/lib/config.ts` — config read/write/resolve
- `src/types.ts` — shared types and the `LLMProvider` interface
