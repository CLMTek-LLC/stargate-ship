import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // Three.js + GSAP vendors change rarely — separate chunk for long-term caching
          if (id.includes('node_modules/three') || id.includes('node_modules/gsap')) return 'vendor'
          // Capacitor deps — only affect iOS builds
          if (id.includes('@capacitor/core') || id.includes('@capacitor/haptics')) return 'mobile'
        },
      },
    },
  },
})
