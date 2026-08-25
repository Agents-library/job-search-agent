import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { defaultJobsDir } from "./paths";

export interface RecentJobScan {
  filePath: string;
  mtime: Date;
}

const RECENT_SCAN_LIMIT = 5;

export async function findRecentJobScans(
  jobsDir: string,
  limit = RECENT_SCAN_LIMIT,
): Promise<RecentJobScan[]> {
  let entries: string[];
  try {
    entries = await readdir(jobsDir);
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      err.code === "ENOENT"
    ) {
      return [];
    }
    throw err;
  }

  const scans: RecentJobScan[] = [];
  for (const name of entries) {
    if (!name.toLowerCase().endsWith(".md")) {
      continue;
    }
    const filePath = path.join(jobsDir, name);
    try {
      const info = await stat(filePath);
      if (!info.isFile()) {
        continue;
      }
      scans.push({ filePath, mtime: info.mtime });
    } catch {
      // Skip entries we cannot stat.
    }
  }

  scans.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
  return scans.slice(0, limit);
}

export async function resolveLatestJobScan(
  jobsDir?: string,
): Promise<string | null> {
  const dir = jobsDir ?? defaultJobsDir();
  const recent = await findRecentJobScans(dir, 1);
  return recent[0]?.filePath ?? null;
}

export function formatScanAge(date: Date, now = new Date()): string {
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  );
  const startOfScan = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round(
    (startOfToday.getTime() - startOfScan.getTime()) / dayMs,
  );
  if (diffDays === 0) {
    return "today";
  }
  if (diffDays === 1) {
    return "yesterday";
  }
  return date.toISOString().slice(0, 10);
}
