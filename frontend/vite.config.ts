import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { "/api": process.env.TEAMUP_API_TARGET ?? "http://127.0.0.1:8086" },
  },
  test: { environment: "jsdom", setupFiles: "./src/testSetup.ts" },
});
