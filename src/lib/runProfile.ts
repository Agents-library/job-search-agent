import { access, stat } from "node:fs/promises";
import path from "node:path";
import type { JobAgentProfile } from "../types";
import { DEFAULT_MATCH_THRESHOLD } from "./match/filter";
import { defaultJobsDir, displayPath } from "./paths";
import {
  getProfileFilePathDisplay,
  readProfileFile,
  writeProfile,
} from "./profile";
import { confirm, createPrompter, type Prompter } from "./prompt";

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(filePath: string): Promise<boolean> {
  try {
    const info = await stat(filePath);
    return info.isDirectory();
  } catch {
    return false;
  }
}

async function promptExistingFile(
  prompter: Prompter,
  label: string,
  defaultValue: string | undefined,
): Promise<string> {
  const hint = defaultValue ? ` [${displayPath(defaultValue)}]` : "";
  for (;;) {
    const answer = await prompter.question(`${label}${hint}: `);
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
    if (await isDirectory(resolved)) {
      console.log(`Expected a file, got a directory: ${resolved}`);
      continue;
    }
    return resolved;
  }
}

async function promptExistingDirectory(
  prompter: Prompter,
  label: string,
  defaultValue: string,
): Promise<string> {
  const hint = ` [${displayPath(defaultValue)}]`;
  for (;;) {
    const answer = await prompter.question(`${label}${hint}: `);
    const raw = answer === "" ? defaultValue : answer.trim();
    if (raw.length === 0) {
      console.log("Path cannot be empty.");
      continue;
    }
    const resolved = path.resolve(raw);
    if (!(await pathExists(resolved))) {
      console.log(`Not found: ${resolved}`);
      continue;
    }
    if (!(await isDirectory(resolved))) {
      console.log(`Not a directory: ${resolved}`);
      continue;
    }
    return resolved;
  }
}

async function promptOptionalFile(
  prompter: Prompter,
  label: string,
  defaultValue: string | undefined,
): Promise<string | undefined> {
  const hint = defaultValue
    ? ` [${displayPath(defaultValue)}, Enter to skip]`
    : " [Enter to skip]";
  for (;;) {
    const answer = await prompter.question(`${label}${hint}: `);
    if (answer.trim() === "") {
      return defaultValue;
    }
    const resolved = path.resolve(answer.trim());
    if (!(await pathExists(resolved))) {
      console.log(`Not found: ${resolved}`);
      continue;
    }
    if (await isDirectory(resolved)) {
      console.log(`Expected a file, got a directory: ${resolved}`);
      continue;
    }
    return resolved;
  }
}

async function promptOutputDirectory(
  prompter: Prompter,
  defaultValue: string,
): Promise<string> {
  for (;;) {
    const answer = await prompter.question(
      `Output directory [${displayPath(defaultValue)}]: `,
    );
    const raw = answer === "" ? defaultValue : answer.trim();
    if (raw.length === 0) {
      console.log("Path cannot be empty.");
      continue;
    }
    return path.resolve(raw);
  }
}

async function promptThreshold(
  prompter: Prompter,
  defaultValue: number,
): Promise<number> {
  for (;;) {
    const answer = await prompter.question(
      `Match threshold [${defaultValue}]: `,
    );
    if (answer.trim() === "") {
      return defaultValue;
    }
    const n = Number(answer);
    if (Number.isFinite(n) && n >= 0 && n <= 100) {
      return n;
    }
    console.log("Please enter a number from 0 to 100.");
  }
}

export function printProfile(profile: JobAgentProfile): void {
  console.log(`Resume:    ${displayPath(profile.resume)}`);
  if (profile.dream) {
    console.log(`Dream:     ${displayPath(profile.dream)}`);
  } else {
    console.log("Dream:     (not set)");
  }
  console.log(
    `Jobs dir:  ${displayPath(profile.jobsDir ?? defaultJobsDir())}`,
  );
  console.log(`Output:    ${displayPath(profile.out ?? "./output")}`);
  console.log(`Threshold: ${profile.threshold ?? DEFAULT_MATCH_THRESHOLD}%`);
  console.log(`Profile:   ${getProfileFilePathDisplay()}`);
}

export async function runProfile(): Promise<JobAgentProfile | null> {
  const existing = await readProfileFile();
  const prompter = createPrompter();
  try {
    if (existing) {
      console.log("Current profile:");
      printProfile(existing);
      console.log("");
      const update = await confirm(prompter, "Update profile?", true);
      if (!update) {
        return existing;
      }
    } else {
      console.log(
        "Set default paths for `job-agent tailor` so you only need to pick a jobs file each run.",
      );
      console.log("");
    }

    const resume = await promptExistingFile(
      prompter,
      "Resume file",
      existing?.resume,
    );
    const dream = await promptOptionalFile(
      prompter,
      "Dream-companies file",
      existing?.dream,
    );
    const jobsDir = await promptExistingDirectory(
      prompter,
      "Folder to scan for job Markdown files",
      existing?.jobsDir ?? defaultJobsDir(),
    );
    const out = await promptOutputDirectory(
      prompter,
      existing?.out ?? "./output",
    );
    const threshold = await promptThreshold(
      prompter,
      existing?.threshold ?? DEFAULT_MATCH_THRESHOLD,
    );

    const profile: JobAgentProfile = {
      resume,
      out,
      jobsDir,
      threshold,
    };
    if (dream) {
      profile.dream = dream;
    }
    await writeProfile(profile);
    console.log("");
    console.log("Saved profile:");
    printProfile(profile);
    return profile;
  } finally {
    prompter.close();
  }
}
