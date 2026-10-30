import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
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
});
