/** Minimal typed fetch wrapper with consistent error handling. */

export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(status: number, detail: unknown) {
    super(ApiError.describe(status, detail))
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }

  /** Turn FastAPI error payloads (string or validation list) into a readable message. */
  static describe(status: number, detail: unknown): string {
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      const first = detail[0] as { loc?: unknown[]; msg?: string } | undefined
      if (first?.msg) {
        const field = first.loc?.filter((p) => p !== 'body').join('.')
        return field ? `${field}: ${first.msg}` : first.msg
      }
    }
    return `Request failed with status ${status}`
  }
}

export type Query = Record<
  string,
  string | number | boolean | string[] | number[] | undefined | null
>

export function buildQuery(params: Query = {}): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    if (Array.isArray(value)) value.forEach((v) => search.append(key, String(v)))
    else search.set(key, String(value))
  }
  const s = search.toString()
  return s ? `?${s}` : ''
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Query
  signal?: AbortSignal
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal } = options
  const response = await fetch(`${path}${buildQuery(query)}`, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
  })
  if (response.status === 204) return undefined as T
  const text = await response.text()
  const data: unknown = text ? JSON.parse(text) : null
  if (!response.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail ?? data
    throw new ApiError(response.status, detail)
  }
  return data as T
}

export const api = {
  get: <T>(path: string, query?: Query, signal?: AbortSignal) =>
    request<T>(path, { query, signal }),
  post: <T>(path: string, body?: unknown, query?: Query) =>
    request<T>(path, { method: 'POST', body, query }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T = void>(path: string) => request<T>(path, { method: 'DELETE' }),
}
