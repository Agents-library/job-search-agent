# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Complete (2026-08-25). Nine implementation-plan steps are done. Post-plan UX:
  `profile` command + interactive `tailor` (2026-08-25).

## Current Goal

- None. Remaining work is usage and review (live LLM runs, hand-check
  tailored resumes), not further plan steps.

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
- Step 5: match scoring — `ScoredJob` in `src/types.ts`; fixed rubric in
  `src/lib/match/rubric.ts` (40% skills, 20% level, 20% responsibilities,
  20% keywords); `src/lib/match/run.ts` scores every job with bounded
  concurrency (default 3), `withRetry` on each call, incremental progress
  lines (`Scoring N/M  Company — Title … NN%`), per-job skip on failure;
  `isDreamCompany` computed in `run.ts` when a dream set is passed (Step 6
  filtering still applies the threshold). Adapters import `scoreMatchPrompt`
  from the rubric (placeholder scoring prompt removed). Shared terminal
  colors in `src/lib/term.ts`. Verified: `npm run build`; mock checks in
  `npx tsx scripts/verify-match.ts` (failure isolation, incremental
  progress, concurrency bound, dream flag). Live Gemini run against
  fixtures hit transient 503/rate-limit — re-run when the API is healthy for
  hand-check sanity.
- Step 6: filtering and Excel report — `DEFAULT_MATCH_THRESHOLD` (40) in
  `src/lib/match/filter.ts`; `filterJobs()` keeps dream companies regardless of
  score plus non-dream jobs at or above the threshold; `writeReport()` in
  `src/lib/excel/writeReport.ts` writes `match-report-<timestamp>.xlsx` (ms
  precision) to `--out` with spec columns, Match % descending sort, dream rows
  bold with a leading ★ on Company. Verified: `npm run build`;
  `npx tsx scripts/verify-filter-excel.ts`.
- Step 7: resume tailoring — shared no-fabrication prompt in
  `src/lib/tailor/prompt.ts` (Invariant 3; adapters import it the same way
  they import the scoring rubric); `src/lib/tailor/run.ts` tailors the
  filtered `ScoredJob[]` with bounded concurrency (default 3), `withRetry`,
  incremental `Tailoring N/M  Company — Title` lines, per-job skip on
  failure, and writes `<company-slug>-<role-slug>.md` under `--out` (job-id
  suffix only on in-batch collisions). Placeholder tailoring prompt removed.
  Verified: `npm run build`; mock checks in `npx tsx scripts/verify-tailor.ts`
  (prompt constraints, slug/collision filenames, failure isolation,
  incremental progress, concurrency bound). Live run skipped — no resolved
  config in that session; truthfulness hand-diff still needs a real key.
- Step 8: `tailor` command e2e — `src/commands/tailor.ts` wires Steps 2/4–7:
  required `--jobs`/`--resume`, optional `--dream`, `--out` (default
  `./output`), `--threshold` (40), `--concurrency` (3), `--dry-run`,
  `--verbose`, `--model`. Order: parse → score (skip on dry-run) → filter →
  Excel → tailor (skip on dry-run) → summary. `ensureConfigured` skipped for
  `--dry-run`; dry-run keeps dream companies only and prints
  `DRY RUN — no LLM calls were made.`; input failures fail fast with a
  clear message (stack only with `--verbose`). Verified: `npm run build`;
  `npx tsx scripts/verify-tailor-e2e.ts` (dry-run banner + dream keep list,
  distinct report filenames on re-run, missing `--jobs` message, threshold
  40 vs 90 via the same `filterJobs` the command uses). Full live run with
  real scoring/tailoring still needs a configured provider key.
- Step 9: packaging and docs — root `README.md`: `npm install && npm run
  build`, `npm link`, `init` walkthrough, `tailor` flags matching `--help`,
  40%/dream-company filter, no-fabrication as a prompt-level constraint
  (review before sending), and a five-provider section with key links plus
  `--model` / config `model` override of per-provider defaults. This
  tracker: Current Phase Complete, all steps Completed, open questions
  resolved or listed as known limitations. Verified: clean
  `node_modules`/`dist` reinstall + build; `job-agent` / `node dist/cli.js`
  `--help` matches the README; no leftover Next Up / In Progress.
