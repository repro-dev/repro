import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "esnext",
    lib: {
      entry: path.resolve(__dirname, "src/inject.ts"),
      name: "ReproRecorderInject",
      formats: ["iife"],
      fileName: () => "inject.js",
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
    emptyOutDir: false,
  },
});
