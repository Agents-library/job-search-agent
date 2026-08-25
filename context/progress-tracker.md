# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Step 4 (parsers) complete, 2026-08-25. Ready for Step 5
  (`implementation-plan/step-5-match-scoring.md`).

## Current Goal

- Step 5: match scoring (`implementation-plan/step-5-match-scoring.md`).

## Completed

- Step 1: project scaffold — `package.json` (`job-agent`, bin, `build`/
  `dev` scripts, commander/exceljs/mammoth + typescript/@types/node/tsx),
  strict `tsconfig.json`, folder layout per architecture.md, Commander
  entrypoint with stub `init`/`config`/`tailor` (each prints "not
  implemented yet"; `--help` documents intended flags). Verified:
  `npm install`, `npm run build` (zero TS errors), `node dist/cli.js
  --help` lists all three commands, stubs run without crashing.
- Step 2: config and `init` — `JobAgentConfig` / `ProviderName` in
  `src/types.ts`; `src/lib/config.ts` reads/writes `~/.job-agent/config.json`
  (chmod 0700/0600 best-effort on Windows) and `resolveConfig()` prefers
  `JOB_AGENT_PROVIDER` / `JOB_AGENT_API_KEY` / `JOB_AGENT_MODEL`;
  interactive `init` (provider, masked key, model list or free-text
  fallback, `--model` skip, overwrite confirm + keep-key shortcut);
  read-only `config`; `ensureConfigured()` on `tailor` (still a stub
  afterwards). Stub adapter in `src/lib/providers/` until Step 3.
- Step 3: `LLMProvider` (`scoreMatch`, `tailorResume`, optional
  `listModels`, `defaultModel`, `ping`) plus `MatchResult` in
  `src/types.ts`. Shared retry/backoff in `src/lib/providers/retry.ts`.
  Five adapters (`claude`, `openai`, `grok`, `gemini`, `openrouter`)
  hide vendor request/response shape; `src/lib/providers/index.ts` is
  the only `ProviderName` switch. `init` type-to-filter for large model
  lists (OpenRouter). Verified: `npm run build`; Gemini live `ping` /
  `listModels` / placeholder `scoreMatch`+`tailorResume`; invalid keys
  yield provider-labeled errors with the key redacted; `listModels`
  failure still falls back to `defaultModel` free-text in `init`.
- Step 4: parsers — `JobListing` in `src/types.ts`; `parseJobs` (Chrome
  extension `## title` / `- **Field:**` / `**Description:**` block);
  `parseResume` (`.md`/`.txt` as text, `.docx` via mammoth);
  `parseDreamCompanies` (`.md`/`.txt` one-per-line with optional `-`/`*`
  bullets, `.csv` first column, `.xlsx` first column of first sheet with
  header skip); `isDreamCompany` uses the same normalization (lowercase,
  trim, strip Inc/Inc./LLC/Ltd/Pvt Ltd/Private Limited) plus complete
  token containment in either direction (not substring). Verified via
  `npx tsx scripts/verify-parsers.ts` and `npm run build`.

## In Progress

- None yet.

## Next Up

- Step 5: match scoring (see implementation-plan/).

## Open Questions

- Default output directory for `tailor` (proposed: `./output`) — confirm
  with Anshul or leave as the default and let him override with `--out`.
- Dream-company name matching: normalize + exact match, then complete
  token containment in either direction (not raw substring). "Google"
  matches "Google India Private Limited"; `isDreamCompany("Metasoft")`
  is false when the dream set contains "Meta".
- ~~Per-provider default model IDs will drift over time...~~ **Resolved
  2026-08-24**: model is a user choice made during `init`, fetched live
  from each provider's models-list endpoint where one exists (falls back
  to free-text with a suggested default otherwise). See architecture.md
  Invariant 7 and implementation-plan Steps 2–3.
