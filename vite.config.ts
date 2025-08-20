import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  server: { open: true },
  resolve: {
    alias: {
      "@core": path.resolve(__dirname, "src/core"),
      "@render": path.resolve(__dirname, "src/render"),
      "@ui": path.resolve(__dirname, "src/ui"),
      "@data": path.resolve(__dirname, "src/data"),
    },
  },
});
