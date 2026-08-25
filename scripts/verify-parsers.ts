import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import {
  isDreamCompany,
  parseDreamCompanies,
} from "../src/lib/parsers/parseDreamCompanies";
import { parseJobs } from "../src/lib/parsers/parseJobs";
import { parseResume } from "../src/lib/parsers/parseResume";

const FIXTURES = path.join(__dirname, "..", "fixtures", "parsers");

function crc32(data: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i]!;
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return ~crc >>> 0;
}

function zipStore(entries: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x21, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    const localFile = Buffer.concat([local, name, entry.data]);
    locals.push(localFile);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x21, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(Buffer.concat([central, name]));
    offset += localFile.length;
  }
  const centralDir = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDir, eocd]);
}

function paragraph(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<w:p><w:r><w:t xml:space="preserve">${escaped}</w:t></w:r></w:p>`;
}

async function writeResumeDocx(): Promise<string> {
  const body = [
    paragraph("Anshul Madnawat"),
    paragraph(
      "Software engineer with experience in TypeScript, Node.js, and data pipelines. Built internal tooling for matching and reporting.",
    ),
    paragraph("Experience"),
    paragraph("Built CLI tools in TypeScript"),
    paragraph("Worked with Excel and Markdown pipelines"),
  ].join("");
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  const buf = zipStore([
    { name: "[Content_Types].xml", data: Buffer.from(contentTypes, "utf8") },
    { name: "_rels/.rels", data: Buffer.from(rels, "utf8") },
    { name: "word/document.xml", data: Buffer.from(documentXml, "utf8") },
  ]);
  const out = path.join(FIXTURES, "resume.docx");
  await writeFile(out, buf);
  return out;
}

async function writeDreamXlsx(): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Companies");
  sheet.addRow(["Company"]);
  for (const name of [
    "Google",
    "Meta",
    "Microsoft Inc.",
    "Amazon LLC",
    "OpenAI",
  ]) {
    sheet.addRow([name]);
  }
  const out = path.join(FIXTURES, "dream.xlsx");
  await workbook.xlsx.writeFile(out);
  return out;
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

async function main(): Promise<void> {
  await mkdir(FIXTURES, { recursive: true });
  const docxPath = await writeResumeDocx();
  const xlsxPath = await writeDreamXlsx();

  const jobs = await parseJobs(path.join(FIXTURES, "jobs.md"));
  assert(jobs.length === 3, `expected 3 listings, got ${jobs.length}`);

  const google = jobs[0]!;
  assert(google.title === "Software Engineer, Search", google.title);
  assert(google.company === "Google", google.company);
  assert(google.location === "Bengaluru, India", google.location);
  assert(google.postedAt === "2 days ago", String(google.postedAt));
  assert(google.employmentType === "Full-time", String(google.employmentType));
  assert(google.applicants === "187", String(google.applicants));
  assert(
    google.url === "https://www.linkedin.com/jobs/view/1234567890",
    google.url,
  );
  assert(google.jobId === "1234567890", google.jobId);
  assert(
    google.description.includes("distributed systems"),
    google.description,
  );

  const microsoft = jobs[1]!;
  assert(microsoft.company === "Microsoft Inc.", microsoft.company);
  assert(microsoft.jobId === "9876543210", microsoft.jobId);

  const partial = jobs[2]!;
  assert(partial.title === "Data Analyst", partial.title);
  assert(partial.company === "Acme Analytics", partial.company);
  assert(partial.postedAt === undefined, "partial listing should omit postedAt");
  assert(
    partial.employmentType === undefined,
    "partial listing should omit employmentType",
  );
  assert(
    partial.applicants === undefined,
    "partial listing should omit applicants",
  );
  assert(partial.jobId === "5550001111", "jobId should fall back from URL");
  assert(partial.description.includes("SQL required"), partial.description);

  const mdResume = await parseResume(path.join(FIXTURES, "resume.md"));
  const docxResume = await parseResume(docxPath);
  assert(mdResume.includes("TypeScript"), mdResume);
  assert(docxResume.includes("TypeScript"), docxResume);
  assert(mdResume.includes("Anshul Madnawat"), mdResume);
  assert(docxResume.includes("Anshul Madnawat"), docxResume);
  assert(!mdResume.includes("<w:"), mdResume);
  assert(!docxResume.includes("<w:"), docxResume);

  const fromMd = await parseDreamCompanies(path.join(FIXTURES, "dream.md"));
  const fromCsv = await parseDreamCompanies(path.join(FIXTURES, "dream.csv"));
  const fromXlsx = await parseDreamCompanies(xlsxPath);
  const expected = new Set([
    "google",
    "meta",
    "microsoft",
    "amazon",
    "openai",
  ]);
  assert(sameSet(fromMd, expected), `md set mismatch: ${[...fromMd]}`);
  assert(sameSet(fromCsv, expected), `csv set mismatch: ${[...fromCsv]}`);
  assert(sameSet(fromXlsx, expected), `xlsx set mismatch: ${[...fromXlsx]}`);
  assert(sameSet(fromMd, fromCsv) && sameSet(fromCsv, fromXlsx), "sets differ");

  assert(
    isDreamCompany("Google India Private Limited", fromMd),
    "Google India Private Limited should match Google",
  );
  assert(
    isDreamCompany("Google India Pvt Ltd", fromMd),
    "Google India Pvt Ltd should match Google",
  );
  assert(isDreamCompany("Microsoft", fromMd), "Microsoft should match");
  assert(
    !isDreamCompany("Acme Analytics", fromMd),
    "Acme should not match dream set",
  );

  const metaFalsePositive = isDreamCompany("Metasoft", fromMd);
  console.log(
    `isDreamCompany("Metasoft", set-with-Meta) = ${metaFalsePositive} (substring over-match risk)`,
  );
  assert(
    metaFalsePositive === false,
    'isDreamCompany("Metasoft") must be false when the dream set contains Meta',
  );

  console.log("Step 4 parser verification passed.");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
