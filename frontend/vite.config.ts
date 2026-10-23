import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'next/link': path.resolve(__dirname, './src/shims/next-link.tsx'),
      'next/navigation': path.resolve(__dirname, './src/shims/next-navigation.tsx'),
      'next/image': path.resolve(__dirname, './src/shims/next-image.tsx'),
    },
  },
  build: {
    // Disable module preload polyfill which can use eval in some environments
    modulePreload: { polyfill: false },
  },
})
