import { test, expect } from "../src/fixtures";
import { currentEnv } from "../src/helpers";

test.describe("DELETE authentication", () => {
  test("DELETE with a valid token returns 204", async ({
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
  });

  test(
    "DELETE without the Authentication header returns 401",
    { tag: "@bug" },
    async ({ request, userFactory }) => {
      test.fail(
        currentEnv() === "dev",
        "BUG-04: in dev, DELETE without the Authentication header returns 204 " +
          "(and deletes the user) instead of 401. prod behaves correctly."
      );
      const user = await userFactory();
      const response = await request.delete(
        `users/${encodeURIComponent(user.email)}`
      );
      expect(response.status()).toBe(401);
    }
  );

  test(
    "DELETE with an invalid token returns 401",
    { tag: "@bug" },
    async ({ request, userFactory }) => {
      test.fail(
        currentEnv() === "dev",
        "BUG-04: in dev, DELETE with an invalid token returns 204 " +
          "(and deletes the user) instead of 401. prod behaves correctly."
      );
      const user = await userFactory();
      const response = await request.delete(
        `users/${encodeURIComponent(user.email)}`,
        { headers: { Authentication: "invalid-token" } }
      );
      expect(response.status()).toBe(401);
    }
  );
});
