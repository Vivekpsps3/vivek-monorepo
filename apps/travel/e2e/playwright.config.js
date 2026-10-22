import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const port = process.env.TRAVEL_E2E_PORT || "8098";
const root = path.resolve(process.cwd(), "../../..");
const venvPython = path.join(root, ".venv/bin/python");
const python = process.env.PYTHON || (fs.existsSync(venvPython) ? venvPython : "python3");

export default defineConfig({
  testDir: ".",
  timeout: 2_400_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    reducedMotion: "reduce",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  webServer: {
    command: `PYTHONPATH="${root}" TRAVEL_E2E_PORT=${port} "${python}" apps/travel/e2e/server.py`,
    cwd: root,
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
