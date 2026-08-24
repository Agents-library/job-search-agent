# Progress Tracker

Update this file after every meaningful implementation change.

## Current Phase

- Not started. Spec + implementation plan only, written 2026-08-24.
  Anshul asked explicitly not to start building yet.

## Current Goal

- None yet — awaiting the go-ahead to start Step 1
  (`implementation-plan/step-1-project-scaffold.md`).

## Completed

- None yet.

## In Progress

- None yet.

## Next Up

- Step 1: project scaffold (see implementation-plan/).

## Open Questions

- Default output directory for `tailor` (proposed: `./output`) — confirm
  with Anshul or leave as the default and let him override with `--out`.
- Dream-company name matching: exact/normalized match only, or fuzzy
  matching (e.g. "Google" vs "Google LLC" vs "Google India")? Proposed in
  architecture: normalize + substring match; confirm this is good enough
  before Step 4.
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
