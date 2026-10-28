import { defineConfig, devices } from "playwright/test";

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4173);
const multiplayerPort = Number(process.env.PLAYWRIGHT_MULTIPLAYER_PORT ?? 10001);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  use: {
    baseURL,
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: `cross-env PORT=${multiplayerPort} node e2e/multiplayer-server.mjs`,
      url: `http://127.0.0.1:${multiplayerPort}/health`,
      reuseExistingServer: false,
    },
    {
      command: `cross-env VITE_WITH_MOCKS=true VITE_MULTIPLAYER_WS_URL=ws://127.0.0.1:${multiplayerPort}/ws vite build && vite preview --host 127.0.0.1 --port ${port}`,
      url: baseURL,
      reuseExistingServer: false,
    },
  ],
});
