# AGENTS.md

Instructions for any AI coding agent working in this repository.

## Project Context

This repo builds **job-agent** — a TypeScript CLI that scores scraped
job listings against a resume, writes an Excel match report, and
generates per-company tailored Markdown resumes. It runs locally, talks
to one configured LLM provider, and never scrapes job boards itself.

Full specs live in `context/`:

- `context/README.md` — implementation-plan index (build order)
- `context/project-overview.md` — what this tool does and why
- `context/architecture.md` — stack, system boundaries,
  invariants
- `context/code-standards.md` — language and module conventions
- `context/ai-workflow-rules.md` — spec-driven workflow rules
- `context/ui-context.md` — CLI output/terminal conventions
- `context/progress-tracker.md` — current state, open questions
- `context/implementation-plan/` — ordered build steps (one
  file per step)

Always implement against these specs. Do not infer or invent CLI
behavior, scoring/filter rules, prompts, or output format from scratch
— if it's not defined in `context/`, treat it as an open question
(see `ai-workflow-rules.md`).

Work one implementation-plan step at a time, in order. Do not start
building until Anshul has given the go-ahead (see
`progress-tracker.md`).

## Commands

- `npm install` — install dependencies
- `npm run build` — compile TypeScript, must pass before a unit
  is considered done
- `npm run dev` — run the CLI locally without a global install
- `job-agent init` — (re)configure provider, API key, and model
- `job-agent config` — read-only view of the current setup
  (never prints the API key)
- `job-agent profile` — save default resume, dream list, jobs folder, and
  output paths for `tailor`
- `job-agent tailor --jobs <path> --resume <path> --dream <path>`
  — score, filter, write Excel + tailored resumes (flags optional when a
  profile is set; run `job-agent tailor` interactively to pick the latest scan)

## Behavioral Guidelines

Behavioral guidelines to reduce common LLM coding mistakes.
Merge with project-specific instructions above as needed.

Tradeoff: these guidelines bias toward caution over speed. For
trivial tasks, use judgment.

### 1. Think Before Coding

Don't assume. Don't hide confusion. Surface tradeoffs.

Before implementing:

- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick
  silently.
- If a simpler approach exists, say so. Push back when
  warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

Minimum code that solves the problem. Nothing speculative.

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is
overcomplicated?" If yes, simplify.

### 3. Surgical Changes

Touch only what you must. Clean up only your own mess.

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete
  it.

When your changes create orphans:

- Remove imports/variables/functions that YOUR changes made
  unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line should trace directly to the
user's request.

### 4. Goal-Driven Execution

Define success criteria. Loop until verified.

Transform tasks into verifiable goals:

- "Add validation" → "Write tests for invalid inputs, then make
  them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it
  pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:

```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak
criteria ("make it work") require constant clarification.

These guidelines are working if: fewer unnecessary changes in
diffs, fewer rewrites due to overcomplication, and clarifying
questions come before implementation rather than after mistakes.
