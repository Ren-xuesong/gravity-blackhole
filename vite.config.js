import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.GITHUB_PAGES === 'true' ? '/gravity-blackhole/' : '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020'
  }
});
