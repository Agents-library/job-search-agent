# job-agent

Local CLI that scores scraped job listings against a resume, writes an Excel match report, and generates per-company tailored Markdown resumes. It talks to one configured LLM provider. It does not scrape job boards — feed it a Markdown file from the LinkedIn Job Scraper Chrome extension (or anything in that same format).

## Install

Requires Node.js.

```bash
npm install && npm run build
```

That compiles TypeScript to `dist/`. After that you can run without a global install:

```bash
npm run dev -- --help
node dist/cli.js --help
```

### Global usage

From the repo root, after install + build:

```bash
npm link
```

That puts `job-agent` on your PATH. Unlink later with `npm unlink -g job-agent` from this directory (or `npm unlink -g job-agent` if the package is already linked).

```
Usage: job-agent [options] [command]

Score scraped job listings against a resume and generate tailored resumes

Options:
  -V, --version     output the version number
  -h, --help        display help for command

Commands:
  init [options]    Configure (or reconfigure) the LLM provider, API key, and
                    model
  config            Print the current setup (provider, model, config path).
                    Never prints the API key in full
  profile           Set default resume, dream list, jobs folder, and output
                    paths for tailor
  tailor [options]  Score job listings against a resume, write an Excel match
                    report, and generate tailored resumes
  help [command]    display help for command
```

Config is stored at `~/.job-agent/config.json` (`provider`, `apiKey`, `model`). Default input paths for `tailor` live in `~/.job-agent/profile.json`. Environment variables `JOB_AGENT_PROVIDER`, `JOB_AGENT_API_KEY`, and `JOB_AGENT_MODEL` override the saved file when set.

## `job-agent init`

First-time setup (or reconfigure). If you run `tailor` with no saved config and no env overrides, you get the same prompt flow, then the pipeline continues.

```
Usage: job-agent init [options]

Configure (or reconfigure) the LLM provider, API key, and model

Options:
  --model <id>  Skip interactive model selection and use this model ID
  -h, --help    display help for command
```

Walkthrough:

1. Pick a provider from the numbered list: Claude, OpenAI, Grok, Gemini, OpenRouter.
2. Paste that provider's API key (masked / not echoed when the terminal supports it).
3. Choose a model. The CLI calls the provider's models-list endpoint when one exists and marks a recommended default. If listing fails or the vendor has no such endpoint, you get a free-text prompt pre-filled with that provider's default.
4. Config is saved. Confirmation prints provider and model, never the full key.

Re-running `init` when a file already exists asks before overwrite, and offers to keep the existing key and only re-pick the model.

`job-agent init --model <id>` skips the model list/prompt and writes that exact ID.

`job-agent config` is read-only: provider, model, a masked key, and the config path. It never prints the key in full and never prompts. If nothing is saved: `Not configured yet — run \`job-agent init\`.`

## `job-agent profile`

One-time setup for the files you reuse every run. Saved to `~/.job-agent/profile.json`.

```
Usage: job-agent profile

Set default resume, dream list, jobs folder, and output paths for tailor
```

Walkthrough:

1. Resume file (`.md`, `.txt`, or `.docx`).
2. Dream-companies file (optional — Enter to skip).
3. Folder to scan for job Markdown files (default: `~/Downloads`).
4. Output directory (default: `./output`).
5. Match threshold (default: `40`).

Re-running `profile` shows the current values and asks before updating.

## `job-agent tailor`

Score listings, filter, write Excel, then tailor resumes for jobs that survive.

```
Usage: job-agent tailor [options]

Score job listings against a resume, write an Excel match report, and generate
tailored resumes

Options:
  --jobs <path>      Path to the job-scan Markdown file, or `latest` for the
                     newest `.md` in your profile jobs folder
  --resume <path>    Path to the resume (.md or .docx); uses profile when omitted
  --dream <path>     Path to the dream-companies list (omit to skip the
                     dream-company override)
  --out <dir>        Output directory (default: profile or `./output`)
  --threshold <n>    Minimum match percentage to keep a job (default: profile or
                     `40`)
  --concurrency <n>  Max concurrent LLM calls (default: "3")
  --dry-run          Parse and filter only; skip all LLM calls
  -y, --yes          Skip the pre-flight confirmation prompt
  --verbose          Show stack traces on error
  --model <id>       Override the configured model for this run
  -h, --help         display help for command
```

