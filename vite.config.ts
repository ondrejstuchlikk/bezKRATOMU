/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the build works under https://<user>.github.io/<repo>/
  // (routing is hash-based, so no server-side fallback is needed).
  base: './',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
  },
})
