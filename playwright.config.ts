import { defineConfig } from "@playwright/test";
import { apiUrl } from "./src/helpers";

export default defineConfig({
  testDir: "./tests",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "reports/html", open: "never" }],
    ["junit", { outputFile: "reports/junit.xml" }],
  ],
  globalSetup: "./playwright.global-setup.ts",
  use: {
    baseURL: `${apiUrl()}/`,
  },
});
