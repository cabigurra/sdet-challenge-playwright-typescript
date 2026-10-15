import { test, expect } from "../src/fixtures";
import { isErrorResponse, isUser, randomEmail, userPayload } from "../src/helpers";

test.describe("User by email API", () => {
  test("GET an existing user returns 200 and the user", async ({
    request,
    createdUser,
  }) => {
    const response = await request.get(
      `users/${encodeURIComponent(createdUser.email)}`
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.email).toBe(createdUser.email);
    expect(isUser(body)).toBe(true);
  });

  test(
    "GET an unknown email returns 404",
    { tag: "@bug" },
    async ({ request }) => {
      test.fail(true, "BUG-01: GET an unknown email returns 500 instead of 404");
      const response = await request.get(
        `users/${encodeURIComponent(randomEmail("missing"))}`
      );
      expect(response.status()).toBe(404);
      expect(isErrorResponse(await response.json())).toBe(true);
    }
  );

  test("PUT an existing user returns 200 and the updated body", async ({
    request,
    createdUser,
    jsonHeaders,
  }) => {
    const updated = userPayload({
      name: "Jane Updated",
      email: createdUser.email,
      age: 41,
    });
    const response = await request.put(
      `users/${encodeURIComponent(createdUser.email)}`,
      { data: updated, headers: jsonHeaders }
    );
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.name).toBe("Jane Updated");
    expect(body.age).toBe(41);
    expect(isUser(body)).toBe(true);
  });

  test("PUT an unknown user returns 404", async ({ request, jsonHeaders }) => {
    const response = await request.put(
      `users/${encodeURIComponent(randomEmail("missing"))}`,
      { data: userPayload(), headers: jsonHeaders }
    );
    expect(response.status()).toBe(404);
  });

  test("PUT to a duplicate email returns 409", async ({
    request,
    userFactory,
    jsonHeaders,
  }) => {
    const first = await userFactory();
    const second = await userFactory();
    const response = await request.put(
      `users/${encodeURIComponent(first.email)}`,
      { data: userPayload({ email: second.email }), headers: jsonHeaders }
    );
    expect(response.status()).toBe(409);
  });

  test("DELETE an existing user with a valid token returns 204", async ({
    request,
    userFactory,
    authHeaders,
  }) => {
    const user = await userFactory();
    const response = await request.delete(
      `users/${encodeURIComponent(user.email)}`,
      { headers: authHeaders }
    );
    expect(response.status()).toBe(204);
    expect(await response.text()).toBe("");
  });

  test("a deleted user is removed from the users list", async ({
    request,
    userFactory,
    authHeaders,
  }) => {
    const user = await userFactory();
    await request.delete(`users/${encodeURIComponent(user.email)}`, {
      headers: authHeaders,
    });
    const body = await (await request.get("users")).json();
    const emails = body.map((u: { email: string }) => u.email);
    expect(emails).not.toContain(user.email);
  });

  test("DELETE an unknown user returns 404", async ({
    request,
    authHeaders,
  }) => {
    const response = await request.delete(
      `users/${encodeURIComponent(randomEmail("missing"))}`,
      { headers: authHeaders }
    );
    expect(response.status()).toBe(404);
  });
});
