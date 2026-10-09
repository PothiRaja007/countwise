// P12 — test-only Vite config. It runs the REAL app, but redirects two imports at build time:
//   lib/supabaseClient.js -> e2e/support/mockdb.js   (an in-memory stand-in; the real client is never loaded)
//   lib/AuthContext.jsx   -> e2e/support/mockauth.jsx (a fixed signed-in test user; no password, no login)
// No file under src/ is changed. envDir points at an empty folder so no real .env (keys, URLs) is ever read.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')

export default defineConfig({
  root,
  envDir: path.resolve(here, 'support/noenv'),
  plugins: [
    react(),
    {
      name: 'e2e-stand-ins',
      enforce: 'pre',
      resolveId(source) {
        if (/(^|\/)supabaseClient(\.js)?$/.test(source)) return path.resolve(here, 'support/mockdb.js')
        if (/(^|\/)AuthContext(\.jsx)?$/.test(source)) return path.resolve(here, 'support/mockauth.jsx')
        return null
      },
    },
  ],
  server: { host: '127.0.0.1', port: Number(process.env.E2E_PORT || 5199), strictPort: true },
  cacheDir: path.resolve(here, '.cache'),
})
