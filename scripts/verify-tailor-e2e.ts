/**
 * Step 8 verification helpers (no live LLM required).
 * Run: npx tsx scripts/verify-tailor-e2e.ts
 */
import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { filterJobs } from "../src/lib/match/filter";
import type { JobListing, ScoredJob } from "../src/types";

const repoRoot = path.join(__dirname, "..");

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function listing(
  jobId: string,
  company: string,
  title: string,
  matchPercent: number,
  isDream: boolean,
): ScoredJob {
  const job: JobListing = {
    jobId,
    title,
    company,
    location: "Remote",
    url: `https://example.test/${jobId}`,
    description: title,
  };
  return {
    job,
    match: {
      matchPercent,
      matchedSkills: [],
      missingSkills: [],
      rationale: "mock",
    },
    isDreamCompany: isDream,
  };
}

async function runCli(
  args: string[],
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.join(repoRoot, "node_modules/tsx/dist/cli.mjs"),
        "src/cli.ts",
        ...args,
      ],
      {
        cwd: repoRoot,
        env: { ...process.env, FORCE_COLOR: "0" },
        windowsHide: true,
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function verifyDryRunAndDistinctFiles(): Promise<void> {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "job-agent-e2e-"));
  try {
    const common = [
      "tailor",
      "--jobs",
      "fixtures/parsers/jobs.md",
      "--resume",
      "fixtures/parsers/resume.md",
      "--dream",
      "fixtures/parsers/dream.md",
      "--out",
      outDir,
      "--dry-run",
    ];

    const first = await runCli(common);
    assert(first.code === 0, `dry-run exit ${first.code}: ${first.stderr}`);
    assert(
      first.stdout.includes("DRY RUN — no LLM calls were made."),
      "dry-run banner missing",
    );
    assert(
      first.stdout.includes("Google — Software Engineer, Search"),
      "expected dream Google in dry-run keep list",
    );
    assert(
      first.stdout.includes("Microsoft Inc. — Product Manager"),
      "expected dream Microsoft in dry-run keep list",
    );
    assert(
      !first.stdout.includes("Acme Analytics"),
      "non-dream should not be kept in dry-run",
    );

    await new Promise((r) => setTimeout(r, 5));
    const second = await runCli(common);
    assert(second.code === 0, `second dry-run exit ${second.code}`);

    const files = (await readdir(outDir)).filter((f) => f.endsWith(".xlsx"));
    assert(files.length === 2, `expected 2 report files, got ${files.length}`);
    assert(new Set(files).size === 2, "report filenames must be distinct");
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}

async function verifyMissingJobsPath(): Promise<void> {
  const result = await runCli([
    "tailor",
    "--jobs",
    path.join(repoRoot, "definitely-missing-jobs.md"),
    "--resume",
    "fixtures/parsers/resume.md",
    "--dry-run",
  ]);
  assert(result.code === 1, `expected exit 1, got ${result.code}`);
  const combined = `${result.stdout}\n${result.stderr}`;
  assert(
    combined.includes("Jobs file not found:"),
    `expected clear missing-file message, got: ${combined}`,
  );
  assert(
    !combined.includes("at loadJobs"),
    "stack trace must not appear without --verbose",
  );
}

async function verifyThresholdHonored(): Promise<void> {
  // Same filter the tailor command calls after scoring.
  const dream = new Set<string>();
  const scored: ScoredJob[] = [
    listing("1", "Acme", "A", 95, false),
    listing("2", "Beta", "B", 70, false),
    listing("3", "Gamma", "C", 45, false),
    listing("4", "DreamCo", "D", 10, true),
  ];
  const at40 = filterJobs(scored, dream, 40);
  const at90 = filterJobs(scored, dream, 90);
  assert(at40.length === 4, `threshold 40 expected 4, got ${at40.length}`);
  assert(at90.length === 2, `threshold 90 expected 2, got ${at90.length}`);
  assert(
    at90.every(
      (row) => row.isDreamCompany || row.match.matchPercent >= 90,
    ),
    "threshold 90 kept unexpected rows",
  );
}

async function main(): Promise<void> {
  await verifyThresholdHonored();
  await verifyMissingJobsPath();
  await verifyDryRunAndDistinctFiles();
  console.log("verify-tailor-e2e: ok");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
