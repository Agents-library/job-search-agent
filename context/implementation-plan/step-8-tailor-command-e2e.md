# Step 8 — `tailor` Command End-to-End

## Depends on

Steps 2, 4, 5, 6, 7 — this step wires all of them together behind the
real `job-agent tailor` CLI command; it adds no new business logic of
its own.

## Covers

- `src/commands/tailor.ts` replacing the Step 1 stub:
  - Flags: `--jobs <path>` (required), `--resume <path>` (required),
    `--dream <path>` (optional — if omitted, no dream-company override
    applies), `--out <dir>` (default `./output`), `--threshold <n>`
    (default 40), `--concurrency <n>` (default 3), `--dry-run`
    (skip all LLM calls), `--verbose` (show stack traces on error).
  - Calls the Step 2 `ensureConfigured` helper first (unless `--dry-run`,
    which needs no provider at all).
  - Orchestration order: parse inputs (Step 4) → score (Step 5, skipped
    entirely in `--dry-run`) → filter (Step 6) → write Excel (Step 6) →
    tailor surviving jobs (Step 7, skipped in `--dry-run`) → print the
    final summary block per `ui-context.md`.
  - `--dry-run` output makes clear no LLM calls were made and shows what
    *would* have been kept under the current filter, using placeholder
    scores or by simply listing dream-company matches plus a note that
    non-dream scoring requires a real run.
  - Input-file errors (missing/unparseable `--jobs`/`--resume`/`--dream`)
    fail fast with a specific, actionable message before any LLM call is
    attempted.

## Does not cover

- Any new parsing, scoring, filtering, or tailoring logic — if this step
  finds a gap in one of those, fix it in the owning step's module, don't
  patch around it here.

## Verification

- [ ] Full real run: `job-agent tailor --jobs <fixture> --resume
      <fixture> --dream <fixture>` produces the .xlsx and one tailored
      .md per surviving job in `--out`, with correct console progress
      and a correct final summary (counts match the .xlsx row count).
- [ ] `--dry-run` makes zero network calls (verify via a proxy/log or by
      temporarily using an invalid key and confirming it still
      completes) and clearly labels its output as a dry run.
- [ ] Missing/bad `--jobs` path fails immediately with a clear message,
      not a stack trace (unless `--verbose`).
- [ ] Re-running against the same inputs produces new, distinctly-named
      output files rather than silently overwriting the previous run.
- [ ] `--threshold` and `--concurrency` overrides are honored (spot-check
      by setting `--threshold 90` and confirming far fewer jobs survive).
