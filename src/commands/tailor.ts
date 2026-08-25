import { Command } from "commander";
import { ensureConfigured } from "../lib/ensureConfigured";
import { writeReport } from "../lib/excel/writeReport";
import { DEFAULT_MATCH_THRESHOLD, filterJobs } from "../lib/match/filter";
import { DEFAULT_SCORE_CONCURRENCY, scoreJobs } from "../lib/match/run";
import {
  isDreamCompany,
  parseDreamCompanies,
} from "../lib/parsers/parseDreamCompanies";
import { parseJobs } from "../lib/parsers/parseJobs";
import { parseResume } from "../lib/parsers/parseResume";
import { getProvider } from "../lib/providers";
import {
  confirmTailorRun,
  resolveTailorInputs,
} from "../lib/tailorInputs";
import { tailorJobs } from "../lib/tailor/run";
import { error, success, warn } from "../lib/term";
import type { JobListing, MatchResult, ScoredJob } from "../types";

interface TailorOptions {
  jobs?: string;
  resume?: string;
  dream?: string;
  out?: string;
  threshold?: string;
  concurrency: string;
  dryRun?: boolean;
  yes?: boolean;
  verbose?: boolean;
  model?: string;
}

const DRY_RUN_MATCH: MatchResult = {
  matchPercent: 0,
  matchedSkills: [],
  missingSkills: [],
  rationale: "DRY RUN — scoring skipped",
};

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "ENOENT"
  );
}

function reasonFromError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function parseConcurrency(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(
      `Invalid --concurrency: expected a positive integer, got "${raw}"`,
    );
  }
  return n;
}

async function loadJobs(filePath: string): Promise<JobListing[]> {
  try {
    return await parseJobs(filePath);
  } catch (err) {
    if (isEnoent(err)) {
      throw new Error(`Jobs file not found: ${filePath}`);
    }
    throw new Error(
      `Could not parse jobs file (${filePath}): ${reasonFromError(err)}`,
    );
  }
}

async function loadResume(filePath: string): Promise<string> {
  try {
    const text = await parseResume(filePath);
    if (!text) {
      throw new Error(`Resume file is empty: ${filePath}`);
    }
    return text;
  } catch (err) {
    if (isEnoent(err)) {
      throw new Error(`Resume file not found: ${filePath}`);
    }
    const message = reasonFromError(err);
    if (
      message.startsWith("Resume file ") ||
      message.startsWith("Unsupported resume")
    ) {
      throw err instanceof Error ? err : new Error(message);
    }
    throw new Error(
      `Could not parse resume file (${filePath}): ${message}`,
    );
  }
}

async function loadDreamCompanies(filePath: string): Promise<Set<string>> {
  try {
    return await parseDreamCompanies(filePath);
  } catch (err) {
    if (isEnoent(err)) {
      throw new Error(`Dream-companies file not found: ${filePath}`);
    }
    throw new Error(
      `Could not parse dream-companies file (${filePath}): ${reasonFromError(err)}`,
    );
  }
}

/** Placeholder scores so filterJobs can keep dream companies without LLM calls. */
function dryRunScored(
  jobs: JobListing[],
  dreamCompanies: Set<string>,
): ScoredJob[] {
  return jobs.map((job) => ({
    job,
    match: DRY_RUN_MATCH,
    isDreamCompany: isDreamCompany(job.company, dreamCompanies),
  }));
}

function printSummary(args: {
  dryRun: boolean;
  scanned: number;
  kept: ScoredJob[];
  threshold: number;
  reportPath: string;
  resumePaths: string[];
  scoringSkipped: number;
  tailorSkipped: number;
}): void {
  const dreamKept = args.kept.filter((row) => row.isDreamCompany).length;
  const thresholdKept = args.kept.length - dreamKept;

  console.log("");
  if (args.dryRun) {
    warn("DRY RUN — no LLM calls were made.");
    console.log("");
    console.log(
      "Would keep under the current filter (dream-company matches only;",
    );
    console.log("non-dream scoring requires a real run):");
    if (args.kept.length === 0) {
      console.log("  (none)");
    } else {
      for (const row of args.kept) {
        console.log(`  • ${row.job.company} — ${row.job.title}`);
      }
    }
    console.log("");
  }

  success("── Summary ──");
  console.log(`Jobs scanned:  ${args.scanned}`);
  if (args.dryRun) {
    console.log(
      `Would keep:    ${args.kept.length}  (${dreamKept} dream-company; non-dream scoring skipped)`,
    );
  } else {
    console.log(
      `Jobs kept:     ${args.kept.length}  (${thresholdKept} ≥ ${args.threshold}%, ${dreamKept} dream-company)`,
    );
  }
  console.log(`Report:        ${args.reportPath}`);
  if (args.dryRun) {
    console.log("Resumes:       (skipped — dry run)");
  } else if (args.resumePaths.length === 0) {
    console.log("Resumes:       (none written)");
  } else {
    console.log(`Resumes:       ${args.resumePaths[0]}`);
    for (const filePath of args.resumePaths.slice(1)) {
      console.log(`               ${filePath}`);
    }
  }
  if (args.scoringSkipped > 0) {
    warn(
      `Skipped during scoring:   ${args.scoringSkipped} (see messages above)`,
    );
  }
  if (args.tailorSkipped > 0) {
    warn(
      `Skipped during tailoring: ${args.tailorSkipped} (see messages above)`,
    );
  }
}

