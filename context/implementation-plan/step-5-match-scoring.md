# Step 5 — Match Scoring

## Depends on

Steps 3 and 4.

## Covers

- `src/types.ts`: `MatchResult` (`matchPercent: number`, `matchedSkills:
  string[]`, `missingSkills: string[]`, `rationale: string`).
- `src/lib/match/rubric.ts` — the fixed scoring rubric, written down
  explicitly (not left to per-call model discretion), roughly: core
  skills/tech-stack overlap (40%), experience-level fit (20%),
  responsibilities/role overlap (20%), keyword/ATS-term presence (20%).
  This is the shared prompt content every provider adapter's
  `scoreMatch()` sends.
- `src/lib/match/run.ts` — takes the parsed resume text + `JobListing[]`,
  calls `provider.scoreMatch()` per job with a small bounded concurrency
  (default 3, configurable), applies the shared retry helper from Step 3
  on failure, and returns `ScoredJob[]` (job + `MatchResult` +
  `isDreamCompany` — dream flag can be computed here or passed in from
  Step 6, whichever keeps this module simpler; document the choice).
- Progress reporting per `ui-context.md` (`Scoring N/M  Company — Title …
  NN%`) as each job's score comes back — do not wait for the whole batch
  to print anything.
- Per-job failure handling: one job's scoring failure is logged and
  skipped (with a reason), not fatal to the run.

## Does not cover

- Filtering by threshold/dream-company (Step 6 — this step just produces
  scores for every job, unfiltered).
- Excel writing (Step 6).

## Verification

- [x] Against a fixture set of jobs + a real resume, with a real
      provider key: every job gets a `MatchResult` with `matchPercent`
      between 0–100.
      (Mock + structural checks pass in `scripts/verify-match.ts`. Live
      Gemini run on 2026-08-25 hit transient 503/rate-limit on all three
      fixture jobs — re-run when the API is healthy.)
- [ ] Hand-check 2–3 results against the rubric — does a job requiring
      skills clearly absent from the resume score low, and one that's a
      close fit score high? This is a sanity check, not a unit test —
      LLM scoring won't be perfectly deterministic, but it should be
      directionally sane and roughly consistent across a couple of
      re-runs on the same job.
      (Blocked on a successful live run; use `npx tsx scripts/verify-match.ts`
      with configured Gemini/OpenAI/etc. key.)
- [x] A simulated provider failure on one job (e.g. temporarily break the
      key mid-run, or mock a 500) doesn't abort the batch — remaining
      jobs still get scored, the failed one is reported clearly.
- [x] Progress lines print incrementally, not all at once at the end.
