import { readFile } from "node:fs/promises";
import type { JobListing } from "../../types";

const FIELD_LINE = /^- \*\*(.+?):\*\*\s*(.*)$/;
const DESCRIPTION_HEADING = /^\*\*Description:\*\*\s*(.*)$/;

const FIELD_ALIASES: Record<string, keyof JobListing> = {
  company: "company",
  "company name": "company",
  location: "location",
  posted: "postedAt",
  "posted at": "postedAt",
  "posted on": "postedAt",
  "date posted": "postedAt",
  "employment type": "employmentType",
  "job type": "employmentType",
  type: "employmentType",
  applicants: "applicants",
  "applicant count": "applicants",
  url: "url",
  link: "url",
  "job url": "url",
  "job id": "jobId",
  jobid: "jobId",
  id: "jobId",
};

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function splitListings(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/);
  const chunks: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (current) chunks.push(current);
      current = [line];
    } else if (current) {
      current.push(line);
    }
  }
  if (current) chunks.push(current);
  return chunks.map((chunk) => chunk.join("\n"));
}

function jobIdFromUrl(url: string): string | undefined {
  const match = url.match(/\/jobs\/view\/(\d+)/i);
  return match?.[1];
}

function assignField(
  listing: Partial<JobListing> & { title: string },
  key: string,
  value: string,
): void {
  const mapped = FIELD_ALIASES[key.toLowerCase().trim()];
  if (!mapped || mapped === "title") return;
  const trimmed = value.trim();
  if (!trimmed) return;
  listing[mapped] = trimmed;
}

function parseListing(chunk: string): JobListing {
  const lines = chunk.split(/\r?\n/);
  const titleLine = lines[0] ?? "";
  const title = titleLine.replace(/^##\s+/, "").trim();
  const listing: Partial<JobListing> & { title: string } = { title };

  let inDescription = false;
  const descriptionLines: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (inDescription) {
      descriptionLines.push(line);
      continue;
    }

    const heading = line.match(DESCRIPTION_HEADING);
    if (heading) {
      inDescription = true;
      if (heading[1]?.trim()) descriptionLines.push(heading[1].trim());
      continue;
    }

    const field = line.match(FIELD_LINE);
    if (field) {
      const name = field[1] ?? "";
      const value = field[2] ?? "";
      if (name.toLowerCase().trim() === "description") {
        inDescription = true;
        if (value.trim()) descriptionLines.push(value.trim());
        continue;
      }
      assignField(listing, name, value);
      continue;
    }
  }

  const description = descriptionLines.join("\n").trim();
  const url = listing.url ?? "";
  const jobId = listing.jobId || jobIdFromUrl(url) || "";

  const result: JobListing = {
    jobId,
    title,
    company: listing.company ?? "",
    location: listing.location ?? "",
    url,
    description,
  };
  if (listing.postedAt) result.postedAt = listing.postedAt;
  if (listing.employmentType) result.employmentType = listing.employmentType;
  if (listing.applicants) result.applicants = listing.applicants;
  return result;
}

export async function parseJobs(filePath: string): Promise<JobListing[]> {
  const raw = stripBom(await readFile(filePath, "utf8"));
  return splitListings(raw).map(parseListing);
}
