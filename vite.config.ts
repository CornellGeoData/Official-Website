import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

const viewers = ['lidar', 'hexapod']

export default defineConfig({
  plugins: [react(), {
    // Dev prebundling keys deps by name, so all workspaces would share one copy
    // of three and the home globe, pinned to r150, would run on a viewer's newer
    // build and render washed out. Production builds already resolve per importer.
    name: 'globe-pinned-three',
    apply: 'serve',
    enforce: 'pre',
    resolveId(id, importer) {
      if (id === 'three' && importer?.includes('/src/pages/home/')) return path.resolve('node_modules/three/build/three.module.js')
    },
  }, {
    name: 'viewer-entry-paths',
    // Keep the public viewer URLs independent of their source directories.
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const match = req.url?.match(/^\/(lidar|hexapod)(?:\/(?:index\.html)?)?(\?.*)?$/)
        if (match) req.url = `/src/viewers/${match[1]}/index.html${match[2] || ''}`
        next()
      })
    },
    generateBundle: {
      order: 'post',
      handler(_options, bundle) {
        for (const viewer of viewers) {
          const source = `src/viewers/${viewer}/index.html`
          const entry = bundle[source]
          if (entry?.type !== 'asset') continue
          delete bundle[source]
          this.emitFile({ type: 'asset', fileName: `${viewer}/index.html`, source: entry.source })
        }
      },
    },
  }],
  build: { rollupOptions: { input: { main: 'index.html', ...Object.fromEntries(viewers.map(viewer => [viewer, `src/viewers/${viewer}/index.html`])) } } },
  // Sensor API served locally by npm start.
  server: { proxy: { '/api': 'http://localhost:4173' } },
})
