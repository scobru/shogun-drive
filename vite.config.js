import { defineConfig } from "vite";
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tailwindcss()
  ],
  server: {
    port: 3001,
    open: true
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});

