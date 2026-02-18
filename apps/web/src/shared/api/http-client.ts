export class HttpError extends Error {
  status: number
  code: string

  constructor(message: string, status: number, code: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  const text = await response.text()
  const payload = text.length > 0 ? (JSON.parse(text) as unknown) : undefined

  if (!response.ok) {
    const error = payload as { error?: { code?: string; message?: string } } | undefined
    throw new HttpError(
      error?.error?.message ?? `Request failed with status ${response.status}`,
      response.status,
      error?.error?.code ?? "INTERNAL_ERROR",
    )
  }

  return payload as T
}

export const httpClient = {
  get: <T>(input: string): Promise<T> => request<T>(input),
  post: <T>(input: string, body?: unknown): Promise<T> =>
    request<T>(input, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  patch: <T>(input: string, body?: unknown): Promise<T> =>
    request<T>(input, {
      method: "PATCH",
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  delete: <T>(input: string): Promise<T> =>
    request<T>(input, {
      method: "DELETE",
    }),
}
