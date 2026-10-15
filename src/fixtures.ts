import { test as base, expect } from "@playwright/test";
import { AUTH_TOKEN, userPayload } from "./helpers";
import type { UserInput } from "./helpers";

export type UserFactory = (overrides?: Partial<UserInput>) => Promise<UserInput>;

type ApiFixtures = {
  jsonHeaders: Record<string, string>;
  authHeaders: Record<string, string>;
  uniqueUser: UserInput;
  createdUser: UserInput;
  userFactory: UserFactory;
};

export const test = base.extend<ApiFixtures>({
  jsonHeaders: async ({}, use) => {
    await use({ "Content-Type": "application/json" });
  },

  authHeaders: async ({}, use) => {
    await use({ Authentication: AUTH_TOKEN });
  },

  uniqueUser: async ({}, use) => {
    await use(userPayload());
  },

  userFactory: async ({ request, authHeaders }, use) => {
    const createdEmails: string[] = [];

    const factory: UserFactory = async (overrides = {}) => {
      const payload = userPayload(overrides);
      const response = await request.post("users", { data: payload });
      if (response.status() !== 201) {
        throw new Error(
          `setup failed: POST /users -> ${response.status()} ${await response.text()}`
        );
      }
      createdEmails.push(payload.email);
      return payload;
    };

    await use(factory);

    for (const email of createdEmails) {
      await request.delete(`users/${encodeURIComponent(email)}`, {
        headers: authHeaders,
      });
    }
  },

  createdUser: async ({ userFactory }, use) => {
    await use(await userFactory());
  },
});

export { expect };
