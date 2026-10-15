import { test, expect } from "../src/fixtures";
import { isErrorResponse, randomEmail, userPayload } from "../src/helpers";

const invalidAges = [0, 151, -1, "abc"] as const;

test.describe("Validation", () => {
  test("POST missing name returns 400", async ({ request, jsonHeaders }) => {
    const response = await request.post("users", {
      data: { email: randomEmail(), age: 30 },
      headers: jsonHeaders,
    });
    expect(response.status()).toBe(400);
    expect(isErrorResponse(await response.json())).toBe(true);
  });

  test("POST missing email returns 400", async ({ request, jsonHeaders }) => {
    const response = await request.post("users", {
      data: { name: "Jane", age: 30 },
      headers: jsonHeaders,
    });
    expect(response.status()).toBe(400);
  });

  test("POST missing age returns 400", async ({ request, jsonHeaders }) => {
    const response = await request.post("users", {
      data: { name: "Jane", email: randomEmail() },
      headers: jsonHeaders,
    });
    expect(response.status()).toBe(400);
  });

  for (const age of invalidAges) {
    test(`POST age ${age} returns 400`, async ({ request, jsonHeaders }) => {
      const response = await request.post("users", {
        data: userPayload({ age }),
        headers: jsonHeaders,
      });
      expect(response.status()).toBe(400);
      expect(isErrorResponse(await response.json())).toBe(true);
    });
  }

  test(
    "POST a malformed email returns 400",
    { tag: "@bug" },
    async ({ request, authHeaders, jsonHeaders }) => {
      test.fail(
        true,
        "BUG-03: a malformed email is accepted (201) instead of returning 400"
      );
      const email = "not-an-email";
      const response = await request.post("users", {
        data: userPayload({ email }),
        headers: jsonHeaders,
      });
      try {
        expect(response.status()).toBe(400);
      } finally {
        await request.delete(`users/${encodeURIComponent(email)}`, {
          headers: authHeaders,
        });
      }
    }
  );

  test("PUT a missing field returns 400", async ({
    request,
    createdUser,
    jsonHeaders,
  }) => {
    const response = await request.put(
      `users/${encodeURIComponent(createdUser.email)}`,
      { data: { name: "Only" }, headers: jsonHeaders }
    );
    expect(response.status()).toBe(400);
  });

  test("PUT an out-of-range age returns 400", async ({
    request,
    createdUser,
    jsonHeaders,
  }) => {
    const response = await request.put(
      `users/${encodeURIComponent(createdUser.email)}`,
      { data: userPayload({ email: createdUser.email, age: 999 }), headers: jsonHeaders }
    );
    expect(response.status()).toBe(400);
  });
});
