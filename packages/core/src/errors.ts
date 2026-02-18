export class StashError extends Error {
  code: string
  exitCode: number
  httpStatus: number

  constructor(message: string, code: string, exitCode = 1, httpStatus = 500) {
    super(message)
    this.code = code
    this.exitCode = exitCode
    this.httpStatus = httpStatus
  }
}

export function asStashError(error: unknown): StashError {
  if (error instanceof StashError) {
    return error
  }

  const message = error instanceof Error ? error.message : "Unknown error"
  return new StashError(message, "INTERNAL_ERROR", 1, 500)
}
