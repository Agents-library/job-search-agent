# Step 3 — Provider Adapters

## Depends on

Step 2 (needs `ProviderName` and resolved config to know which adapter
to instantiate and with which key).

## Covers

- `src/types.ts`: the `LLMProvider` interface — at minimum:
  - `scoreMatch(resume: string, jobDescription: string): Promise<MatchResult>`
  - `tailorResume(resume: string, jobDescription: string): Promise<string>`
  - `listModels?(): Promise<string[]>` — optional; implemented only by
    adapters whose vendor exposes a models-list endpoint.
  - `defaultModel: string` — required on every adapter; used as the
    pre-filled suggestion when `listModels()` is absent or fails, and as
    the fallback when config has no `model` set (e.g. an old config
    written before this feature existed — see Verification).
  - All of the above hide the vendor's request/response shape entirely
    from the caller — see `architecture.md` Invariant 2 (and Invariant 7
    for the model-selection contract specifically).
- `src/lib/providers/retry.ts` — shared retry/backoff helper for rate
  limits and transient errors, used by every adapter (per
  `code-standards.md`).
- One file per vendor, each implementing `LLMProvider`:
  - `src/lib/providers/claude.ts` (Anthropic Messages API, tool-call for
    structured `scoreMatch` output; `listModels()` via Anthropic's
    models-list endpoint)
  - `src/lib/providers/openai.ts` (Chat Completions or Responses API,
    JSON mode / function-calling for structured output; `listModels()`
    via OpenAI's `/models` endpoint, filtered to chat-capable models)
  - `src/lib/providers/grok.ts` (xAI's OpenAI-compatible API surface;
    `listModels()` via its OpenAI-compatible `/models` endpoint if
    available, otherwise omit `listModels` and rely on `defaultModel`)
  - `src/lib/providers/gemini.ts` (Google Generative Language API;
    `listModels()` via its `ListModels` endpoint, filtered to models
    supporting `generateContent`)
  - `src/lib/providers/openrouter.ts` (OpenAI-compatible surface;
    `listModels()` via OpenRouter's own `/models` endpoint — this one
    can return a *lot* of models, so the `init` list should support
    typing to filter rather than scrolling a huge numbered list)
  - Every adapter defines its own `defaultModel` constant. Model choice
    made by the user during `init` (Step 2) is what actually gets saved
    to config and used at runtime — `defaultModel` is only ever a
    fallback/suggestion, never silently substituted for a user's choice.
    This resolves progress-tracker.md's earlier open question about
    model drift going stale: because the list is fetched live where
    possible, the adapter's hardcoded `defaultModel` only needs to be
    "reasonable," not "current" — it's a suggestion, not the source of
    truth.
- `src/lib/providers/index.ts` — the single place that maps
  `ProviderName` → adapter instance. No other file switches on provider
  name.
- A minimal connectivity check method (e.g. `ping()`) on each adapter,
  used only for manual verification in this step — a trivial "say OK"
  call, not the real scoring/tailoring prompts (those are Steps 5 and 7).

## Does not cover

- The actual matching rubric prompt or tailoring prompt content — this
  step proves each adapter can round-trip a request/response and produce
  a structurally valid `MatchResult`/string, using placeholder prompts if
  needed. Real prompt design is Steps 5 and 7.

## Verification

- [ ] For each of the five providers, with a real key for at least the
      one(s) Anshul actually has: `ping()` returns successfully.
- [ ] For each provider implementing `listModels()`: returns a non-empty
      list of real, currently-available model IDs (spot-check one or two
      against the vendor's own docs/console).
- [ ] For a provider *not* implementing `listModels()` (or one where the
      call is deliberately made to fail, e.g. bad key): the adapter
      exposes `defaultModel` and the caller (Step 2's `init`) falls back
      to free-text cleanly rather than crashing.
- [ ] OpenRouter's list (likely large) doesn't make the `init` flow
      unusable — confirm the filtering/typing UX actually helps rather
      than just dumping hundreds of lines to the terminal.
- [ ] Swapping providers only requires changing config — no code path
      outside `src/lib/providers/` differs by provider.
- [ ] A deliberately invalid API key produces a clear, provider-labeled
      error (not a stack trace), without ever printing the key.
- [ ] Adding a hypothetical sixth provider is possible by adding exactly
      one new file plus one line in `providers/index.ts` — confirm by
      reading through the interface, don't need to actually build one.
