import { mkdir } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import type { ScoredJob } from "../../types";

const COLUMNS = [
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
] as const;

const DREAM_STAR = "★ ";

function formatReportTimestamp(date: Date = new Date()): string {
  const iso = date.toISOString().replace(/[:.]/g, "-");
  return iso.slice(0, 23);
}

function joinSkills(skills: string[]): string {
  return skills.join(", ");
}

function sortByMatchDescending(jobs: ScoredJob[]): ScoredJob[] {
  return [...jobs].sort(
    (a, b) => b.match.matchPercent - a.match.matchPercent,
  );
}

export interface WriteReportResult {
  filePath: string;
  rowCount: number;
}

/**
 * Writes a timestamped match-report .xlsx to `outDir`. Rows are sorted by
 * Match % descending; dream-company rows are bold with a leading star on Company.
 */
export async function writeReport(
  jobs: ScoredJob[],
  outDir: string,
): Promise<WriteReportResult> {
  await mkdir(outDir, { recursive: true });

  const filename = `match-report-${formatReportTimestamp()}.xlsx`;
  const filePath = path.join(outDir, filename);
  const sorted = sortByMatchDescending(jobs);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Match Report");

  sheet.columns = COLUMNS.map((header) => ({
    header,
    key: header,
    width: header === "Rationale" ? 48 : header === "URL" ? 36 : 18,
  }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };

  for (const row of sorted) {
    const dream = row.isDreamCompany;
    const company = dream ? `${DREAM_STAR}${row.job.company}` : row.job.company;
    const dataRow = sheet.addRow({
      Company: company,
      Title: row.job.title,
      Location: row.job.location,
      "Match %": row.match.matchPercent,
      "Dream Company (Y/N)": dream ? "Y" : "N",
      "Matched Skills": joinSkills(row.match.matchedSkills),
      "Missing Skills": joinSkills(row.match.missingSkills),
      Rationale: row.match.rationale,
      Posted: row.job.postedAt ?? "",
      URL: row.job.url,
      "Job ID": row.job.jobId,
    });
    if (dream) {
      dataRow.font = { bold: true };
    }
  }

  await workbook.xlsx.writeFile(filePath);

  return { filePath, rowCount: sorted.length };
}
