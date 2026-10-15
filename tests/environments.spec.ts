import { test, expect } from "../src/fixtures";
import { AUTH_TOKEN, baseUrl, randomEmail } from "../src/helpers";

test.describe("Environment isolation", () => {
  test("dev and prod use separate databases", async ({ request }) => {
    const email = randomEmail("isolation");
    const payload = { name: "Isolation", email, age: 30 };

    const created = await request.post(`${baseUrl()}/dev/users`, {
      data: payload,
    });
    expect(created.status()).toBe(201);

    try {
      const dev = await (await request.get(`${baseUrl()}/dev/users`)).json();
      const prod = await (await request.get(`${baseUrl()}/prod/users`)).json();
      const devEmails = dev.map((u: { email: string }) => u.email);
      const prodEmails = prod.map((u: { email: string }) => u.email);

      expect(devEmails).toContain(email);
      expect(prodEmails).not.toContain(email);
    } finally {
      await request.delete(
        `${baseUrl()}/dev/users/${encodeURIComponent(email)}`,
        { headers: { Authentication: AUTH_TOKEN } }
      );
    }
  });
});
