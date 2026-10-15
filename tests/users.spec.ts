import { test, expect } from "../src/fixtures";
import { isErrorResponse, isUser } from "../src/helpers";

test.describe("Users collection API", () => {
  test("GET /users returns 200 and an array of users", async ({ request }) => {
    const response = await request.get("users");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(Array.isArray(body)).toBe(true);
    for (const user of body) {
      expect(isUser(user)).toBe(true);
    }
  });

  test("POST /users with a valid body returns 201 and echoes the body", async ({
    request,
    uniqueUser,
    jsonHeaders,
  }) => {
    const response = await request.post("users", {
      data: uniqueUser,
      headers: jsonHeaders,
    });
    expect(response.status()).toBe(201);
    const body = await response.json();
    expect(body.name).toBe(uniqueUser.name);
    expect(body.email).toBe(uniqueUser.email);
    expect(body.age).toBe(uniqueUser.age);
    expect(isUser(body)).toBe(true);
  });

  test("a created user is persisted and can be fetched by email", async ({
    request,
    userFactory,
  }) => {
    const user = await userFactory();
    const response = await request.get(`users/${encodeURIComponent(user.email)}`);
    expect(response.status()).toBe(200);
    expect((await response.json()).email).toBe(user.email);
  });

  test("a created user appears in the users list", async ({
    request,
    userFactory,
  }) => {
    const user = await userFactory();
    const body = await (await request.get("users")).json();
    const emails = body.map((u: { email: string }) => u.email);
    expect(emails).toContain(user.email);
  });

  test(
    "creating a user with a duplicate email returns 409",
    { tag: "@bug" },
    async ({ request, userFactory, jsonHeaders }) => {
      test.fail(
        true,
        "BUG-02: creating a user with a duplicate email returns 500 instead of 409"
      );
      const existing = await userFactory();
      const response = await request.post("users", {
        data: existing,
        headers: jsonHeaders,
      });
      expect(response.status()).toBe(409);
      expect(isErrorResponse(await response.json())).toBe(true);
    }
  );
});
