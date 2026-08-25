/**
 * Fixed scoring rubric sent by every adapter's `scoreMatch()`.
 * Weights are part of the prompt, not left to per-call model discretion.
 */
export const MATCH_RUBRIC = [
  "Score how well the resume matches the job listing using this fixed rubric.",
  "Do not invent a different weighting or ignore a category.",
  "",
  "Categories (weights must sum to 100):",
  "1. Core skills / tech-stack overlap — 40%.",
  "   How well the resume's tools, languages, frameworks, and technical skills",
  "   cover the job's required stack. Only count skills evidenced in the resume.",
  "2. Experience-level fit — 20%.",
  "   Seniority, years, and scope in the resume versus the job's implied level",
  "   (intern / junior / mid / senior / staff, years required, leadership).",
  "3. Responsibilities / role overlap — 20%.",
  "   Whether the resume shows work similar to the job's day-to-day duties,",
  "   domain, and role type (not title-string matching alone).",
  "4. Keyword / ATS-term presence — 20%.",
  "   Important nouns and phrases from the job (skills, domain terms, tools,",
  "   certifications) that also appear in the resume, including close synonyms.",
  "",
  "matchPercent is the weighted sum of the four category scores, rounded to an",
  "integer from 0 to 100 (each category 0–100, then 0.4*skills + 0.2*level +",
  "0.2*responsibilities + 0.2*keywords).",
  "",
  "matchedSkills: skills/technologies required or strongly implied by the job",
  "that are evidenced in the resume. Do not list resume skills the job does not use.",
  "missingSkills: important job requirements not evidenced in the resume.",
  "rationale: two to four sentences that mention the four category scores and the total.",
  "",
  "Return ONLY a JSON object with keys:",
  "matchPercent (number 0-100), matchedSkills (string array),",
  "missingSkills (string array), rationale (string).",
].join("\n");

export function scoreMatchPrompt(resume: string, jobDescription: string): string {
  return [
    MATCH_RUBRIC,
    "",
    "Resume:",
    resume,
    "",
    "Job listing:",
    jobDescription,
  ].join("\n");
}
