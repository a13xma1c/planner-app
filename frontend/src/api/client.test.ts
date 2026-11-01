import { http, HttpResponse } from 'msw'
import { describe, expect, it } from 'vitest'

import { server } from '@/test/server'

import { api, ApiError, buildQuery, request } from './client'

describe('buildQuery', () => {
  it('serialises scalars and arrays and drops empties', () => {
    expect(buildQuery({ a: 1, b: 'x', c: true, d: ['p', 'q'], e: undefined, f: null, g: '' })).toBe(
      '?a=1&b=x&c=true&d=p&d=q',
    )
    expect(buildQuery()).toBe('')
  })
})

describe('ApiError.describe', () => {
  it('handles string details', () => {
    expect(ApiError.describe(404, 'Task 1 not found')).toBe('Task 1 not found')
  })
  it('handles FastAPI validation lists', () => {
    expect(ApiError.describe(422, [{ loc: ['body', 'title'], msg: 'too short' }])).toBe(
      'title: too short',
    )
    expect(ApiError.describe(422, [{ msg: 'bad' }])).toBe('bad')
  })
  it('falls back to the status', () => {
    expect(ApiError.describe(500, { weird: true })).toBe('Request failed with status 500')
  })
})

describe('request', () => {
  it('returns parsed JSON', async () => {
    server.use(http.get('/api/echo', () => HttpResponse.json({ ok: 1 })))
    await expect(api.get<{ ok: number }>('/api/echo')).resolves.toEqual({ ok: 1 })
  })

  it('returns undefined for 204', async () => {
    server.use(http.delete('/api/thing', () => new HttpResponse(null, { status: 204 })))
    await expect(api.delete('/api/thing')).resolves.toBeUndefined()
  })

  it('throws ApiError with detail on failure', async () => {
    server.use(http.post('/api/fail', () => HttpResponse.json({ detail: 'nope' }, { status: 409 })))
    const err = await api.post('/api/fail', { a: 1 }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect((err as ApiError).status).toBe(409)
    expect((err as ApiError).message).toBe('nope')
  })

  it('sends JSON bodies and query strings', async () => {
    let seen: { body: unknown; url: string } | null = null
    server.use(
      http.patch('/api/item', async ({ request: req }) => {
        seen = { body: await req.json(), url: req.url }
        return HttpResponse.json({})
      }),
    )
    await request('/api/item', { method: 'PATCH', body: { x: 1 }, query: { q: 'y' } })
    expect(seen!.body).toEqual({ x: 1 })
    expect(seen!.url).toContain('/api/item?q=y')
  })
})
