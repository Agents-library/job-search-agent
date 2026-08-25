export type ProviderName =
  | "claude"
  | "openai"
  | "grok"
  | "gemini"
  | "openrouter";

export interface JobAgentConfig {
  provider: ProviderName;
  apiKey: string;
  model: string;
}

export type ResolveConfigResult =
  | { configured: true; config: JobAgentConfig }
  | { configured: false };

/** Saved input paths and defaults for `tailor` (separate from LLM config). */
export interface JobAgentProfile {
  resume: string;
  dream?: string;
  out?: string;
  jobsDir?: string;
  threshold?: number;
}

export interface JobListing {
  jobId: string;
  title: string;
  company: string;
  location: string;
  postedAt?: string;
  employmentType?: string;
  applicants?: string;
  url: string;
  description: string;
}

export interface MatchResult {
  matchPercent: number;
  matchedSkills: string[];
  missingSkills: string[];
  rationale: string;
}

export interface ScoredJob {
  job: JobListing;
  match: MatchResult;
  isDreamCompany: boolean;
}

export interface LLMProvider {
  readonly defaultModel: string;
  listModels?(): Promise<string[]>;
  scoreMatch(resume: string, jobDescription: string): Promise<MatchResult>;
  tailorResume(resume: string, jobDescription: string): Promise<string>;
  ping(): Promise<void>;
}
