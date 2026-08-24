# Step 6 — Filtering & Excel Report

## Depends on

Step 5 (needs `ScoredJob[]`) and Step 4 (needs the dream-companies set).

## Covers

- `src/lib/match/filter.ts` — takes `ScoredJob[]` + the dream-companies
  set, returns the subset to keep: `isDreamCompany === true` OR
  `matchPercent >= 40`. The 40% threshold is a named constant
  (`DEFAULT_MATCH_THRESHOLD`), overridable via a `--threshold` flag wired
  in Step 8 — not hardcoded inline where it's used.
- `src/lib/excel/writeReport.ts` — builds the .xlsx via `exceljs`:
  columns Company, Title, Location, Match %, Dream Company (Y/N),
  Matched Skills, Missing Skills, Rationale, Posted, URL, Job ID. Sorted
  by Match % descending, dream companies visually distinguishable
  (e.g. bold row or a leading star) even though they're not necessarily
  top-sorted.
- Output filename includes a timestamp (per `architecture.md` Invariant
  4), e.g. `match-report-<timestamp>.xlsx`, written to `--out`.

## Does not cover

- Resume tailoring (Step 7) — this step's output is the report only.
- The `tailor` command's flag wiring (Step 8) — build and verify this
  against a fixture `ScoredJob[]` directly, not via the full CLI yet.

## Verification

- [ ] Given a fixture `ScoredJob[]` with a mix of high/low scores and a
      couple of dream-company entries scored below 40%: the filtered set
      contains every dream company regardless of score, and every
      non-dream job scored ≥40%, and nothing else.
- [ ] The generated .xlsx opens cleanly (Excel/Google Sheets/LibreOffice)
      with correct columns, correct row count, and dream companies
      visually marked.
- [ ] Running the writer twice produces two distinctly-named files, not
      an overwrite.
- [ ] Sorting is correct (descending by Match %) with dream companies
      still visually flagged wherever they fall in that order.
