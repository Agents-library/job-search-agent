# Step 9 — Packaging & Docs

## Depends on

Step 8 (the tool must actually work end to end before documenting it as
finished).

## Covers

- `README.md` at the project root: install (`npm install && npm run
  build`), global usage (`npm link` or equivalent), `job-agent init`
  walkthrough, `job-agent tailor` usage with all flags, an explanation of
  the 40%/dream-company filter logic, and an explicit note on the
  no-fabrication guarantee for tailored resumes (and its limits — it's a
  prompt-level constraint, not a formal guarantee; Anshul should still
  review before sending).
- A short "supported providers" section listing all five, how to get an
  API key for each (link out, don't reproduce vendor docs), and that
  `--model` / config `model` overrides the per-provider default if a
  vendor ships a newer model later.
- Final `progress-tracker.md` update: Current Phase → Complete (or
  wherever it actually lands), all steps moved to Completed, Open
  Questions resolved or explicitly carried forward as known limitations.

## Does not cover

- Any new functionality — this step is documentation and a final
  progress-tracker pass only.

## Verification

- [ ] Following the README from a clean checkout (or close to it —
      delete `node_modules`/`dist` and redo install/build) produces a
      working `job-agent` command with no undocumented steps.
- [ ] Every flag from Step 8 is documented in the README and matches
      `--help` output exactly.
- [ ] `progress-tracker.md` accurately reflects the finished state — no
      stale "Not started"/"Next Up" content left over from Step 1.
