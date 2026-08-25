import { mkdtemp, readdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { resolveConfig } from "../src/lib/config";
import { parseJobs } from "../src/lib/parsers/parseJobs";
import { parseResume } from "../src/lib/parsers/parseResume";
import { getProvider } from "../src/lib/providers";
import { TAILOR_INSTRUCTIONS, tailorResumePrompt } from "../src/lib/tailor/prompt";
import {
  slugify,
  tailoredResumeFilename,
  tailorJobs,
} from "../src/lib/tailor/run";
import type { JobListing, LLMProvider, MatchResult, ScoredJob } from "../src/types";

const FIXTURES = path.join(__dirname, "..", "fixtures", "parsers");
const ANSI = /\x1b\[[0-9;]*m/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockMatch(): MatchResult {
  return {
    matchPercent: 50,
    matchedSkills: ["TypeScript"],
    missingSkills: [],
    rationale: "mock",
  };
}

function scored(
  jobId: string,
  company: string,
  title: string,
  description?: string,
): ScoredJob {
  const job: JobListing = {
    jobId,
    title,
    company,
    location: "Remote",
    url: `https://example.test/${jobId}`,
    description: description ?? `Role: ${title}`,
  };
  return { job, match: mockMatch(), isDreamCompany: false };
}

function mockProvider(opts: {
  delaysMs: number[];
  failAt?: number;
  bodies?: string[];
  onStart?: (index: number) => void;
  onEnd?: (index: number) => void;
}): LLMProvider {
  let call = 0;
  return {
    defaultModel: "mock",
    async scoreMatch(): Promise<MatchResult> {
      return mockMatch();
    },
    async tailorResume(): Promise<string> {
      const index = call;
      call += 1;
      opts.onStart?.(index);
      await delay(opts.delaysMs[index] ?? 20);
      opts.onEnd?.(index);
      if (opts.failAt === index) {
        throw new Error("simulated provider error (HTTP 500)");
      }
      return opts.bodies?.[index] ?? `# Tailored ${index + 1}\n\nTypeScript CLI tools.`;
    },
    async ping(): Promise<void> {
      return;
    },
  };
}

function captureLogs(): {
  entries: { at: number; line: string }[];
  restore: () => void;
} {
  const entries: { at: number; line: string }[] = [];
  const origLog = console.log;
  const origErr = console.error;
  const capture = (...args: unknown[]) => {
    entries.push({ at: Date.now(), line: stripAnsi(String(args[0] ?? "")) });
  };
  console.log = capture as typeof console.log;
  console.error = capture as typeof console.error;
  return {
    entries,
    restore: () => {
      console.log = origLog;
      console.error = origErr;
    },
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function verifyPromptForbidsInvention(): void {
  const lower = TAILOR_INSTRUCTIONS.toLowerCase();
  assert(lower.includes("reorder"), "prompt must instruct reorder");
  assert(lower.includes("rephrase"), "prompt must instruct rephrase");
  assert(lower.includes("emphasize"), "prompt must instruct emphasize");
  assert(
    lower.includes("never invent"),
    "prompt must forbid inventing content",
  );
  for (const term of ["employer", "title", "date", "skill", "tool", "achievement"]) {
    assert(
      lower.includes(term),
      `prompt must mention ${term} in the no-fabrication rule`,
    );
  }
  const filled = tailorResumePrompt("SOURCE RESUME TEXT", "JOB LISTING TEXT");
  assert(filled.includes("SOURCE RESUME TEXT"), "prompt must include resume");
  assert(filled.includes("JOB LISTING TEXT"), "prompt must include job listing");
  assert(
    filled.includes(TAILOR_INSTRUCTIONS),
    "assembled prompt must include the shared instructions",
  );
}

function verifySlugify(): void {
  assert(
    tailoredResumeFilename("Acme Corp", "Backend Engineer") ===
      "acme-corp-backend-engineer.md",
    "expected acme-corp-backend-engineer.md",
  );
  assert(
    tailoredResumeFilename("Google India Pvt. Ltd.", "Software Engineer, Search") ===
      "google-india-pvt-ltd-software-engineer-search.md",
    "punctuation/spaces should slugify",
  );
  assert(
    tailoredResumeFilename("ACME", "BACKEND") === "acme-backend.md",
    "unusual casing should lowercase",
  );
  assert(slugify("  --Foo!!Bar--  ") === "foo-bar", "collapse punctuation");
  assert(slugify("") === "untitled", "empty slug fallback");

  const used = new Set<string>();
  const a = tailoredResumeFilename("Acme", "Engineer", used, "1");
  const b = tailoredResumeFilename("Acme", "Engineer", used, "2");
  assert(a === "acme-engineer.md", `first collision-free name, got ${a}`);
  assert(
    b === "acme-engineer-2.md",
    `second same company/role should disambiguate, got ${b}`,
  );
  assert(a !== b, "collision names must differ");
}

async function verifyMockFailureDoesNotAbort(): Promise<void> {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "job-agent-tailor-"));
  const jobs = [
    scored("1", "Acme", "Engineer"),
    scored("2", "Globex", "Analyst"),
    scored("3", "Initech", "PM"),
  ];
  const logs = captureLogs();
  try {
    const written = await tailorJobs({
      provider: mockProvider({ delaysMs: [10, 10, 10], failAt: 1 }),
      resume: "TypeScript engineer",
      jobs,
      outDir,
      concurrency: 1,
    });
    assert(written.length === 2, `expected 2 files, got ${written.length}`);
    assert(
      written.every((row) => row.job.job.jobId !== "2"),
      "failed job should be skipped",
    );
    const skipped = logs.entries.filter((e) => e.line.startsWith("Skipped"));
    assert(skipped.length === 1, "expected one skipped line");
    assert(
      skipped[0]!.line.includes("Globex") &&
        skipped[0]!.line.includes("simulated provider error"),
      `skipped line missing reason: ${skipped[0]!.line}`,
    );
    const tailoring = logs.entries.filter((e) => e.line.startsWith("Tailoring"));
    assert(tailoring.length === 2, "expected two tailoring lines");
    const files = await readdir(outDir);
    assert(files.length === 2, `expected 2 markdown files, got ${files.join(",")}`);
  } finally {
    logs.restore();
  }
}

async function verifyProgressIsIncremental(): Promise<void> {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "job-agent-tailor-"));
  const jobs = [
    scored("1", "Slow Co", "Backend"),
    scored("2", "Fast Co", "Frontend"),
  ];
  const logs = captureLogs();
  try {
    await tailorJobs({
      provider: mockProvider({ delaysMs: [180, 40] }),
      resume: "resume",
      jobs,
      outDir,
      concurrency: 2,
    });
    const tailoring = logs.entries.filter((e) => e.line.startsWith("Tailoring"));
    assert(tailoring.length === 2, "expected two tailoring lines");
    const gap = Math.abs(tailoring[1]!.at - tailoring[0]!.at);
    assert(
      gap >= 50,
      `progress lines looked batched (gap ${gap}ms); expected incremental prints`,
    );
    assert(
      tailoring[0]!.line.includes("Fast Co"),
      `faster job should print first, got: ${tailoring[0]!.line}`,
    );
  } finally {
    logs.restore();
  }
}

