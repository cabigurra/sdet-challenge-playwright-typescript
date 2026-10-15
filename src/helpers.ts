import { randomUUID } from "crypto";
import { request as playwrightRequest } from "@playwright/test";
import type { APIResponse } from "@playwright/test";

export type User = {
  name: string;
  email: string;
  age: number;
};

export type ErrorResponse = {
  error: string;
};

export type UserInput = {
  name: string;
  email: string;
  age: number | string;
};

export const AUTH_TOKEN = process.env.AUTH_TOKEN ?? "mysecrettoken";

export function baseUrl(): string {
  return (process.env.BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
}

export function currentEnv(): string {
  return process.env.ENV ?? "dev";
}

/** e.g. http://localhost:3000/dev */
export function apiUrl(env: string = currentEnv()): string {
  return `${baseUrl()}/${env}`;
}

/** Return a unique email so tests never collide on the primary key. */
export function randomEmail(prefix = "user"): string {
  return `${prefix}_${randomUUID().replace(/-/g, "")}@example.com`;
}

/** Build a valid user body, generating a unique email when none is given. */
export function userPayload(overrides: Partial<UserInput> = {}): UserInput {
  return {
    name: "Jane Doe",
    email: randomEmail(),
    age: 30,
    ...overrides,
  };
}

export function authHeaders(): Record<string, string> {
  return { Authentication: AUTH_TOKEN };
}

export function jsonHeaders(): Record<string, string> {
  return { "Content-Type": "application/json" };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Poll the API until it responds 200 on GET /users, or throw. */
export async function waitForApi(timeoutMs = 30_000): Promise<void> {
  const context = await playwrightRequest.newContext();
  const url = `${apiUrl()}/users`;
  const deadline = Date.now() + timeoutMs;
  let last: unknown = null;
  try {
    while (Date.now() < deadline) {
      try {
        const response = await context.get(url, { timeout: 3000 });
        if (response.status() === 200) return;
        last = response.status();
      } catch (error) {
        last = error instanceof Error ? error.message : String(error);
      }
      await sleep(1000);
    }
    throw new Error(
      `API not reachable at ${url} within ${timeoutMs / 1000}s (last: ${last})`
    );
  } finally {
    await context.dispose();
  }
}

export function isUser(body: unknown): body is User {
  if (typeof body !== "object" || body === null) return false;
  const user = body as Record<string, unknown>;
  return (
    typeof user.name === "string" &&
    typeof user.email === "string" &&
    Number.isInteger(user.age)
  );
}

export function isErrorResponse(body: unknown): body is ErrorResponse {
  if (typeof body !== "object" || body === null) return false;
  return typeof (body as Record<string, unknown>).error === "string";
}

export async function errorMessage(response: APIResponse): Promise<string> {
  try {
    const body = (await response.json()) as Partial<ErrorResponse>;
    return typeof body.error === "string" ? body.error : "";
  } catch {
    return "";
  }
}
