import { openDb } from "../db/client.js"
import { runMigrations } from "../db/migrate.js"
import { ensureDbDirectory } from "../features/common/db.js"
import { createCoreServices } from "./create-core-services.js"
import type { CoreServices } from "./contracts.js"

export type CreateCoreRuntimeOptions = {
  dbPath: string
  migrationsDir: string
}

export type CoreRuntime = {
  services: CoreServices
  close: () => void
}

export function createCoreRuntime(options: CreateCoreRuntimeOptions): CoreRuntime {
  ensureDbDirectory(options.dbPath)
  runMigrations(options.dbPath, options.migrationsDir)

  const { db, sqlite } = openDb(options.dbPath)
  let closed = false

  return {
    services: createCoreServices({ db }),
    close: (): void => {
      if (closed) {
        return
      }
      sqlite.close()
      closed = true
    },
  }
}
