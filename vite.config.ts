import { defineConfig } from 'vite'
import shims from '@frida/web-shims'

export default defineConfig({
  resolve: {
    alias: shims(import.meta.url)
  }
})
