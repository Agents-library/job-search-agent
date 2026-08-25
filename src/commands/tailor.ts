import { Command } from "commander";
import { ensureConfigured } from "../lib/ensureConfigured";

export function registerTailor(program: Command): void {
  program
    .command("tailor")
    .description(
      "Score job listings against a resume, write an Excel match report, and generate tailored resumes",
    )
    .option("--jobs <path>", "Path to the job-scan Markdown file")
    .option("--resume <path>", "Path to the resume (.md or .docx)")
    .option(
      "--dream <path>",
      "Path to the dream-companies list (omit to skip the dream-company override)",
    )
    .option("--out <dir>", "Output directory", "./output")
    .option("--threshold <n>", "Minimum match percentage to keep a job", "40")
    .option("--concurrency <n>", "Max concurrent LLM calls", "3")
    .option("--dry-run", "Parse and filter only; skip all LLM calls")
    .option("--verbose", "Show stack traces on error")
    .option("--model <id>", "Override the configured model for this run")
    .action(async () => {
      await ensureConfigured();
      console.log("not implemented yet");
    });
}
