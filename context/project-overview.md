# job-agent (Resume Match & Tailor CLI)

## Overview

A standalone command-line tool that runs on Anshul's own machine. It takes
three local files — a job-listings Markdown file (produced by the LinkedIn
Job Scraper Chrome extension), a resume (Markdown or .docx), and a
"dream companies" list — and produces two things: an Excel report scoring
how well the resume matches each job description, and a set of tailored
Markdown resumes, one per company worth applying to. It calls an LLM API
using Anshul's own key (any of: Claude, OpenAI, Grok, Gemini, or
OpenRouter) to do the semantic matching and tailoring. No server, no
database, no deployment — it's a local tool invoked from a terminal.

## Goals

1. Score every scraped job against the resume without Anshul having to
   read each description by hand.
2. Never let a dream-company listing get filtered out for scoring low —
   dream companies always make the report, everything else needs ≥40% match.
3. Produce ready-to-review tailored resumes for every company that makes
   the cut, without inventing any experience, skill, employer, or date not
   already present in the source resume.
4. Work with whatever LLM API key Anshul already has — don't lock him into
   one vendor.
5. Ship as a lightweight CLI: `npm install && npm run build`, run from any
   terminal, output lands in plain files (.xlsx, .md) he can open normally.

## Core User Flow

1. First time only: Anshul runs the CLI. No saved config is found, so it
   walks him through picking a provider (Claude / OpenAI / Grok / Gemini /
   OpenRouter) and pasting that provider's API key. The key is saved
   locally so this never happens again unless he explicitly reconfigures.
2. Separately, Anshul runs the LinkedIn Job Scraper extension, which saves
   a Markdown file of scraped listings to his Downloads folder.
3. Anshul runs `job-agent tailor --jobs <path> --resume <path> --dream <path>`.
4. The CLI parses all three inputs, then asks the configured LLM to score
   the resume against every job description (skills/experience/keyword
   fit, 0–100%).
5. It filters the results: keep anything ≥40% match, plus every listing
   from a company on the dream list regardless of score. Writes this to
   an Excel file.
6. For every row that survived the filter, it asks the LLM to produce a
   tailored version of the resume — same underlying facts, reordered and
   rephrased to speak to that job's language — and saves each as its own
   Markdown file.
7. Anshul reviews the Excel report and the tailored resumes, and applies.

## Features

### Setup

- First-run auto-prompt for provider + API key (no separate "remember to
  configure" step).
- **Model choice, not just provider choice**: after the key is entered,
  the CLI asks which model to use. Where the provider has a "list
  models" API, it fetches the live list with the key just entered and
  lets Anshul pick from it, so the choice always reflects what's actually
  available today rather than a hardcoded, potentially stale list.
  Where a provider has no such endpoint, it falls back to free-text entry
  with a sensible current default pre-filled as a suggestion.
- `job-agent init` to explicitly (re)configure the provider/key/model
  later, e.g. to switch models without re-entering the API key.
- `job-agent config` to view the current setup (provider, model, config
  file location) without changing anything — read-only, never prints the
  key itself.
- Config stored locally, never transmitted anywhere but the chosen
  provider's own API.

### Input parsing

- Job-scan Markdown parser matching the format the Chrome extension writes
  (title / company / location / description / etc. per listing).
- Resume parser: Markdown read directly; .docx converted to text.
- Dream-companies list parser: Markdown/plain-text list, or a spreadsheet
  column (.csv/.xlsx).

### Matching and reporting

- LLM-based match scoring against a fixed rubric (skills/tech fit,
  experience-level fit, responsibilities overlap, keyword/ATS terms),
  returning a percentage plus matched/missing skills and a short rationale.
- Dream-company detection (case/format-insensitive) that overrides the
  score filter.
- Excel report of everything that survives filtering, sorted by match %.

### Tailoring

- Per-company tailored resume generation with an explicit no-fabrication
  rule enforced in the prompt.
- One Markdown file per company/role, clearly named.

### Operability

- `--dry-run` mode that does parsing + filtering without spending API
  calls, so the pipeline can be sanity-checked before burning credits.
- Progress output per job while scoring/tailoring runs.

## Scope

### In Scope

- The CLI itself: config, parsing, LLM calls, Excel + Markdown output.
- Support for five LLM providers behind one common interface.
- Local file I/O only.

### Out of Scope

- Scraping LinkedIn/Naukri — that's the separate Chrome extension, already
  built. This CLI only ever reads a Markdown file it's handed.
- Any GUI — terminal only.
- Scheduling/cron/automatic runs — Anshul runs it manually each time.
- Submitting applications on Anshul's behalf.
- A database or any persistent job history beyond the config file and
  whatever output files land in the output directory.
- Aggregating jobs from official job-board APIs (Adzuna/JSearch) — that
  was part of an earlier, broader version of the job-search-agent concept
  and is not part of this CLI's scope unless Anshul asks for it later.

## Success Criteria

1. `job-agent init` (or the first-run prompt) successfully stores a
   working key *and a chosen model* for any of the five supported
   providers, and later runs pick both up without re-prompting.
2. Running `job-agent tailor` against a real job-scan file and resume
   produces an .xlsx where the filter logic is correct: dream companies
   present regardless of score, everything else only if ≥40%.
3. Every generated tailored resume is traceable to real content in the
   source resume — no invented employers, titles, dates, or skills.
4. The whole pipeline runs end-to-end from the extension's output file to
   final tailored resumes with no manual editing of intermediate files.