- Whether this CLI should eventually also absorb the earlier
  Adzuna/JSearch job-aggregation idea from the shelved web-app spec, or
  stay scoped to matching/tailoring only (current assumption: stay
  scoped — see project-overview.md's Out of Scope).
- Whether dedup against `job-search-seen.md` (used by the Cowork-native
  scheduled-task path) should ever be shared with this CLI's output, or
  whether the two stay fully separate. Currently assumed fully separate.

## Architecture Decisions

- **Multi-provider LLM support, adapter pattern** (2026-08-24) — Anshul
  wants to use whichever API key he already has (Claude, OpenAI, Grok,
  Gemini, or OpenRouter), not be locked into one vendor. Chose a shared
  `LLMProvider` interface with one adapter file per vendor so adding/
  changing a provider never touches orchestration code.
- **Local-only, no server, no database** (2026-08-24) — this is a
  single-user tool run from Anshul's own terminal; a config file plus
  plain output files (.xlsx, .md) is sufficient state.
- **CLI is separate from the Chrome extension** (2026-08-24) — the
  extension only produces a Markdown file; this CLI only ever consumes
  one. No shared process, no shared code, no IPC.
- **Truthfulness constraint on tailoring is architectural, not just a
  prompt nicety** (2026-08-24) — the no-fabrication rule is called out as
  an invariant in architecture.md, not left as an implicit assumption,
  because a resume that invents qualifications is a real-world harm to
  Anshul (misrepresentation to an employer), not just a quality bug.
- **A read-only `config` command exists separately from `init`**
  (2026-08-24) — Anshul asked whether provider/model could be changed
  after setup; `init` already covered that, but checking the *current*
  setup shouldn't require running the full reconfigure flow. `config`
  reads and prints, never writes, never prompts.
- **Model selection is a user-facing step, not a hardcoded default**
  (2026-08-24) — Anshul asked to be able to choose the model within
  whichever provider he picks, not just the provider. Rather than
  maintaining a static "current models" list per vendor in the spec
  (which would go stale), `init` fetches the live list from each
  provider's own API using the key just entered, and only falls back to
  free-text entry for vendors without a models-list endpoint.

## Session Notes

- This spec follows on from two things already built in earlier sessions
  in this project: (1) the LinkedIn Job Scraper Chrome extension
  (delivered as a .zip, fully autonomous scraping — see
  `agent-spec-index.md` for that decision's history), which is this
  CLI's upstream input; (2) an earlier abandoned attempt in *this* session
  to build the matching/tailoring logic as a Claude Skill instead of a
  CLI — Anshul redirected to "API based cli rather than using it in
  Claude" partway through, before any Skill was actually delivered.
- A separate false start also happened in this session: before this spec
  was requested, a partial Anthropic-only (single-provider) TypeScript
  CLI scaffold was begun directly in code. Anshul then asked to stop
  coding and write specs instead, and to support multiple providers, not
  just Anthropic. That code was not delivered and should be treated as
  discarded — Step 1 of the implementation plan starts clean, not from
  that scaffold.
- After the initial spec was delivered, Anshul asked for one refinement:
  per-provider model choice, not just provider choice. Folded into the
  spec the same session rather than as a separate follow-up round —
  see the Architecture Decisions entry above and Steps 2/3.
- 2026-08-25: Anshul gave the go-ahead to implement Step 1. Scaffold is
  in place; `init`/`config`/`tailor` remain stubs until later steps.
- 2026-08-25: Step 2 implemented. `tailor` still has no pipeline — it
  only runs the first-run prompt (or env-var bypass) then prints "not
  implemented yet". Real adapters replace the Step 2 stub in Step 3.
- 2026-08-25: Step 3 implemented. Placeholder prompts only — real
  scoring/tailoring prompts are Steps 5 and 7. Live `ping` verified on
  Gemini (`GEMINI_API_KEY`); Claude/OpenAI/Grok/OpenRouter need a real
  key for a live `ping` but invalid-key errors are labeled and do not
  print the key. Gemini's suggested default is `gemini-flash-latest`
  (the previous `gemini-2.0-flash` id is no longer served).
- 2026-08-25: Step 4 implemented. Fixtures under `fixtures/parsers/`;
  re-run checks with `npx tsx scripts/verify-parsers.ts`. Dream-company
  substring matching is known to over-match (Meta ⊆ Metasoft) — left as
  an open question rather than silently tightening beyond the spec.
