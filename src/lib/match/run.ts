import type { JobListing, LLMProvider, ScoredJob } from "../../types";
import { isDreamCompany } from "../parsers/parseDreamCompanies";
import { withRetry } from "../providers/retry";
import { status, warn } from "../term";

/** Default max concurrent `scoreMatch` calls. Overridable by callers (CLI `--concurrency` in Step 8). */
export const DEFAULT_SCORE_CONCURRENCY = 3;

export interface ScoreJobsOptions {
  provider: LLMProvider;
  resume: string;
  jobs: JobListing[];
  concurrency?: number;
  /**
   * Dream-company set from Step 4. `isDreamCompany` is computed here so
   * `ScoredJob` is complete for Step 6. Omit (or pass an empty set) to
   * leave every flag false — filtering still happens in Step 6.
   */
  dreamCompanies?: Set<string>;
}

function formatJobListing(job: JobListing): string {
  const lines = [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    `Location: ${job.location}`,
  ];
  if (job.postedAt) lines.push(`Posted: ${job.postedAt}`);
  if (job.employmentType) lines.push(`Employment type: ${job.employmentType}`);
  if (job.applicants) lines.push(`Applicants: ${job.applicants}`);
  if (job.url) lines.push(`URL: ${job.url}`);
  lines.push("", "Description:", job.description);
  return lines.join("\n");
}

function reasonFromError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Scores every job against the resume. Failures are logged and skipped;
 * they do not abort the batch. Progress prints as each call finishes.
 */
export async function scoreJobs(
  options: ScoreJobsOptions,
): Promise<ScoredJob[]> {
  const { provider, resume, jobs, dreamCompanies } = options;
  const concurrency = Math.max(
    1,
    options.concurrency ?? DEFAULT_SCORE_CONCURRENCY,
  );
  const total = jobs.length;
  const slots: Array<ScoredJob | undefined> = Array.from({ length: total });
  let nextIndex = 0;
  let finished = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= total) {
        return;
      }
      const job = jobs[index]!;
      try {
        const match = await withRetry(() =>
          provider.scoreMatch(resume, formatJobListing(job)),
        );
        const scored: ScoredJob = {
          job,
          match,
          isDreamCompany: dreamCompanies
            ? isDreamCompany(job.company, dreamCompanies)
            : false,
        };
        slots[index] = scored;
        finished += 1;
        status(
          `Scoring ${finished}/${total}  ${job.company} — ${job.title} … ${Math.round(match.matchPercent)}%`,
        );
      } catch (err) {
        finished += 1;
        warn(
          `Skipped ${finished}/${total}  ${job.company} — ${job.title} — ${reasonFromError(err)}`,
        );
      }
    }
  }

  const workerCount = Math.min(concurrency, total);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return slots.filter((item): item is ScoredJob => item !== undefined);
}
