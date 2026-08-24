# Implementation Plan — Index

Nine steps, each its own file, meant to be done in order. Each step file
has: what it covers, what it depends on, what it explicitly does not
cover (so scope doesn't creep into the next step), and a verification
checklist to run before moving on — per `ai-workflow-rules.md`.

1. [step-1-project-scaffold.md](./step-1-project-scaffold.md) — repo, deps, CLI entrypoint that does nothing yet
2. [step-2-config-and-init.md](./step-2-config-and-init.md) — provider selection, API key entry/storage, first-run auto-prompt
3. [step-3-provider-adapters.md](./step-3-provider-adapters.md) — the `LLMProvider` interface + all five vendor adapters
4. [step-4-parsers.md](./step-4-parsers.md) — job-scan md / resume / dream-companies parsing
5. [step-5-match-scoring.md](./step-5-match-scoring.md) — rubric, scoring prompt, concurrency-limited scoring run
6. [step-6-filtering-and-excel.md](./step-6-filtering-and-excel.md) — dream-company override, 40% threshold, .xlsx writer
7. [step-7-resume-tailoring.md](./step-7-resume-tailoring.md) — tailoring prompt (no-fabrication), per-company .md output
8. [step-8-tailor-command-e2e.md](./step-8-tailor-command-e2e.md) — wire it all into `job-agent tailor`, flags, error handling
9. [step-9-packaging-and-docs.md](./step-9-packaging-and-docs.md) — README, global install, final progress-tracker update

After finishing a step: run its verification checklist, update
`../progress-tracker.md`, confirm `npm run build` passes, then move on.
