import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      input: {
        app: "./index.html",
      },
    },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    watch: {
      ignored: ["**/backend/**", "**/*.log", "**/dashboard_history.json", "**/fyers*.json"],
    },
    proxy: {
      "/api": "http://127.0.0.1:5000",
      "/backend": {
        target: "http://127.0.0.1:5000",
        rewrite: (path) => path.replace(/^\/backend/, "/api"),
      },
    },
  },
});
