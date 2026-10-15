# SDET Technical Challenge — User Management API (Playwright + TypeScript)

End-to-end test suite for the **User Management API**, written in TypeScript with
**Playwright Test** and its `request` fixture (`APIRequestContext` — no browser
required), plus a GitHub Actions pipeline that runs the suite against the `dev`
and `prod` environments **in parallel**.

## What's inside

| Path | Purpose |
|------|---------|
| `tests/` | E2E test suites (users, user-by-email, validation, auth, environments) |
| `src/helpers.ts` | Base URL, payload builders, unique emails, auth headers, wait-for-API |
| `src/fixtures.ts` | Playwright fixtures: user factory with best-effort cleanup |
| `sdet_challenge_api.yml` | The authoritative OpenAPI spec |
| `playwright.config.ts` | Test runner config (API-only, JUnit + HTML reports) |
| `playwright.global-setup.ts` | Polls the API until it is reachable |
| `.github/workflows/tests.yml` | CI pipeline (parallel `dev` / `prod` jobs) |
| `BUGS.md` | Bugs found, with reproductions |
| `reports/` | Generated JUnit/HTML test reports (gitignored, uploaded as CI artifacts) |

## Prerequisites

- Docker
- Node.js 18+ and npm

## 1. Run the API under test

```sh
docker run --rm --name sdet-challenge -p 3000:3000 \
  ghcr.io/danielsilva-loanpro/sdet-interview-challenge
```

Verify it is up:

```sh
curl http://localhost:3000/dev/users     # -> []
```

## 2. Install dependencies

```sh
npm install
```

## 3. Run the tests

The suite is environment-agnostic: it reads two environment variables.

| Variable | Default | Meaning |
|----------|---------|---------|
| `BASE_URL` | `http://localhost:3000` | Host of the API |
| `ENV` | `dev` | Path prefix: `dev` or `prod` |

```sh
# dev
ENV=dev  npm run test:dev

# prod
ENV=prod npm run test:prod
```

`reports/junit.xml` and `reports/html/` are written for the HTML/JUnit reports.

No browsers are needed: the tests only exercise the API through Playwright's
`request` fixture, so `playwright install` is intentionally not required.

## 4. Known bugs

Some tests intentionally assert the **spec-correct** behaviour and currently
fail, because the application deviates from the spec. They are marked with
Playwright's `test.fail()`, which makes the run report them as **expected
failures** so the pipeline stays green while the deviation is documented and
tracked. They are also tagged `@bug`, so they can be filtered:

```sh
npx playwright test --grep @bug
```

`BUG-04` only affects `dev`; `prod` behaves correctly. Those two tests therefore
call `test.fail(ENV === "dev")` so that in `prod` they run as normal (passing)
tests. An expected-failure test that *passes unexpectedly* is reported as
`Expected to fail, but passed.` and makes the run exit `1`, which is exactly why
the annotation is conditional.

> **Reading the summary:** Playwright folds expected failures into its pass
> count. The `list`/`line` reporters print them with a `✘` mark but still finish
> with `27 passed`, and the JSON report separates them as
> `stats.expected`/`stats.unexpected` (expected failures live in `expected`). The
> HTML report labels them with status `expected`. So in this suite:
> - `ENV=dev`: 22 real passes + 5 expected failures (exit 0)
> - `ENV=prod`: 24 real passes (incl. both BUG-04 tests) + 3 expected failures (exit 0)
>
> The JUnit report (`reports/junit.xml`) records `failures="0"` in both cases.

See [`BUGS.md`](BUGS.md) for the full report.

## Design notes

- **One test = one intent** — happy paths, error conditions and auth are in
  separate, clearly named tests for a readable report.
- **No shared state** — `userFactory` creates users with unique emails and
  deletes them afterwards (via the `authHeaders` fixture), so tests are
  independent and re-runnable.
- **API-only with Playwright** — tests use Playwright's `request` fixture
  (`APIRequestContext`) with no browser for a clean, fast API testing setup.
- **Typed assertions** — responses are validated with TypeScript type guards
  (`isUser`, `isErrorResponse`) instead of just hand-written checks.
- **Environment-agnostic** — the same suite runs against `dev` and `prod`; the
  CI matrix only changes `ENV`.
- **Fail fast if the API is down** — `playwright.global-setup.ts` polls
  `GET /users` for up to 30s before the suite starts, which is what CI uses to
  wait for the service container.

## CI pipeline

`.github/workflows/tests.yml` runs a matrix job (`dev`, `prod`) with
`fail-fast: false` so a failing environment never blocks the other. The API is
started as a **service container** (`ghcr.io/danielsilva-loanpro/sdet-interview-challenge:latest`,
port `3000:3000`), Node is installed with `actions/setup-node@v4`, dependencies
are installed with `npm ci`, the suite runs with `BASE_URL`/`ENV` set, and each
job uploads the `reports/` directory (Playwright HTML + JUnit) as an artifact.
