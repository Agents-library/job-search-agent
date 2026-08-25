# Step 2 — Config & `init`

## Depends on

Step 1.

## Covers

- `src/types.ts`: `JobAgentConfig` (`provider`, `apiKey`, `model`) and
  the `ProviderName` union (`'claude' | 'openai' | 'grok' | 'gemini' |
  'openrouter'`). `model` is a required field once config is saved —
  see model-selection flow below.
- `src/lib/config.ts`: read/write `~/.job-agent/config.json` (restricted
  file permissions per `architecture.md`'s Storage Model), plus
  `resolveConfig()` that prefers env vars
  (`JOB_AGENT_PROVIDER`/`JOB_AGENT_API_KEY`/`JOB_AGENT_MODEL`) over the
  saved file, and returns a clear "not configured" signal (not a thrown
  error) when neither is present — the caller decides whether to prompt.
- `src/commands/init.ts`: interactive prompt per `ui-context.md`'s
  Interaction Model:
  1. Provider selection (numbered list of the five).
  2. API key entry (masked/not echoed where the terminal supports it).
  3. **Model selection** — calls the chosen adapter's `listModels()`
     (Step 3) if it implements one; presents the returned list numbered,
     with the adapter's `defaultModel` marked "(recommended)". If
     `listModels()` is unimplemented or the call fails (bad key, network
     error), falls back to a free-text prompt pre-filled with
     `defaultModel` that the user can accept as-is or overwrite.
  4. Save + confirmation line showing provider and model, never the key.
  - Re-running `init` when a config already exists offers "keep existing
    key, just re-pick model" as a shortcut (per `ui-context.md`).
  - `--model <id>` flag on `init` bypasses the list/prompt entirely for
    a user who already knows the exact model ID they want.
- First-run auto-prompt: a shared helper (e.g.
  `src/lib/ensureConfigured.ts`) that any command calls first; if
  `resolveConfig()` comes back unconfigured, it runs the same prompt flow
  as `init` (including model selection) before continuing into the
  original command. `config` deliberately does NOT call this helper —
  see below.
- `src/commands/config.ts` — read-only status command per
  `ui-context.md`'s output format: provider, model, a partially-masked
  API key (e.g. first 3 + last 4 characters, everything else replaced
  with `...`), and the config file path. Calls `readConfigFile()`
  directly (not `resolveConfig()`'s env-var-aware resolution — this
  command reports what's actually saved on disk) and never triggers the
  first-run prompt: if nothing is saved, it prints the one-line "not
  configured, run `job-agent init`" message and exits cleanly (exit code
  0 — checking config status isn't an error condition).
- Wire `init`, `config`, and the auto-prompt helper into `src/cli.ts`
  (`tailor` still a stub otherwise — Step 8 gives it real behavior).

## Does not cover

- Each adapter's actual `listModels()`/`defaultModel` implementation
  (Step 3) — this step calls that interface, Step 3 builds it. Until
  Step 3 exists, `init` can be verified against a stub adapter that
  returns a hardcoded fake list.
- `tailor`'s real pipeline.

## Verification

- [x] Fresh machine (no `~/.job-agent/`): running `job-agent init`
      prompts for provider, then key, then model, and
      `~/.job-agent/config.json` exists afterward with the right shape
      (including `model`) and restricted permissions.
- [x] Running `job-agent init` again when a config already exists asks
      for confirmation before overwriting, and offers the "keep key,
      re-pick model only" shortcut (per `ui-context.md`).
- [x] With a stub adapter whose `listModels()` throws: `init` falls back
      to the free-text prompt pre-filled with `defaultModel` instead of
      crashing.
- [x] `job-agent init --model <id>` sets that exact model without
      showing the list/prompt.
- [x] Deleting `~/.job-agent/config.json` and running `job-agent tailor`
      (still a stub) triggers the same first-run prompt before falling
      through to the stub body.
- [x] Setting `JOB_AGENT_PROVIDER`/`JOB_AGENT_API_KEY` env vars bypasses
      both the saved file and any prompt.
- [x] The API key never appears in full in any console output, log, or
      error message — including `config`'s output, which only ever shows
      a masked prefix/suffix.
- [x] `job-agent config` after a completed `init` prints the correct
      provider, model, masked key, and config path, and does not prompt
      for anything or write to the config file.
- [x] `job-agent config` on a fresh machine (no saved config) prints the
      one-line "not configured" message and exits 0 — it does NOT fall
      into the first-run prompt the way `init`/`tailor` do.
- [x] After using `init`'s "keep key, re-pick model" shortcut, `config`
      reflects the new model with the same (unchanged) masked key.
