# AI Workflow Rules

## Approach

Build this project incrementally using a spec-driven workflow. This file,
`project-overview.md`, `architecture.md`, `code-standards.md`, and
`ui-context.md` define what to build and how. `implementation-plan/`
defines the build order, one step per file. Always implement against
these specs — do not infer or invent behavior from scratch. If something
needed isn't covered here, that's a gap to close in the relevant spec
file before writing code against it, not a judgment call to make silently
in the implementation.

## Scoping Rules

- Work on one implementation-plan step at a time, in order — a step's
  file states what it depends on.
- Prefer small, verifiable increments over large speculative changes.
- Do not combine unrelated system boundaries (see architecture.md) in a
  single implementation step — e.g. don't touch a provider adapter and
  the Excel writer in the same step.

## When to Split Work

Split an implementation step further if it combines:

- Provider-adapter changes and orchestration changes (`src/lib/match/` or
  `src/lib/tailor/`) in the same unit — adapters and their callers are
  separate concerns even when working on one provider end to end.
- CLI plumbing (flag parsing, output formatting) and business logic
  (parsing, scoring, tailoring) in the same unit.
- Behavior not clearly defined in project-overview.md or architecture.md
  — if you find yourself deciding matching-threshold logic or a prompt's
  wording on the fly, stop and resolve it in the spec first.

If a change cannot be verified end to end quickly, the scope is too
broad — split it.

## Handling Missing Requirements

- Do not invent product behavior not defined in the spec files — e.g.
  don't add a new output format, a new provider, or a different threshold
  default without it being written down first.
- If a requirement is ambiguous (e.g. exactly how fuzzy dream-company
  name matching should be), resolve it in the relevant spec file before
  implementing, or add it to `progress-tracker.md`'s Open Questions and
  confirm with Anshul before building against a guess.
- If a requirement is missing entirely, add it as an open question in
  `progress-tracker.md` before continuing.

## Protected Files

- `src/types.ts`'s `LLMProvider` interface — every adapter depends on it;
  changing its shape is a cross-cutting change, not something to do
  incidentally while working on one provider or one command.
- Once a provider adapter is verified working (its step's checklist is
  met), don't refactor its internals while working on an unrelated step.

## Keeping Docs in Sync

Update the relevant spec file whenever implementation changes:

- System architecture or boundaries → `architecture.md`
- Storage/config model decisions → `architecture.md`
- Code conventions → `code-standards.md`
- CLI output/interaction conventions → `ui-context.md`
- Feature scope → `project-overview.md`

## Before Moving to the Next Step

1. The current implementation-plan step's own verification checklist
   passes.
2. No invariant defined in `architecture.md` was violated.
3. `progress-tracker.md` reflects the completed step (move it from
   "Next Up"/"In Progress" to "Completed", update "Current Goal").
4. `npm run build` passes.
