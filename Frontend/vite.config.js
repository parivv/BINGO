import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  base: mode === "development" ? "/" : "/BINGO/",
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/auth": "http://localhost:8000",
      "/api": "http://localhost:8000"
    }
  }
}));
