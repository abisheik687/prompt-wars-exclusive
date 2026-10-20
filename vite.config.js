import { defineConfig } from "vite";
export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  server: { proxy: { "/api": "http://localhost:8080" } },
});
