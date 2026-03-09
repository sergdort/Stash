export class CliError extends Error {
  code: string
  exitCode: number

  constructor(message: string, code: string, exitCode: number) {
    super(message)
    this.code = code
    this.exitCode = exitCode
  }
}
