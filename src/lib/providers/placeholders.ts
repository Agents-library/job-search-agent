export function scoreMatchPrompt(resume: string, jobDescription: string): string {
  return [
    "Score how well this resume matches the job description.",
    "Return JSON with keys: matchPercent (number 0-100), matchedSkills (string array), missingSkills (string array), rationale (short string).",
    "This is a placeholder scoring request used to verify the provider adapter.",
    "",
    "Resume:",
    resume,
    "",
    "Job description:",
    jobDescription,
  ].join("\n");
}

export function tailorResumePrompt(resume: string, jobDescription: string): string {
  return [
    "Return a Markdown resume.",
    'For this placeholder call, return the original resume text unchanged, prefixed with the line: "# Tailored resume (placeholder)".',
    "",
    "Resume:",
    resume,
    "",
    "Job description:",
    jobDescription,
  ].join("\n");
}

export const PING_PROMPT = "Reply with the single word OK.";
