import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";

const SUFFIXES = [
  "private limited",
  "pvt ltd",
  "inc.",
  "llc",
  "ltd",
  "inc",
];

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeCompanyName(name: string): string {
  let normalized = name.toLowerCase().replace(/\s+/g, " ").trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const suffix of SUFFIXES) {
      const next = normalized
        .replace(new RegExp(`(?:[\\s,]+)${escapeRegExp(suffix)}$`, "i"), "")
        .trim();
      if (next !== normalized) {
        normalized = next;
        changed = true;
      }
    }
  }
  return normalized.replace(/[.,]+$/g, "").trim();
}

function looksLikeHeader(value: string): boolean {
  const v = value.trim().toLowerCase();
  return (
    v === "company" ||
    v === "company name" ||
    v === "name" ||
    v === "companies" ||
    v === "dream company" ||
    v === "dream companies"
  );
}

function stripBullet(line: string): string {
  return line.replace(/^\s*[-*]\s+/, "").trim();
}

function firstCsvColumn(line: string): string {
  const trimmed = line.trim();
  if (trimmed.startsWith('"')) {
    const end = trimmed.indexOf('"', 1);
    if (end > 0) return trimmed.slice(1, end).replace(/""/g, '"').trim();
  }
  const comma = trimmed.indexOf(",");
  return (comma === -1 ? trimmed : trimmed.slice(0, comma)).trim();
}

function toSet(names: string[]): Set<string> {
  const set = new Set<string>();
  for (const name of names) {
    const normalized = normalizeCompanyName(stripBullet(name));
    if (normalized) set.add(normalized);
  }
  return set;
}

async function parseTextList(filePath: string): Promise<Set<string>> {
  const raw = stripBom(await readFile(filePath, "utf8"));
  const names = raw
    .split(/\r?\n/)
    .map((line) => stripBullet(line))
    .filter((line) => line.length > 0);
  return toSet(names);
}

async function parseCsv(filePath: string): Promise<Set<string>> {
  const raw = stripBom(await readFile(filePath, "utf8"));
  const rows = raw
    .split(/\r?\n/)
    .map(firstCsvColumn)
    .filter((cell) => cell.length > 0);
  if (rows[0] && looksLikeHeader(rows[0])) rows.shift();
  return toSet(rows);
}

async function parseXlsx(filePath: string): Promise<Set<string>> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const sheet = workbook.worksheets[0];
  if (!sheet) return new Set();
  const rows: string[] = [];
  sheet.eachRow((row) => {
    const cell = row.getCell(1);
    const text =
      typeof cell.text === "string" && cell.text.trim()
        ? cell.text
        : String(cell.value ?? "");
    if (text.trim()) rows.push(text.trim());
  });
  if (rows[0] && looksLikeHeader(rows[0])) rows.shift();
  return toSet(rows);
}

export async function parseDreamCompanies(
  filePath: string,
): Promise<Set<string>> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".md" || ext === ".txt") return parseTextList(filePath);
  if (ext === ".csv") return parseCsv(filePath);
  if (ext === ".xlsx") return parseXlsx(filePath);
  throw new Error(
    `Unsupported dream-companies format "${ext || "(none)"}". Use .md, .txt, .csv, or .xlsx.`,
  );
}

function nameTokens(normalized: string): string[] {
  return normalized.split(/[^a-z0-9]+/).filter((token) => token.length > 0);
}

function tokensContained(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0) return false;
  const set = new Set(haystack);
  return needle.every((token) => set.has(token));
}

export function isDreamCompany(
  company: string,
  dreamSet: Set<string>,
): boolean {
  const normalized = normalizeCompanyName(company);
  if (!normalized) return false;
  const companyTokens = nameTokens(normalized);
  for (const dream of dreamSet) {
    if (!dream) continue;
    if (normalized === dream) return true;
    const dreamTokens = nameTokens(dream);
    if (
      tokensContained(companyTokens, dreamTokens) ||
      tokensContained(dreamTokens, companyTokens)
    ) {
      return true;
    }
  }
  return false;
}
