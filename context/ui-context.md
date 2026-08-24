# UI Context (Terminal/CLI)

This project has no graphical UI — it's a terminal tool. This file plays
the same role the web-app template's UI context would: the conventions
every command must follow so the CLI's output feels like one consistent
tool rather than a pile of ad hoc `console.log` calls.

## Interaction Model

- Three commands: `job-agent init` (configure provider/key/model),
  `job-agent config` (view current setup, read-only), and
  `job-agent tailor` (run the pipeline). Running `init` or `tailor` with
  no saved config falls through to the same first-run prompt `init`
  uses, then continues into the original command — the user never has to
  know `init` exists to get started. `config` is the one exception: it
  never prompts, since prompting would defeat the point of a quick,
  no-side-effects status check.
- `job-agent config` output, plain and short:
  ```
  Provider: openrouter
  Model:    anthropic/claude-sonnet-4.5
  API key:  set (sk-or-...ab12)
  Config:   ~/.job-agent/config.json
  ```
  The key is never shown in full — only enough of a prefix/suffix to
  recognize which key it is, same idea as how GitHub/Stripe show partial
  tokens. If unconfigured: a single line, `Not configured yet — run
  \`job-agent init\`.`
- `init`'s prompt flow: numbered list of the five providers (Claude,
  OpenAI, Grok, Gemini, OpenRouter) → select one → paste API key
  (masked/not echoed if the terminal supports it) → **model selection**:
  the CLI calls that provider's models-list endpoint with the key just
  entered and shows a numbered list to pick from (marking a sensible
  default, e.g. "recommended"); if the provider has no such endpoint, or
  the call fails (bad key, network issue), it falls back to a free-text
  prompt with a current default pre-filled that the user can accept or
  overwrite → confirmation line showing the provider and chosen model,
  never the key itself.
- `init --model <id>` (or a flag on the free-text fallback) lets a user
  who already knows the exact model ID they want skip the list entirely.
- All destructive/overwrite actions (re-running `init` when a config
  already exists, `tailor` about to overwrite a previous output
  directory) get a plain yes/no confirmation before proceeding.
- Re-running `init` on an already-configured provider offers to keep the
  existing key and jump straight to model re-selection, so switching
  models doesn't force re-entering an API key that hasn't changed.

## Output Conventions

- One status line per unit of work while the pipeline runs, e.g.:
  `Scoring 3/40  Acme Corp — Backend Engineer … 62%`
  `Tailoring 2/9  Acme Corp — Backend Engineer`
- A single summary block at the end of a `tailor` run: jobs scanned,
  jobs kept (with the ≥40%/dream-company split called out separately),
  output file paths.
- Errors on an individual job (e.g. one job's LLM call fails) are logged
  inline and the run continues with the rest — a single job's failure
  never aborts the whole batch. A final summary lists anything skipped
  and why.
- A hard failure (no config, bad API key, input file not found/unparseable)
  stops immediately with a one-line, specific error — no stack traces by
  default (available behind a `--verbose` flag).

## Color / Formatting

- Status lines: default terminal color. Success: green. Warnings
  (skipped job, retrying): yellow. Errors: red. Use a single small
  console-helper module for these so every command formats the same way
  — no raw ANSI codes scattered through command/lib files.
- No colors in anything written to a file (.xlsx, .md) — plain text/data
  only.

## Progress & Long-Running Work

- Because scoring and tailoring both make one LLM call per job, `tailor`
  can take a while on a large batch. Progress lines (above) are the only
  feedback mechanism — no spinner/animation dependency needed.
- `--dry-run` skips all LLM calls entirely (parsing + filtering only) so
  the user can sanity-check inputs before spending API credits, and the
  output should say plainly "DRY RUN — no LLM calls were made."