### Happy path (after `init` + `profile`)

```bash
job-agent tailor
```

Picks the newest job scan from your jobs folder, uses saved resume/dream/output paths, shows a pre-flight summary, then runs. Answer `dry-run` at the prompt to parse and filter without LLM calls.

Weekly run with an explicit scan file:

```bash
job-agent tailor --jobs latest
# or
job-agent tailor --jobs ~/Downloads/linkedin-jobs.md
```

### Full example (all flags, no profile needed)

```bash
job-agent tailor --jobs ./fixtures/parsers/jobs.md --resume ./fixtures/parsers/resume.md --dream ./fixtures/parsers/dream.md
```

Dry run (no LLM calls; Excel still written; tailored resumes skipped):

```bash
job-agent tailor --jobs ./fixtures/parsers/jobs.md --resume ./fixtures/parsers/resume.md --dream ./fixtures/parsers/dream.md --dry-run
```

Inputs:

- `--jobs`: Markdown in the Chrome extension format (`## title`, field lines, description).
- `--resume`: `.md` / `.txt` as text, or `.docx` via mammoth.
- `--dream` (optional): `.md` / `.txt` (one company per line, optional `-`/`*` bullets), `.csv` (first column), or `.xlsx` (first column of the first sheet; a header row is skipped). Omit `--dream` to skip the dream-company override.

Outputs (under `--out`, default `./output`):

- `match-report-<timestamp>.xlsx` — kept jobs, sorted by match % descending. Dream-company rows are bold with a leading ★ on the company name. Re-runs use a new timestamped filename.
- One tailored resume per surviving job: `<company-slug>-<role-slug>.md` (a job-id suffix is added only if two jobs in the same run would collide).

`--model` on `tailor` overrides the configured model for that run only (same idea as the `model` field in config).

## Filter logic (40% + dream companies)

Every job is scored 0–100 against a fixed rubric (skills 40%, experience-level 20%, responsibilities 20%, keyword/ATS terms 20%).

Jobs kept:

- Every listing whose company matches the dream list, **regardless of score**.
- Every other listing whose match percent is **at or above** `--threshold` (default **40**).

Dream-company matching is case-insensitive, trims Inc / Inc. / LLC / Ltd / Pvt Ltd / Private Limited, then requires complete token containment in either direction (not raw substring). Example: "Google" matches "Google India Private Limited"; a dream entry of "Meta" does not match "Metasoft".

`--dry-run` does not score. It keeps dream-company matches only and prints `DRY RUN — no LLM calls were made.` Non-dream jobs need a real run to be scored against the threshold.

## No-fabrication (and its limits)

Tailoring is instructed never to invent or imply employers, titles, dates, skills, tools, achievements, degrees, certifications, metrics, or seniority that are not already in the source resume. Gaps in the resume stay gaps.

That is a **prompt-level constraint**, not a formal guarantee. Models can still drift. Review every generated resume before sending it.

## Supported providers

| Provider   | Config name  | API key |
| ---------- | ------------ | ------- |
| Claude     | `claude`     | [Anthropic Console](https://console.anthropic.com/settings/keys) |
| OpenAI     | `openai`     | [OpenAI API keys](https://platform.openai.com/api-keys) |
| Grok       | `grok`       | [xAI Console](https://console.x.ai/) |
| Gemini     | `gemini`     | [Google AI Studio](https://aistudio.google.com/apikey) |
| OpenRouter | `openrouter` | [OpenRouter keys](https://openrouter.ai/keys) |

Each adapter has a suggested default used only as a recommendation during `init` (or as a fallback if no model is stored). Vendor catalogs change. **`--model` on `init` / `tailor`, and the saved config `model` field, override that per-provider default** if a vendor ships a newer model later. Prefer picking from the live list in `init` when the provider exposes one.
