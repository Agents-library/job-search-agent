import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { JobAgentProfile } from "../types";
import { getConfigDir } from "./config";

const PROFILE_FILE_NAME = "profile.json";

export function getProfileFilePath(): string {
  return path.join(getConfigDir(), PROFILE_FILE_NAME);
}

/** Path shown in CLI output (never an expanded home directory). */
export function getProfileFilePathDisplay(): string {
  return `~/.job-agent/${PROFILE_FILE_NAME}`;
}

function parseProfile(value: unknown): JobAgentProfile | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.resume !== "string" || record.resume.length === 0) {
    return null;
  }
  const profile: JobAgentProfile = {
    resume: record.resume,
  };
  if (record.dream !== undefined) {
    if (typeof record.dream !== "string" || record.dream.length === 0) {
      return null;
    }
    profile.dream = record.dream;
  }
  if (record.out !== undefined) {
    if (typeof record.out !== "string" || record.out.length === 0) {
      return null;
    }
    profile.out = record.out;
  }
  if (record.jobsDir !== undefined) {
    if (typeof record.jobsDir !== "string" || record.jobsDir.length === 0) {
      return null;
    }
    profile.jobsDir = record.jobsDir;
  }
  if (record.threshold !== undefined) {
    const n = Number(record.threshold);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return null;
    }
    profile.threshold = n;
  }
  return profile;
}

export async function readProfileFile(): Promise<JobAgentProfile | null> {
  try {
    const raw = await readFile(getProfileFilePath(), "utf8");
    return parseProfile(JSON.parse(raw) as unknown);
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "ENOENT"
    ) {
      return null;
    }
    if (err instanceof SyntaxError) {
      return null;
    }
    throw err;
  }
}

export async function writeProfile(profile: JobAgentProfile): Promise<void> {
  const dir = getConfigDir();
  const file = getProfileFilePath();
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const body = `${JSON.stringify(profile, null, 2)}\n`;
  await writeFile(file, body, { encoding: "utf8", mode: 0o600 });
  try {
    await chmod(dir, 0o700);
    await chmod(file, 0o600);
  } catch {
    // Unix modes are best-effort on Windows.
  }
}
