const baseURL = process.env.E2E_BASE_URL || "http://127.0.0.1:3000";

/** @type {import('playwright/test').PlaywrightTestConfig} */
const config = {
  testDir: "./tests/e2e",
  fullyParallel: true,
  retries: 1,
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
    },
  ],
};

module.exports = config;
