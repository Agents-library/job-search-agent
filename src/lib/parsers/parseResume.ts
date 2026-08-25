import { readFile } from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";

function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

export async function parseResume(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".md" || ext === ".txt") {
    return stripBom(await readFile(filePath, "utf8")).trim();
  }
  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value.replace(/\r\n/g, "\n").trim();
  }
  throw new Error(
    `Unsupported resume format "${ext || "(none)"}". Use .md, .txt, or .docx.`,
  );
}
