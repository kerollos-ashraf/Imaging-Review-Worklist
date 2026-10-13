# 01: Project Setup

**Goal:** A reproducible TypeScript monorepo with Postgres available locally via one command.

## Deliverables
- Layout:
  ```
  /apps/api        Express + TS
  /apps/web        React + TS (Vite)
  /samples         gradient.dcm, checkerboard.dcm, corrupt.dcm (supplied fixtures, used as-is)
  /SubTasks
  docker-compose.yml   postgres:16
  package.json         npm workspaces
  .env.example
  ```
- `docker-compose.yml`: Postgres (with a named volume so data survives restarts). A local Postgres also works by overriding `DATABASE_URL`. Add a separate `*_test` database (init script or `createdb` in the setup script).
- TypeScript `strict: true` in both apps, plus `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`, `noFallthroughCasesInSwitch`.
- **ESLint strict** (flat config `eslint.config.mjs`, shared at the root, extended per app):
  - `typescript-eslint`: `strictTypeChecked` + `stylisticTypeChecked` (needs `parserOptions.projectService: true`).
  - API: `eslint-plugin-boundaries` (or `dependency-cruiser`) enforcing: controllers -> services -> interfaces; `services/` and `domain/` may not import `express` or `pg`; only `container.ts` may import concrete repositories.
  - Web: `eslint-plugin-react`, `react-hooks` (`rules-of-hooks`, `exhaustive-deps` as **error**), `jsx-a11y` (`strict`).
  - Extra rules: `@typescript-eslint/no-explicit-any`, `no-floating-promises`, `no-misused-promises`, `consistent-type-imports`, `no-console` (error; use the logger), `eqeqeq`, `complexity` (max 10), `max-lines-per-function` (60).
  - Lint runs with `--max-warnings 0`. Script: `lint`. Prettier handles formatting only (`eslint-config-prettier`).
- Libraries:
  - API: `express`, `pg`, `zod`, `node-pg-migrate`, `pino` (with redaction), `jest`, `ts-jest`, `@types/jest`, `supertest`, `tsx`.
  - Web: `react`, `react-dom`, `vite`, `@cornerstonejs/core`, `@cornerstonejs/dicom-image-loader`, `dicom-parser` (peer of the loader), `jest`, `ts-jest`, `jest-environment-jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `@playwright/test`.
- **Test runners:** Jest for API and React unit/component tests. Browser tests (11, 12) use the `@playwright/test` runner because it owns browser/fixture orchestration; do not try to run them under Jest.
- Jest config notes: API project uses `testEnvironment: 'node'` and DB suites run with `--runInBand` (shared test DB); web project uses `jsdom`. Do not use `import.meta` in code that Jest compiles (see 09).
- Env vars (`.env.example`): `DATABASE_URL`, `TEST_DATABASE_URL`, `PORT`, `FIXTURES_DIR` (default `samples`).
- Root scripts (names are fixed so the README can reference them):
  `db:up`, `db:migrate`, `db:seed`, `db:reset`, `dev:api`, `dev:web`, `test:api`, `test:web`, `test:e2e`, `test:contention`, `test`.

## Acceptance criteria
- [ ] `npm install` then `npm run db:up` starts Postgres.
- [ ] Both apps compile with `tsc --noEmit` in strict mode.
- [ ] The three fixture files are committed under `/samples` (not gitignored).
- [ ] Logger redacts anything resembling DICOM tags (no raw tag logging anywhere).
