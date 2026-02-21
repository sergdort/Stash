import path from "node:path"
import { fileURLToPath } from "node:url"

import { defineConfig, loadEnv } from "vite"
import react from "@vitejs/plugin-react"

const VITE_CONFIG_DIR = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(VITE_CONFIG_DIR, "../..")

function parsePort(value: string | undefined, fallback: number, envName: string): number {
  if (!value || value.trim().length === 0) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(`${envName} must be an integer in range 1..65535.`)
  }
  return parsed
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, REPO_ROOT, "")
  const host = env.STASH_WEB_HOST?.trim() || "127.0.0.1"
  const apiPort = parsePort(env.STASH_API_PORT, 4173, "STASH_API_PORT")
  const pwaPort = parsePort(env.STASH_PWA_PORT, 5173, "STASH_PWA_PORT")

  return {
    envDir: REPO_ROOT,
    plugins: [react()],
    server: {
      host,
      port: pwaPort,
      strictPort: true,
      proxy: {
        "/api": `http://${host}:${apiPort}`,
      },
    },
    build: {
      outDir: "dist",
    },
  }
})
