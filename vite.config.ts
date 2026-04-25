import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks: {
          // Three.js + GSAP vendors change rarely — separate chunk for long-term caching
          vendor: ['three', 'gsap'],
          // Capacitor deps — only affect iOS builds
          mobile: ['@capacitor/core', '@capacitor/haptics'],
        },
      },
    },
  },
})
