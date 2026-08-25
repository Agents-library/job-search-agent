import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JobListing, LLMProvider, ScoredJob } from "../../types";
import { withRetry } from "../providers/retry";
import { status, warn } from "../term";

/** Default max concurrent `tailorResume` calls. Overridable by callers (CLI `--concurrency` in Step 8). */
export const DEFAULT_TAILOR_CONCURRENCY = 3;

export interface TailorJobsOptions {
  provider: LLMProvider;
  resume: string;
  jobs: ScoredJob[];
  outDir: string;
  concurrency?: number;
}

export interface TailoredResumeFile {
  job: ScoredJob;
  filePath: string;
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

export function slugify(value: string): string {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : "untitled";
}

/**
 * Stable filename: `<company-slug>-<role-slug>.md`.
 * If that name is already taken in this batch, append `-<job-id-slug>`.
 */
export function tailoredResumeFilename(
  company: string,
  title: string,
  used?: Set<string>,
  jobId?: string,
): string {
  const base = `${slugify(company)}-${slugify(title)}.md`;
  if (!used) {
    return base;
  }
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  const extra = slugify(jobId && jobId.length > 0 ? jobId : "dup");
  let candidate = `${slugify(company)}-${slugify(title)}-${extra}.md`;
  let n = 2;
  while (used.has(candidate)) {
    candidate = `${slugify(company)}-${slugify(title)}-${extra}-${n}.md`;
    n += 1;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Tailors the resume for each surviving scored job. Failures are logged
 * and skipped; they do not abort the batch. Progress prints as each call
 * finishes. Writes Markdown under `outDir`.
 */
export async function tailorJobs(
  options: TailorJobsOptions,
): Promise<TailoredResumeFile[]> {
  const { provider, resume, jobs, outDir } = options;
  const concurrency = Math.max(
    1,
    options.concurrency ?? DEFAULT_TAILOR_CONCURRENCY,
  );
  const total = jobs.length;
  const slots: Array<TailoredResumeFile | undefined> = Array.from({
    length: total,
  });
  const usedNames = new Set<string>();
  const filenames = jobs.map((row) =>
    tailoredResumeFilename(
      row.job.company,
      row.job.title,
      usedNames,
      row.job.jobId,
    ),
  );

  await mkdir(outDir, { recursive: true });

  let nextIndex = 0;
  let finished = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= total) {
        return;
      }
      const row = jobs[index]!;
      const { job } = row;
      try {
        const markdown = await withRetry(() =>
          provider.tailorResume(resume, formatJobListing(job)),
        );
        const filePath = path.join(outDir, filenames[index]!);
        await writeFile(filePath, markdown, "utf8");
        slots[index] = { job: row, filePath };
        finished += 1;
        status(`Tailoring ${finished}/${total}  ${job.company} — ${job.title}`);
      } catch (err) {
        finished += 1;
        warn(
          `Skipped ${finished}/${total}  ${job.company} — ${job.title} — ${reasonFromError(err)}`,
        );
      }
    }
  }

  const workerCount = Math.min(concurrency, Math.max(total, 0));
  if (workerCount > 0) {
    await Promise.all(Array.from({ length: workerCount }, () => worker()));
  }
  return slots.filter((item): item is TailoredResumeFile => item !== undefined);
}
