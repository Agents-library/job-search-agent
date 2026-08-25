import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ExcelJS from "exceljs";
import { writeReport } from "../src/lib/excel/writeReport";
import { DEFAULT_MATCH_THRESHOLD, filterJobs } from "../src/lib/match/filter";
import { isDreamCompany } from "../src/lib/parsers/parseDreamCompanies";
import type { JobListing, ScoredJob } from "../src/types";

function listing(
  jobId: string,
  company: string,
  title: string,
  matchPercent: number,
  opts?: { postedAt?: string },
): ScoredJob {
  const job: JobListing = {
    jobId,
    title,
    company,
    location: "Remote",
    postedAt: opts?.postedAt,
    url: `https://example.test/${jobId}`,
    description: `Role: ${title}`,
  };
  return {
    job,
    match: {
      matchPercent,
      matchedSkills: ["TypeScript"],
      missingSkills: matchPercent < 40 ? ["Kubernetes"] : [],
      rationale: `mock ${matchPercent}%`,
    },
    isDreamCompany: false,
  };
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function verifyFilter(): Promise<void> {
  const dreamCompanies = new Set(["google", "stripe"]);
  const jobs: ScoredJob[] = [
    listing("1", "Google India Private Limited", "SWE", 25),
    listing("2", "Stripe", "Backend", 15),
    listing("3", "Acme Corp", "Engineer", 55),
    listing("4", "Globex", "Analyst", 39),
    listing("5", "Initech", "PM", 40),
    listing("6", "Umbrella", "Designer", 80),
  ];

  const filtered = filterJobs(jobs, dreamCompanies, DEFAULT_MATCH_THRESHOLD);

  assert(filtered.length === 5, `expected 5 kept jobs, got ${filtered.length}`);

  const ids = new Set(filtered.map((row) => row.job.jobId));
  assert(ids.has("1"), "dream Google below threshold should be kept");
  assert(ids.has("2"), "dream Stripe below threshold should be kept");
  assert(ids.has("3"), "non-dream 55% should be kept");
  assert(ids.has("5"), "non-dream 40% should be kept");
  assert(ids.has("6"), "non-dream 80% should be kept");
  assert(!ids.has("4"), "non-dream 39% should be dropped");

  for (const row of filtered) {
    const dream =
      row.isDreamCompany || isDreamCompany(row.job.company, dreamCompanies);
    const allowed =
      dream || row.match.matchPercent >= DEFAULT_MATCH_THRESHOLD;
    assert(allowed, `unexpected row kept: ${row.job.jobId}`);
  }
}

async function readSheetHeaders(filePath: string): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  assert(sheet !== undefined, "workbook missing first sheet");
  const row = sheet.getRow(1);
  return COLUMNS_FROM_SPEC.map((_, index) => String(row.getCell(index + 1).value ?? ""));
}

const COLUMNS_FROM_SPEC = [
  "Company",
  "Title",
  "Location",
  "Match %",
  "Dream Company (Y/N)",
  "Matched Skills",
  "Missing Skills",
  "Rationale",
  "Posted",
  "URL",
  "Job ID",
];

async function verifyExcelReport(): Promise<string> {
  const jobs: ScoredJob[] = [
    {
      ...listing("a", "Acme Corp", "Engineer", 72),
      isDreamCompany: false,
    },
    {
      ...listing("b", "Google India Private Limited", "SWE", 28),
      isDreamCompany: true,
    },
    {
      ...listing("c", "Globex", "Analyst", 45),
      isDreamCompany: false,
    },
  ];

  const outDir = await mkdtemp(path.join(os.tmpdir(), "job-agent-step6-"));
  const first = await writeReport(jobs, outDir);
  assert(first.rowCount === 3, `expected 3 rows, got ${first.rowCount}`);

  const headers = await readSheetHeaders(first.filePath);
  assert(
    headers.join("|") === COLUMNS_FROM_SPEC.join("|"),
    `column headers mismatch: ${headers.join(", ")}`,
  );

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(first.filePath);
  const sheet = workbook.worksheets[0]!;
  assert(sheet.rowCount === 4, `expected header + 3 data rows, got ${sheet.rowCount}`);

  const matchPercents: number[] = [];
  const dreamRows: { company: string; bold: boolean; yn: string }[] = [];
  for (let rowIndex = 2; rowIndex <= sheet.rowCount; rowIndex += 1) {
    const row = sheet.getRow(rowIndex);
    matchPercents.push(Number(row.getCell(4).value));
    const company = String(row.getCell(1).value ?? "");
    const yn = String(row.getCell(5).value ?? "");
    const bold = row.font?.bold === true;
    dreamRows.push({ company, bold, yn });
  }

  assert(
    matchPercents.join(",") === "72,45,28",
    `sort order wrong (expected 72,45,28): ${matchPercents.join(",")}`,
  );

  const googleRow = dreamRows.find((row) => row.yn === "Y");
  assert(googleRow !== undefined, "missing dream-company row");
  assert(
    googleRow.company.startsWith("★"),
    `dream company should have leading star, got: ${googleRow.company}`,
  );
  assert(googleRow.bold, "dream-company row should be bold");

  const nonDream = dreamRows.find((row) => row.yn === "N" && row.company.includes("Acme"));
  assert(nonDream !== undefined, "missing Acme row");
  assert(!nonDream.bold, "non-dream row should not be bold");
  assert(!nonDream.company.startsWith("★"), "non-dream company should not have star");

  return outDir;
}

async function verifyDistinctOutputNames(outDir: string): Promise<void> {
  const jobs: ScoredJob[] = [
    {
      ...listing("only", "Acme", "Role", 50),
      isDreamCompany: false,
    },
  ];
  const first = await writeReport(jobs, outDir);
  const second = await writeReport(jobs, outDir);
  assert(
    first.filePath !== second.filePath,
    "two writes produced the same file path",
  );
  const firstBytes = await readFile(first.filePath);
  const secondBytes = await readFile(second.filePath);
  assert(firstBytes.length > 0 && secondBytes.length > 0, "output files should be non-empty");
}

async function main(): Promise<void> {
  await verifyFilter();
  const outDir = await verifyExcelReport();
  await verifyDistinctOutputNames(outDir);
  console.log("Step 6 filtering and Excel verification passed.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
