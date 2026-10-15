# Bugs discovered

Testing the **User Management API** against the OpenAPI spec (`sdet_challenge_api.yml`)
revealed the following discrepancies. Each bug has a test that reproduces it; the
tests are tagged `@bug` and marked with Playwright's `test.fail()` (which reports
them as expected failures) so the pipeline stays green while the report and this
file document the deviation.

Reproduction was done against the API image built from `docker/node`
on `http://localhost:3000`.

---

## BUG-01 — `GET /users/{email}` returns 500 for an unknown user instead of 404

- **Endpoint:** `GET /{env}/users/{email}`
- **Expected (spec):** `404` with an `ErrorResponse`
- **Actual:** `500 Internal server error`
- **Environments:** `dev` and `prod`
- **Impact:** any "not found" lookup surfaces as a server error; callers cannot
  distinguish a missing user from a real outage, and error monitoring is polluted.
- **Reproduction:**
  ```sh
  curl -i http://localhost:3000/dev/users/nobody@example.com
  # HTTP/1.1 500 INTERNAL SERVER ERROR -> {"error": "Internal server error"}
  ```
- **Tests:** `tests/userByEmail.spec.ts` → `GET an unknown email returns 404`

---

## BUG-02 — `POST /users` with a duplicate email returns 500 instead of 409

- **Endpoint:** `POST /{env}/users`
- **Expected (spec):** `409` with an `ErrorResponse`
- **Actual:** `500 Internal server error`
- **Environments:** `dev` and `prod`
- **Impact:** clients cannot detect a duplicate-email conflict; the unique
  constraint violation leaks as an unhandled server error.
- **Note / inconsistency:** `PUT /users/{email}` to an existing email **does**
  correctly return `409`, so the same validation is handled differently between
  create and update.
- **Reproduction:**
  ```sh
  curl -s -X POST http://localhost:3000/dev/users -H "Content-Type: application/json" \
    -d '{"name":"A","email":"dup@example.com","age":30}'   # 201
  curl -s -X POST http://localhost:3000/dev/users -H "Content-Type: application/json" \
    -d '{"name":"B","email":"dup@example.com","age":31}'   # 500, expected 409
  ```
- **Tests:** `tests/users.spec.ts` → `creating a user with a duplicate email returns 409`

---

## BUG-03 — `POST /users` accepts a malformed email (no format validation)

- **Endpoint:** `POST /{env}/users`
- **Expected (spec):** `400` validation error for an invalid email format
  (`User.email` is declared `format: email`)
- **Actual:** `201` — the user is created with `email: "not-an-email"`
- **Environments:** `dev` and `prod`
- **Impact:** invalid data enters the system and can break downstream consumers
  that assume valid email addresses.
- **Reproduction:**
  ```sh
  curl -s -X POST http://localhost:3000/dev/users -H "Content-Type: application/json" \
    -d '{"name":"A","email":"not-an-email","age":30}'      # 201, expected 400
  ```
- **Tests:** `tests/validation.spec.ts` → `POST a malformed email returns 400`

---

## BUG-04 — `dev` does not enforce authentication on `DELETE` (inconsistent with `prod`)

- **Endpoint:** `DELETE /{env}/users/{email}`
- **Expected (spec):** `401` when the `Authentication` header is missing or invalid
- **Actual (dev):** `204` — the user is deleted with **no** header (or an invalid
  token). `prod` behaves correctly and returns `401`.
- **Environments:** `dev` only (`prod` is correct)
- **Impact:** this is the most serious finding. In `dev` the endpoint is
  unprotected: anyone can delete users. It also means the two environments are
  **not** behaviourally identical, contradicting the spec's promise of
  "identical behavior" under `/dev` and `/prod`, so a bug can pass in one
  environment and fail in the other.
- **Reproduction:**
  ```sh
  # dev: deletes without auth
  curl -i -X DELETE http://localhost:3000/dev/users/dup@example.com
  # HTTP/1.1 204 NO CONTENT   <- expected 401

  # prod: correctly protected
  curl -i -X DELETE http://localhost:3000/prod/users/dup@example.com
  # HTTP/1.1 401 UNAUTHORIZED -> {"error": "Authentication required"}
  ```
- **Tests:** `tests/auth.spec.ts` → `DELETE without the Authentication header returns 401`,
  `tests/auth.spec.ts` → `DELETE with an invalid token returns 401`

> Because `prod` is correct, these two tests call `test.fail(ENV === "dev")`; in
> `dev` they are expected failures, in `prod` they run as normal (passing) tests.

---

## Summary

| ID | Endpoint | Expected | Actual | Env |
|----|----------|----------|--------|-----|
| BUG-01 | `GET /users/{email}` (unknown) | 404 | 500 | dev, prod |
| BUG-02 | `POST /users` (duplicate email) | 409 | 500 | dev, prod |
| BUG-03 | `POST /users` (malformed email) | 400 | 201 | dev, prod |
| BUG-04 | `DELETE /users/{email}` (no/invalid auth) | 401 | 204 | dev only |

### Behaviours verified as correct
- `POST` missing required fields → `400`
- `POST`/`PUT` age outside 1–150 (incl. non-integer) → `400`
- `PUT` unknown user → `404`; `PUT` duplicate email → `409`
- `DELETE` with a valid token → `204`; unknown user → `404`
- `dev` and `prod` keep separate databases (env isolation works)
