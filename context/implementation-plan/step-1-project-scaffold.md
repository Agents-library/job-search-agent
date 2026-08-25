# Step 1 — Project Scaffold

## Depends on

Nothing — this is the starting point.

## Covers

- `package.json` — name `job-agent`, bin entry, scripts (`build`, `dev`),
  dependencies per `architecture.md`'s Stack table (commander, exceljs,
  mammoth — provider SDKs are NOT added here, see Step 3) plus dev deps
  (`typescript`, `@types/node`, `tsx`).
- `tsconfig.json` — strict mode per `code-standards.md`.
- Folder structure per `architecture.md`'s System Boundaries:
  `src/commands/`, `src/lib/providers/`, `src/lib/parsers/`,
  `src/lib/match/`, `src/lib/tailor/`, `src/lib/excel/`, `src/types.ts`.
- `src/cli.ts` — Commander entrypoint registering `init`, `config`, and
  `tailor` as empty stub commands (each just prints "not implemented
  yet").
- `.gitignore` (`node_modules/`, `dist/`).

## Does not cover

- Any real logic in `init` or `tailor` — those are stubs here.
- Config storage (Step 2).
- Any provider code (Step 3).

## Verification

- [x] `npm install` succeeds.
- [x] `npm run build` succeeds with zero TypeScript errors.
- [x] `node dist/cli.js --help` lists `init`, `config`, and `tailor` with
      their intended flags documented (flags can be accepted and ignored
      at this stage, but `--help` output should already look like the
      final CLI).
- [x] `node dist/cli.js init`, `node dist/cli.js config`, and
      `node dist/cli.js tailor` all run without crashing (stub output
      only).
