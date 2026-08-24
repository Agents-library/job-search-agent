# Step 4 — Parsers

## Depends on

Step 1 (folder structure/types only — does not depend on Steps 2/3, can
be built in parallel with those if useful).

## Covers

- `src/types.ts`: `JobListing` (`jobId`, `title`, `company`, `location`,
  `postedAt?`, `employmentType?`, `applicants?`, `url`, `description`).
- `src/lib/parsers/parseJobs.ts` — parses the Chrome extension's job-scan
  Markdown format (`## <title>` per listing, `- **Field:** value` lines,
  a `**Description:**` block) into `JobListing[]`. Must handle a listing
  missing optional fields gracefully.
- `src/lib/parsers/parseResume.ts` — `.md`/`.txt` read directly as text;
  `.docx` converted to text via `mammoth`. Returns plain text either way.
- `src/lib/parsers/parseDreamCompanies.ts` — accepts `.md`/`.txt` (one
  company per line, optional leading `-`/`*` bullet stripped),
  `.csv` (first column), or `.xlsx` (first column of the first sheet,
  header row skipped if it looks like a header). Returns a normalized
  `Set<string>` — lowercase, trimmed, common suffixes (`Inc`, `Inc.`,
  `LLC`, `Ltd`, `Pvt Ltd`, `Private Limited`) stripped, per
  `progress-tracker.md`'s open question on fuzzy matching.
- A `isDreamCompany(company: string, dreamSet: Set<string>): boolean`
  helper using the same normalization plus substring containment in both
  directions (e.g. "Google" matches "Google India Pvt Ltd").

## Does not cover

- Anything provider/LLM-related.
- Excel writing (that's Step 6, and it's a separate concern from parsing
  the dream-companies *input* file here).

## Verification

- [ ] Fixture job-scan .md file (a real or representative output from
      the Chrome extension) parses into the expected number of
      `JobListing` objects with all fields correct.
- [ ] A malformed/partial listing (missing an optional field) doesn't
      crash the parser — it just omits that field.
- [ ] A sample `.md` resume and a sample `.docx` resume both produce
      sensible, non-garbled plain text.
- [ ] Dream-companies fixtures in all three supported formats (`.md`,
      `.csv`, `.xlsx`) all produce the same normalized set for the same
      underlying company names.
- [ ] `isDreamCompany` correctly matches known variants (e.g. "Google"
      vs "Google India Private Limited") and correctly does NOT match
      unrelated companies with a shared substring — check for
      false-positive risk here since substring matching can over-match
      (e.g. "Meta" vs "Metasoft") and note in progress-tracker.md if the
      heuristic needs tightening.