async function runTailor(options: TailorOptions): Promise<void> {
  const resolved = await resolveTailorInputs({
    jobs: options.jobs,
    resume: options.resume,
    dream: options.dream,
    out: options.out,
    threshold: options.threshold,
    dryRun: options.dryRun,
    yes: options.yes,
  });

  const concurrency = parseConcurrency(options.concurrency);
  const {
    jobsPath,
    resumePath,
    dreamPath,
    outDir,
    threshold,
  } = resolved;
  let dryRun = resolved.dryRun;

  const jobs = await loadJobs(jobsPath);
  const resume = await loadResume(resumePath);
  const dreamCompanies = dreamPath
    ? await loadDreamCompanies(dreamPath)
    : new Set<string>();

  const confirmation = await confirmTailorRun({
    jobCount: jobs.length,
    jobsPath,
    resumePath,
    dreamPath,
    outDir,
    threshold,
    dryRun,
    yes: options.yes,
  });
  if (!confirmation.proceed) {
    console.log("Aborted.");
    return;
  }
  dryRun = confirmation.dryRun;

  let scored: ScoredJob[];
  let scoringSkipped = 0;
  let resumePaths: string[] = [];
  let tailorSkipped = 0;

  if (dryRun) {
    scored = dryRunScored(jobs, dreamCompanies);
  } else {
    const config = await ensureConfigured();
    const provider = getProvider(
      config.provider,
      config.apiKey,
      options.model ?? config.model,
    );

    scored = await scoreJobs({
      provider,
      resume,
      jobs,
      concurrency,
      dreamCompanies,
    });
    scoringSkipped = jobs.length - scored.length;

    const keptLive = filterJobs(scored, dreamCompanies, threshold);
    const reportLive = await writeReport(keptLive, outDir);
    const tailored = await tailorJobs({
      provider,
      resume,
      jobs: keptLive,
      outDir,
      concurrency,
    });
    resumePaths = tailored.map((row) => row.filePath);
    tailorSkipped = keptLive.length - tailored.length;

    printSummary({
      dryRun: false,
      scanned: jobs.length,
      kept: keptLive,
      threshold,
      reportPath: reportLive.filePath,
      resumePaths,
      scoringSkipped,
      tailorSkipped,
    });
    return;
  }

  const kept = filterJobs(scored, dreamCompanies, threshold);
  const report = await writeReport(kept, outDir);

  printSummary({
    dryRun: true,
    scanned: jobs.length,
    kept,
    threshold,
    reportPath: report.filePath,
    resumePaths,
    scoringSkipped,
    tailorSkipped,
  });
}

export function registerTailor(program: Command): void {
  program
    .command("tailor")
    .description(
      "Score job listings against a resume, write an Excel match report, and generate tailored resumes",
    )
    .option(
      "--jobs <path>",
      'Path to the job-scan Markdown file (or "latest" for the newest .md in your jobs folder)',
    )
    .option("--resume <path>", "Path to the resume (.md or .docx)")
    .option(
      "--dream <path>",
      "Path to the dream-companies list (omit to skip the dream-company override)",
    )
    .option("--out <dir>", "Output directory (default: ./output or profile)")
    .option(
      "--threshold <n>",
      `Minimum match percentage to keep a job (default: ${DEFAULT_MATCH_THRESHOLD}, or profile)`,
    )
    .option(
      "--concurrency <n>",
      "Max concurrent LLM calls",
      String(DEFAULT_SCORE_CONCURRENCY),
    )
    .option("--dry-run", "Parse and filter only; skip all LLM calls")
    .option("-y, --yes", "Skip the pre-flight confirmation prompt")
    .option("--verbose", "Show stack traces on error")
    .option("--model <id>", "Override the configured model for this run")
    .action(async (options: TailorOptions) => {
      try {
        await runTailor(options);
      } catch (err) {
        error(reasonFromError(err));
        if (options.verbose && err instanceof Error && err.stack) {
          console.error(err.stack);
        }
        process.exitCode = 1;
      }
    });
}
