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

export const WORKSPACE_HEADER = 'X-Workspace-Id'

/** Fired on `window` when the server rejects the session so the app can go to /login. */
export const UNAUTHORIZED_EVENT = 'planner:unauthorized'

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Query
  signal?: AbortSignal
  /** Workspace to operate on (sent as the X-Workspace-Id header). */
  workspace?: number | null
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, signal, workspace } = options
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (workspace) headers[WORKSPACE_HEADER] = String(workspace)
  const response = await fetch(`${path}${buildQuery(query)}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal,
    credentials: 'same-origin',
  })
  if (response.status === 204) return undefined as T
  const text = await response.text()
  const data: unknown = text ? JSON.parse(text) : null
  if (!response.ok) {
    const detail = (data as { detail?: unknown } | null)?.detail ?? data
    if (response.status === 401 && !path.startsWith('/api/auth/')) {
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT))
    }
    throw new ApiError(response.status, detail)
  }
  return data as T
}

/** Request helpers bound to a workspace (pass `null` for workspace-less endpoints). */
export function scoped(workspace: number | null) {
  return {
    get: <T>(path: string, query?: Query, signal?: AbortSignal) =>
      request<T>(path, { query, signal, workspace }),
    post: <T>(path: string, body?: unknown, query?: Query) =>
      request<T>(path, { method: 'POST', body, query, workspace }),
    patch: <T>(path: string, body: unknown) =>
      request<T>(path, { method: 'PATCH', body, workspace }),
    delete: <T = void>(path: string) => request<T>(path, { method: 'DELETE', workspace }),
  }
}

export const api = scoped(null)
