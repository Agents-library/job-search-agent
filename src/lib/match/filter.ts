import type { ScoredJob } from "../../types";
import { isDreamCompany } from "../parsers/parseDreamCompanies";

/** Default match-percent threshold for non-dream jobs. Overridable via `--threshold` in Step 8. */
export const DEFAULT_MATCH_THRESHOLD = 40;

/**
 * Returns jobs to keep: every dream-company listing (regardless of score) plus
 * every non-dream job at or above the threshold.
 */
export function filterJobs(
  jobs: ScoredJob[],
  dreamCompanies: Set<string>,
  threshold = DEFAULT_MATCH_THRESHOLD,
): ScoredJob[] {
  return jobs.filter((row) => {
    const dream =
      row.isDreamCompany || isDreamCompany(row.job.company, dreamCompanies);
    return dream || row.match.matchPercent >= threshold;
  });
}