- Post-plan UX: `job-agent profile` saves `~/.job-agent/profile.json`
  (resume, optional dream list, jobsDir, out, threshold). `tailor` uses
  profile defaults when flags are omitted; interactive mode lists recent
  job scans; `--jobs latest`; pre-flight confirm `[Y/n/dry-run]`; `-y` to
  skip. Verified: `npm run build`; `npx tsx scripts/verify-tailor-e2e.ts`.

## In Progress

- None.

## Next Up

- None. Implementation plan is finished.

## Open Questions

None remaining as build blockers. Carried forward as **known limitations**
(not unfinished plan items):

- **No-fabrication is prompt-only.** Tailored resumes must still be
  reviewed before sending. Not a formal guarantee.
- **Live end-to-end with a real key** was not required to close Steps
  7–8 in this environment. A full `job-agent tailor` (no `--dry-run`)
  still needs `job-agent init` or env-var config; Gemini scoring has
  previously hit transient 503/rate-limit.
- **Job aggregation (Adzuna/JSearch)** stays out of scope unless Anshul
  asks otherwise — see project-overview.md Out of Scope.
- **Dedup against `job-search-seen.md`** (Cowork-native scheduled-task
  path) is not shared with this CLI. The two stay fully separate.

Resolved during the build:

- ~~Default output directory for `tailor` (proposed: `./output`) — confirm
  with Anshul or leave as the default and let him override with `--out`.~~
  **Resolved 2026-08-25**: Step 8 ships `--out` defaulting to `./output`.
- ~~Dream-company name matching: normalize + exact match, then complete
  token containment in either direction (not raw substring).~~
  **Resolved 2026-08-25**: implemented in Step 4 (`isDreamCompany`).
  "Google" matches "Google India Private Limited";
  `isDreamCompany("Metasoft")` is false when the dream set contains
  "Meta".
- ~~Per-provider default model IDs will drift over time...~~ **Resolved
  2026-08-24**: model is a user choice made during `init`, fetched live
  from each provider's models-list endpoint where one exists (falls back
  to free-text with a suggested default otherwise). README documents that
  `--model` / config `model` override the adapter default. See
  architecture.md Invariant 7 and implementation-plan Steps 2–3.

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
- 2026-08-25: Step 5 implemented. Re-run mock + optional live checks with
  `npx tsx scripts/verify-match.ts` (set `JOB_AGENT_PROVIDER` /
  `JOB_AGENT_API_KEY` / `JOB_AGENT_MODEL` or use saved config for live
  scoring). Dream flag is set in `scoreJobs()` when `dreamCompanies` is
  passed; Step 6 owns threshold filtering.
- 2026-08-25: Step 6 implemented. Re-run checks with
  `npx tsx scripts/verify-filter-excel.ts`. Excel timestamp includes
  millisecond precision so rapid re-runs do not overwrite prior reports.
- 2026-08-25: Step 7 implemented. Re-run mock + optional live checks with
  `npx tsx scripts/verify-tailor.ts` (set `JOB_AGENT_PROVIDER` /
  `JOB_AGENT_API_KEY` / `JOB_AGENT_MODEL` or use saved config for live
  tailoring). The `tailor` CLI command is still a stub until Step 8.
- 2026-08-25: Step 8 implemented. Re-run offline checks with
  `npx tsx scripts/verify-tailor-e2e.ts`. Live end-to-end
  (`job-agent tailor --jobs … --resume … --dream …` without `--dry-run`)
  still needs `job-agent init` or env-var config in this environment.
- 2026-08-25: Step 4 dream matching was later tightened to complete
  token containment (not raw substring); the earlier session note about
  Meta ⊆ Metasoft is historical. Current behavior is documented in the
  README and marked resolved above.
- 2026-08-25: Step 9 implemented. Root `README.md` plus this tracker
  marked Complete. Verification: delete `node_modules`/`dist`,
  `npm install && npm run build`, confirm `node dist/cli.js --help` and
  `tailor --help` match the README with no extra undocumented steps.
