import { describe, expect, it } from 'vitest'

// Shared with the backend test-suite: both implementations must agree on every case.
import casesJson from '../../../backend/tests/fixtures/password_cases.json?raw'
import commonList from '../../../backend/planner/data/common_passwords.txt?raw'
import { COMMON_PASSWORDS } from './commonPasswords'
import {
  evaluatePassword,
  LABELS,
  MAX_LENGTH,
  MIN_LENGTH,
  SCORE_COLORS,
  strengthPercent,
} from './password'

interface Case {
  password: string
  email: string | null
  display_name: string | null
  note: string
  ok: boolean
  score: number
  label: string
  failed: string[]
  problem: string | null
}

const cases = JSON.parse(casesJson) as Case[]

describe('evaluatePassword mirrors the backend policy', () => {
  it.each(cases.map((c) => [c.note, c] as const))('%s', (_note, c) => {
    const report = evaluatePassword(c.password, { email: c.email, displayName: c.display_name })
    expect(report.ok).toBe(c.ok)
    expect(report.score).toBe(c.score)
    expect(report.label).toBe(c.label)
    expect(report.checks.filter((x) => !x.passed).map((x) => x.id)).toEqual(c.failed)
    expect(report.problem).toBe(c.problem)
  })

  it('uses the same common-password list as the backend', () => {
    const lines = commonList
      .split('\n')
      .map((l) => l.trim().toLowerCase())
      .filter((l) => l && !l.startsWith('#'))
    expect([...COMMON_PASSWORDS].sort()).toEqual([...new Set(lines)].sort())
  })

  it('exposes the policy constants and report shape', () => {
    expect(MIN_LENGTH).toBe(10)
    expect(MAX_LENGTH).toBe(128)
    expect(LABELS).toHaveLength(5)
    const r = evaluatePassword('orbit-cactus-lantern-7')
    expect(r.checks.map((c) => c.id)).toEqual([
      'length',
      'max_length',
      'whitespace',
      'common',
      'personal',
      'repeat',
      'sequence',
      'variety',
      'long',
    ])
    expect(r.checks.filter((c) => c.required)).toHaveLength(7)
    expect(r.suggestions).toEqual([])
  })

  it('reacts to context', () => {
    expect(evaluatePassword('Bob-Builder-2030').ok).toBe(true)
    expect(evaluatePassword('Bob-Builder-2030', { displayName: 'Bob Builder' }).problem).toBe(
      'Password contains your name or email.',
    )
    expect(evaluatePassword('Bob-Builder-2030', { email: 'bob@example.com' }).ok).toBe(false) // "bob" (3 chars) counts
    expect(evaluatePassword('Bo-Builder-2030', { email: 'bo@example.com' }).ok).toBe(true) // tokens < 3 chars are ignored
  })
})

describe('strengthPercent', () => {
  const pct = (pw: string) => strengthPercent(pw, evaluatePassword(pw))

  it('is empty for no input and full for a strong password', () => {
    expect(pct('')).toBe(0)
    expect(pct('orbit-cactus-lantern-7')).toBe(100)
  })

  it('keeps a visible sliver for very weak input and stays red for failures', () => {
    expect(pct('password')).toBe(8) // common: never grows
    expect(pct('o')).toBe(9)
    expect(pct('orbit-c')).toBe(16) // growing towards the 10-character minimum
    expect(SCORE_COLORS[evaluatePassword('password').score]).toBe('#f43f5e')
  })

  it('grows monotonically while typing a passphrase', () => {
    const phrase = 'orbit-cactus-lantern-7'
    const series = Array.from({ length: phrase.length }, (_, i) => pct(phrase.slice(0, i + 1)))
    for (let i = 1; i < series.length; i++) expect(series[i]).toBeGreaterThanOrEqual(series[i - 1]!)
    expect(new Set(series).size).toBeGreaterThan(6) // many distinct steps, not just 4 jumps
    expect(series[series.length - 1]).toBe(100)
  })

  it('never shows 100 % unless the score is 4', () => {
    const good = 'Tr0ub4dor&3' // score 3
    expect(evaluatePassword(good).score).toBe(3)
    expect(pct(good)).toBeGreaterThanOrEqual(75)
    expect(pct(good)).toBeLessThan(100)
  })
})
