# System under test — User Management API

This directory contains **our own implementation** of the API the six test
suites run against. It replaces the third-party image
`ghcr.io/danielsilva-loanpro/sdet-interview-challenge`, so the repository is
fully self-contained: nothing has to be pulled from someone else's registry.

Three **interchangeable** implementations of the same contract live here. They
are behaviourally identical — same endpoints, same status codes, same response
bodies, **including the same four known bugs** — so any of them can be dropped
in front of any of the six suites.

| Implementation | Path | Stack | Image build |
|----------------|------|-------|-------------|
| Node.js | [`node/`](node) | Express 4 | ~10 s |
| Python | [`python/`](python) | Flask + gunicorn | ~20 s |
| Java | [`java/`](java) | Spring Boot 3 (Maven, multi-stage) | ~2 min |

## Run one

From the repository root:

```sh
docker build -t sdet-challenge-api docker/node      # or docker/python / docker/java
docker run --rm --name sdet-challenge -p 3000:3000 sdet-challenge-api

curl http://localhost:3000/dev/users    # -> []
```

Each implementation reads:

| Variable | Default | Meaning |
|----------|---------|---------|
| `PORT` | `3000` | Listening port |
| `AUTH_TOKEN` | `mysecrettoken` | Value of the `Authentication` header required by `DELETE` |

## The contract

Spec: [`sdet_challenge_api.yml`](sdet_challenge_api.yml)
(an identical copy ships inside every exercise).

Base path is `/{env}` where `env` ∈ `dev`, `prod`. The two environments use
**separate in-memory databases**.

| Method | Path | Success | Errors |
|--------|------|---------|--------|
| GET | `/users` | `200` array of `User` | — |
| POST | `/users` | `201` `User` | `400` validation |
| GET | `/users/{email}` | `200` `User` | — (see BUG-01) |
| PUT | `/users/{email}` | `200` `User` | `400` validation, `404` not found, `409` duplicate |
| DELETE | `/users/{email}` | `204` | `401` (prod only), `404` not found |

`User` = `name` (string), `email` (string), `age` (integer 1–150), all required.

## The four replicated bugs

These are **intentional**. They are the deviations the challenge asks you to
find; every suite documents them in its `BUGS.md` and asserts the spec-correct
behaviour under `xfail`, so a pipeline stays green while the report shows the
deviation. Replicating them keeps `BUGS.md` and the `XFAIL`/`XPASS` output
truthful for *this* image.

| ID | Behaviour | Expected | Implemented |
|----|-----------|----------|-------------|
| BUG-01 | `GET /users/{email}` for an unknown email | `404` | `500` |
| BUG-02 | `POST /users` with a duplicate email | `409` | `500` |
| BUG-03 | `POST /users` with a malformed email | `400` | `201` |
| BUG-04 | `DELETE` without/with an invalid `Authentication` header | `401` | `dev`: `204` (deletes), `prod`: `401` |

Search for `BUG-0` in each implementation to find the annotated lines.

## Verified

All six suites, against **each** of the three images, `dev` and `prod`:

| Suite | Result |
|-------|--------|
| `sdet-challenge-python` | `22 passed, 5 xfailed` / prod: `22 passed, 3 xfailed, 2 xpassed` |
| `sdet-challenge-playwright` | same |
| `sdet-challenge-javascript` | `26 passed` |
| `sdet-challenge-typescript` | `28 passed` |
| `sdet-challenge-playwright-typescript` | `27 passed` |
| `sdet-challenge-java` | `22 passed` |

## Notes

- **gunicorn runs with `--workers 1`** on purpose: each worker would hold its
  own in-memory database, which would break dev/prod data isolation.
- The Java image is built in two stages (Maven → JRE), so the runtime image
  carries only the JAR.
- No registry is involved: CI builds the image from this directory and starts
  it with `docker run`, so the pipeline never depends on an external package.
