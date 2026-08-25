import path from "node:path";
import { scoreJobs } from "../src/lib/match/run";
import { parseDreamCompanies } from "../src/lib/parsers/parseDreamCompanies";
import { parseJobs } from "../src/lib/parsers/parseJobs";
import { parseResume } from "../src/lib/parsers/parseResume";
import { resolveConfig } from "../src/lib/config";
import { getProvider } from "../src/lib/providers";
import type { JobListing, LLMProvider, MatchResult } from "../src/types";

const FIXTURES = path.join(__dirname, "..", "fixtures", "parsers");
const ANSI = /\x1b\[[0-9;]*m/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI, "");
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mockResult(matchPercent: number): MatchResult {
  return {
    matchPercent,
    matchedSkills: ["TypeScript"],
    missingSkills: [],
    rationale: "mock",
  };
}

function mockProvider(opts: {
  delaysMs: number[];
  failAt?: number;
  onStart?: (index: number) => void;
  onEnd?: (index: number) => void;
}): LLMProvider {
  let call = 0;
  return {
    defaultModel: "mock",
    async scoreMatch(): Promise<MatchResult> {
      const index = call;
      call += 1;
      opts.onStart?.(index);
      await delay(opts.delaysMs[index] ?? 20);
      opts.onEnd?.(index);
      if (opts.failAt === index) {
        throw new Error("simulated provider error (HTTP 500)");
      }
      return mockResult(50 + index);
    },
    async tailorResume(): Promise<string> {
      return "";
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

function listing(
  jobId: string,
  company: string,
  title: string,
): JobListing {
  return {
    jobId,
    title,
    company,
    location: "Remote",
    url: `https://example.test/${jobId}`,
    description: `Role: ${title}`,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function verifyMockFailureDoesNotAbort(): Promise<void> {
  const jobs = [
    listing("1", "Acme", "Engineer"),
    listing("2", "Globex", "Analyst"),
    listing("3", "Initech", "PM"),
  ];
  const logs = captureLogs();
  try {
    const scored = await scoreJobs({
      provider: mockProvider({ delaysMs: [10, 10, 10], failAt: 1 }),
      resume: "TypeScript engineer",
      jobs,
      concurrency: 1,
    });
    assert(scored.length === 2, `expected 2 scored jobs, got ${scored.length}`);
    assert(
      scored.every((row) => row.job.jobId !== "2"),
      "failed job should be skipped",
    );
    assert(
      scored[0]!.match.matchPercent >= 0 &&
        scored[0]!.match.matchPercent <= 100,
      "matchPercent out of range",
    );
    const skipped = logs.entries.filter((e) => e.line.startsWith("Skipped"));
    assert(skipped.length === 1, "expected one skipped line");
    assert(
      skipped[0]!.line.includes("Globex") &&
        skipped[0]!.line.includes("simulated provider error"),
      `skipped line missing reason: ${skipped[0]!.line}`,
    );
    const scoring = logs.entries.filter((e) => e.line.startsWith("Scoring"));
    assert(scoring.length === 2, "expected two scoring lines");
  } finally {
    logs.restore();
  }
}

async function verifyProgressIsIncremental(): Promise<void> {
  const jobs = [
    listing("1", "Slow Co", "Backend"),
    listing("2", "Fast Co", "Frontend"),
  ];
  const logs = captureLogs();
  try {
    await scoreJobs({
      provider: mockProvider({ delaysMs: [180, 40] }),
      resume: "resume",
      jobs,
      concurrency: 2,
    });
    const scoring = logs.entries.filter((e) => e.line.startsWith("Scoring"));
    assert(scoring.length === 2, "expected two scoring lines");
    const gap = Math.abs(scoring[1]!.at - scoring[0]!.at);
    assert(
      gap >= 50,
      `progress lines looked batched (gap ${gap}ms); expected incremental prints`,
    );
    assert(
      scoring[0]!.line.includes("Fast Co"),
      `faster job should print first, got: ${scoring[0]!.line}`,
    );
  } finally {
    logs.restore();
  }
}

async function verifyConcurrencyBound(): Promise<void> {
  let inFlight = 0;
  let maxInFlight = 0;
  const jobs = [
    listing("1", "A", "One"),
    listing("2", "B", "Two"),
    listing("3", "C", "Three"),
    listing("4", "D", "Four"),
    listing("5", "E", "Five"),
  ];
  const logs = captureLogs();
  try {
    await scoreJobs({
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

async function verifyDreamFlag(): Promise<void> {
  const jobs = [
    listing("1", "Google India Private Limited", "SWE"),
    listing("2", "Acme Analytics", "Analyst"),
  ];
  const dreamCompanies = await parseDreamCompanies(
    path.join(FIXTURES, "dream.md"),
  );
  const logs = captureLogs();
  try {
    const scored = await scoreJobs({
      provider: mockProvider({ delaysMs: [5, 5] }),
      resume: "resume",
      jobs,
      dreamCompanies,
    });
    const google = scored.find((row) => row.job.jobId === "1");
    const acme = scored.find((row) => row.job.jobId === "2");
    assert(google?.isDreamCompany === true, "Google should be a dream company");
    assert(acme?.isDreamCompany === false, "Acme should not be a dream company");
  } finally {
    logs.restore();
  }
}

async function verifyLiveIfConfigured(): Promise<void> {
  const resolved = await resolveConfig();
  if (!resolved.configured) {
    console.log(
      "Live scoring skipped (no resolved config). Mock checks still passed.",
    );
    return;
  }

  const [jobs, resume] = await Promise.all([
    parseJobs(path.join(FIXTURES, "jobs.md")),
    parseResume(path.join(FIXTURES, "resume.md")),
  ]);
  const provider = getProvider(
    resolved.config.provider,
    resolved.config.apiKey,
    resolved.config.model,
  );

  console.log(
    `Live scoring ${jobs.length} jobs with ${resolved.config.provider} / ${resolved.config.model}`,
  );
  const scored = await scoreJobs({
    provider,
    resume,
    jobs,
    concurrency: 2,
  });

  assert(
    scored.length === jobs.length,
    `live run expected ${jobs.length} results, got ${scored.length}`,
  );
  for (const row of scored) {
    assert(
      row.match.matchPercent >= 0 && row.match.matchPercent <= 100,
      `${row.job.company}: matchPercent ${row.match.matchPercent} out of 0–100`,
    );
    assert(typeof row.match.rationale === "string", "rationale missing");
    assert(Array.isArray(row.match.matchedSkills), "matchedSkills missing");
    assert(Array.isArray(row.match.missingSkills), "missingSkills missing");
  }

  console.log("Hand-check (rubric sanity — directional, not exact):");
  for (const row of scored) {
    console.log(
      `  ${row.job.company} — ${row.job.title}: ${Math.round(row.match.matchPercent)}%`,
    );
    console.log(`    matched: ${row.match.matchedSkills.join(", ") || "(none)"}`);
    console.log(`    missing: ${row.match.missingSkills.join(", ") || "(none)"}`);
    console.log(`    ${row.match.rationale}`);
  }
}

async function main(): Promise<void> {
  await verifyMockFailureDoesNotAbort();
  await verifyProgressIsIncremental();
  await verifyConcurrencyBound();
  await verifyDreamFlag();
  await verifyLiveIfConfigured();
  console.log("Step 5 match-scoring verification passed.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
