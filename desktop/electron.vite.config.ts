import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve('src-electron'),
      },
    },
    build: {
      lib: {
        entry: resolve('src-electron/main.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      lib: {
        entry: resolve('src-electron/preload.ts'),
      },
    },
  },
  renderer: {
    root: resolve('.'),
    resolve: {
      alias: {
        '@renderer': resolve('src'),
      },
    },
    build: {
      rollupOptions: {
        input: resolve('index.html'),
      },
    },
    plugins: [react()],
  },
})
