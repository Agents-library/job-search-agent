/**
 * Shared tailoring prompt used by every adapter's `tailorResume()`.
 * Architecture.md Invariant 3 — the no-fabrication rule lives here, not
 * as a per-provider or per-call preference.
 */
export const TAILOR_INSTRUCTIONS = [
  "Rewrite the source resume as a Markdown resume tailored to this job.",
  "Reorder, rephrase, and emphasize truthful content already present in the",
  "source resume so it matches the job description's language and priorities.",
  "",
  "Hard constraints (never violate):",
  "- Never invent or imply an employer, title, date range, skill, tool, or",
  "  achievement that is not already present in the source resume text.",
  "- Do not add degrees, certifications, metrics, locations, or technologies",
  "  that are not in the source.",
  "- Do not upgrade seniority, invent leadership, or imply experience at the",
  "  target company.",
  "- Close synonyms are allowed only when they describe the same fact already",
  "  in the source (e.g. 'JS' → 'JavaScript' if JavaScript/JS is evidenced).",
  "- If the job asks for something the resume does not show, omit it — do not",
  "  fill the gap.",
  "",
  "Return ONLY the tailored Markdown resume. No preamble, no commentary,",
  "no list of changes.",
].join("\n");

export function tailorResumePrompt(resume: string, jobDescription: string): string {
  return [
    TAILOR_INSTRUCTIONS,
    "",
    "Source resume:",
    resume,
    "",
    "Job listing:",
    jobDescription,
  ].join("\n");
}