async function verifyConcurrencyBound(): Promise<void> {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "job-agent-tailor-"));
  let inFlight = 0;
  let maxInFlight = 0;
  const jobs = [
    scored("1", "A", "One"),
    scored("2", "B", "Two"),
    scored("3", "C", "Three"),
    scored("4", "D", "Four"),
    scored("5", "E", "Five"),
  ];
  const logs = captureLogs();
  try {
    await tailorJobs({
      provider: mockProvider({
        delaysMs: [40, 40, 40, 40, 40],
        onStart: () => {
          inFlight += 1;
          maxInFlight = Math.max(maxInFlight, inFlight);
        },
        onEnd: () => {
          inFlight -= 1;
        },
      }),
      resume: "resume",
      jobs,
      outDir,
      concurrency: 3,
    });
    assert(
      maxInFlight <= 3,
      `concurrency exceeded bound: max in-flight ${maxInFlight}`,
    );
    assert(maxInFlight >= 2, `expected parallel work, max in-flight ${maxInFlight}`);
  } finally {
    logs.restore();
  }
}

async function verifyLiveIfConfigured(): Promise<void> {
  const resolved = await resolveConfig();
  if (!resolved.configured) {
    console.log(
      "Live tailoring skipped (no resolved config). Mock checks still passed.",
    );
    return;
  }

  const [listings, resume] = await Promise.all([
    parseJobs(path.join(FIXTURES, "jobs.md")),
    parseResume(path.join(FIXTURES, "resume.md")),
  ]);
  const subset = listings.slice(0, 3).map((job) => ({
    job,
    match: mockMatch(),
    isDreamCompany: false,
  }));
  const outDir = await mkdtemp(path.join(os.tmpdir(), "job-agent-tailor-live-"));
  const provider = getProvider(
    resolved.config.provider,
    resolved.config.apiKey,
    resolved.config.model,
  );

  console.log(
    `Live tailoring ${subset.length} jobs with ${resolved.config.provider} / ${resolved.config.model}`,
  );
  const written = await tailorJobs({
    provider,
    resume,
    jobs: subset,
    outDir,
    concurrency: 2,
  });

  assert(
    written.length === subset.length,
    `live run expected ${subset.length} files, got ${written.length}`,
  );

  const names = new Set<string>();
  for (const row of written) {
    const name = path.basename(row.filePath);
    assert(!names.has(name), `duplicate filename ${name}`);
    names.add(name);
    const text = await readFile(row.filePath, "utf8");
    assert(text.trim().length > 0, `${name} is empty`);
    assert(
      text.includes("#") || text.includes("Anshul") || text.length > 40,
      `${name} does not look like readable Markdown`,
    );
    console.log(`  wrote ${row.filePath} (${text.length} chars)`);
  }

  const sample = await readFile(written[0]!.filePath, "utf8");
  console.log("Hand-check (truthfulness — every claim must exist in source):");
  console.log("--- source resume ---");
  console.log(resume);
  console.log("--- tailored sample ---");
  console.log(sample);
}

async function main(): Promise<void> {
  verifyPromptForbidsInvention();
  verifySlugify();
  await verifyMockFailureDoesNotAbort();
  await verifyProgressIsIncremental();
  await verifyConcurrencyBound();
  await verifyLiveIfConfigured();
  console.log("Step 7 resume-tailoring verification passed.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
