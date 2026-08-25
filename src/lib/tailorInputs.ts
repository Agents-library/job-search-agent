import { access } from "node:fs/promises";
import path from "node:path";
import type { JobAgentProfile } from "../types";
import { DEFAULT_MATCH_THRESHOLD } from "./match/filter";
import { defaultJobsDir, displayPath } from "./paths";
import { readProfileFile, writeProfile } from "./profile";
import {
  chooseIndex,
  confirm,
  confirmProceed,
  createPrompter,
  type Prompter,
} from "./prompt";
import {
  findRecentJobScans,
  formatScanAge,
  resolveLatestJobScan,
} from "./recentJobs";

export interface TailorInputOptions {
  jobs?: string;
  resume?: string;
  dream?: string;
  out?: string;
  threshold?: string;
  dryRun?: boolean;
  yes?: boolean;
}

export interface ResolvedTailorInputs {
  jobsPath: string;
  resumePath: string;
  dreamPath?: string;
  outDir: string;
  threshold: number;
  dryRun: boolean;
  jobsDir: string;
}

function isInteractive(): boolean {
  return process.stdin.isTTY === true;
}

function parseThresholdValue(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error(
      `Invalid --threshold: expected a number from 0 to 100, got "${raw}"`,
    );
  }
  return n;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function promptJobsFile(
  prompter: Prompter,
  jobsDir: string,
): Promise<string> {
  const recent = await findRecentJobScans(jobsDir);
  if (recent.length > 0) {
    console.log(`Recent job scans in ${displayPath(jobsDir)}:`);
    recent.forEach((scan, i) => {
      const name = path.basename(scan.filePath);
      const age = formatScanAge(scan.mtime);
      console.log(`  ${i + 1}. ${name}  (${age})`);
    });
    console.log(`  ${recent.length + 1}. Enter a different path`);
    const choice = await chooseIndex(
      prompter,
      `Pick [1-${recent.length + 1}]:`,
      recent.length + 1,
    );
    if (choice < recent.length) {
      return recent[choice].filePath;
    }
  } else {
    console.log(
      `No recent .md files found in ${displayPath(jobsDir)}. Enter the jobs file path.`,
    );
  }

  for (;;) {
    const answer = await prompter.question("Jobs file: ");
    const raw = answer.trim();
    if (raw.length === 0) {
      console.log("Path cannot be empty.");
      continue;
    }
    const resolved = path.resolve(raw);
    if (!(await pathExists(resolved))) {
      console.log(`Not found: ${resolved}`);
      continue;
    }
    return resolved;
  }
}

async function promptResumeFile(
  prompter: Prompter,
  defaultValue: string | undefined,
): Promise<string> {
  const hint = defaultValue ? ` [${displayPath(defaultValue)}]` : "";
  for (;;) {
    const answer = await prompter.question(`Resume file${hint}: `);
    const raw = answer === "" && defaultValue ? defaultValue : answer.trim();
    if (raw.length === 0) {
      console.log("Path cannot be empty.");
      continue;
    }
    const resolved = path.resolve(raw);
    if (!(await pathExists(resolved))) {
      console.log(`Not found: ${resolved}`);
      continue;
    }
    return resolved;
  }
}

function profileFromResolved(
  inputs: Omit<ResolvedTailorInputs, "dryRun">,
): JobAgentProfile {
  const profile: JobAgentProfile = {
    resume: inputs.resumePath,
    out: inputs.outDir,
    jobsDir: inputs.jobsDir,
    threshold: inputs.threshold,
  };
  if (inputs.dreamPath) {
    profile.dream = inputs.dreamPath;
  }
  return profile;
}

export async function resolveTailorInputs(
  options: TailorInputOptions,
): Promise<ResolvedTailorInputs> {
  const profile = await readProfileFile();
  const jobsDir = path.resolve(profile?.jobsDir ?? defaultJobsDir());
  let dryRun = options.dryRun === true;
  let usedPrompt = false;

  let jobsPath: string | undefined;
  if (options.jobs === "latest") {
    const latest = await resolveLatestJobScan(jobsDir);
    if (!latest) {
      throw new Error(
        `No job scan .md files found in ${displayPath(jobsDir)}. Pass --jobs <path> or run \`job-agent profile\` to set jobsDir.`,
      );
    }
    jobsPath = latest;
  } else if (options.jobs) {
    jobsPath = path.resolve(options.jobs);
  }

  let resumePath = options.resume
    ? path.resolve(options.resume)
    : profile?.resume
      ? path.resolve(profile.resume)
      : undefined;

  let dreamPath = options.dream
    ? path.resolve(options.dream)
    : profile?.dream
      ? path.resolve(profile.dream)
      : undefined;

  const outDir = path.resolve(
    options.out ?? profile?.out ?? "./output",
  );

  const threshold = options.threshold
    ? parseThresholdValue(options.threshold)
    : (profile?.threshold ?? DEFAULT_MATCH_THRESHOLD);

  const prompter = isInteractive() ? createPrompter() : null;
  try {
    if (!jobsPath) {
      if (prompter) {
        jobsPath = await promptJobsFile(prompter, jobsDir);
        usedPrompt = true;
      } else {
        throw new Error(
          "Missing jobs file. Pass --jobs <path>, use --jobs latest with a profile jobsDir, or run interactively.",
        );
      }
    }

    if (!resumePath) {
      if (prompter) {
        resumePath = await promptResumeFile(prompter, profile?.resume);
        usedPrompt = true;
      } else {
        throw new Error(
          "Missing resume file. Pass --resume <path>, run `job-agent profile`, or run interactively.",
        );
      }
    }

    if (usedPrompt && prompter) {
      const save = await confirm(
        prompter,
        "Save these paths as your default profile?",
        !profile,
      );
      if (save) {
        await writeProfile(
          profileFromResolved({
            jobsPath,
            resumePath,
            dreamPath,
            outDir,
            threshold,
            jobsDir,
          }),
        );
        console.log("Saved profile.");
        console.log("");
      }
    }

    return {
      jobsPath,
      resumePath,
      dreamPath,
      outDir,
      threshold,
      dryRun,
      jobsDir,
    };
  } finally {
    prompter?.close();
  }
}

export async function confirmTailorRun(args: {
  jobCount: number;
  jobsPath: string;
  resumePath: string;
  dreamPath?: string;
  outDir: string;
  threshold: number;
  dryRun: boolean;
  yes?: boolean;
}): Promise<{ dryRun: boolean; proceed: boolean }> {
  if (args.dryRun || args.yes || !isInteractive()) {
    return { dryRun: args.dryRun, proceed: true };
  }

  const prompter = createPrompter();
  try {
    console.log("");
    console.log(`${args.jobCount} job${args.jobCount === 1 ? "" : "s"} found.`);
    console.log(`Jobs:      ${displayPath(args.jobsPath)}`);
    console.log(`Resume:    ${displayPath(args.resumePath)}`);
    if (args.dreamPath) {
      console.log(`Dream:     ${displayPath(args.dreamPath)}`);
    } else {
      console.log("Dream:     (not set)");
    }
    console.log(`Output:    ${displayPath(args.outDir)}`);
    console.log(`Threshold: ${args.threshold}%`);
    console.log("");

    const choice = await confirmProceed(
      prompter,
      "Proceed with scoring and tailoring?",
    );
    if (choice === "abort") {
      return { dryRun: false, proceed: false };
    }
    if (choice === "dry-run") {
      return { dryRun: true, proceed: true };
    }
    return { dryRun: false, proceed: true };
  } finally {
    prompter.close();
  }
}
