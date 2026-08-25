# Step 7 — Resume Tailoring

## Depends on

Step 3 (provider adapters) and Step 6 (the filtered job list this step
runs against).

## Covers

- `src/lib/tailor/prompt.ts` — the shared tailoring prompt template,
  used by every provider adapter's `tailorResume()`. Must explicitly
  instruct: reorder, rephrase, and emphasize truthful content from the
  source resume to match the job description's language and priorities;
  never invent or imply an employer, title, date range, skill, tool, or
  achievement not already present in the source text. This is
  `architecture.md` Invariant 3 — treat it as non-negotiable, not a
  stylistic preference.
- `src/lib/tailor/run.ts` — takes the resume text + the filtered
  `ScoredJob[]` from Step 6, calls `provider.tailorResume()` per
  surviving job (same bounded-concurrency + retry approach as Step 5),
  and writes each result to its own Markdown file.
- Filename scheme: `<company-slug>-<role-slug>.md` under `--out`
  (e.g. `acme-corp-backend-engineer.md`) — stable and collision-resistant
  across companies with the same role title.
- Progress reporting per `ui-context.md`
  (`Tailoring N/M  Company — Title`).
- Per-job failure handling identical in spirit to Step 5 — one failure
  doesn't abort the batch.

## Does not cover

- Any change to the matching/scoring logic — this step only consumes
  Step 6's already-filtered list.
- The `tailor` command's flags (Step 8).

## Verification

- [ ] Against 2–3 fixture jobs from the filtered set, with a real
      provider key: each produces a distinct, readable Markdown resume.
      (Mock + filename/progress/failure checks pass in
      `scripts/verify-tailor.ts`. Live tailoring skipped on 2026-08-25 —
      no resolved config in the verification environment. Re-run with
      `JOB_AGENT_PROVIDER` / `JOB_AGENT_API_KEY` / `JOB_AGENT_MODEL` or
      saved `init` config.)
- [ ] Manually diff at least one tailored resume against the source
      resume — every claim in the tailored version must trace back to
      something present in the source. Flag and fix any invented detail
      immediately; this check is not optional.
      (Blocked on a successful live run; use
      `npx tsx scripts/verify-tailor.ts` with a configured key.)
- [x] Filenames are collision-free and correctly slugified even for
      companies/titles with spaces, punctuation, or unusual casing.
- [x] A simulated failure on one job's tailoring call doesn't abort the
      rest of the batch.
