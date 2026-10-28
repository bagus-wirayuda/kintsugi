import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: {
    proxy: {
      "/api": `http://127.0.0.1:${loadEnv(mode, process.cwd(), "").PORT || 3001}`,
    },
  },
  build: {
    outDir: "dist",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/react-dom/")) return "react-dom";
          if (
            id.includes("/node_modules/react/") ||
            id.includes("/node_modules/scheduler/")
          )
            return "react";
          if (id.includes("/node_modules/lucide-react/")) return "icons";
        },
      },
    },
  },
}));
