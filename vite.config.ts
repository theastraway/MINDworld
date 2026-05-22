import { defineConfig } from 'vite'
import path from 'path'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// MIND World — standalone drivable landing for m-i-n-d.ai.
// Mirrors MINDapp's `@/` alias so the LandingV2 source moves over verbatim.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: '/',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Pull the three.js core + postprocessing chunk out separately so the
        // ~600KB Three engine stays in its own cache lane and the LandingV2
        // app code chunk stays small / iterable.
        manualChunks(id) {
          if (id.includes('node_modules/three/')) return 'three'
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'react-vendor'
          }
          if (id.includes('node_modules/react-router')) return 'router'
          if (id.includes('node_modules/posthog-js')) return 'analytics'
          if (id.includes('node_modules/lucide-react')) return 'icons'
          if (id.includes('node_modules/sonner') || id.includes('node_modules/react-helmet-async')) {
            return 'ui-vendor'
          }
          return undefined
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
})
