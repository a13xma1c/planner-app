/**
 * Password policy — a faithful mirror of backend/planner/services/passwords.py so the
 * sign-up form can give instant feedback. The server remains the authority; the shared
 * fixture backend/tests/fixtures/password_cases.json keeps both implementations in step.
 */
import { COMMON_PASSWORDS } from './commonPasswords'

export const MIN_LENGTH = 10
export const MAX_LENGTH = 128
const MIN_DISTINCT = 5
const MAX_REPEAT_RUN = 3
const SEQUENCE_LENGTH = 4
const PERSONAL_TOKEN_MIN = 3

const KEYBOARD_ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm', '1234567890']
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'
const LEET: Record<string, string> = {
  '@': 'a',
  '4': 'a',
  '3': 'e',
  '1': 'i',
  '!': 'i',
  '0': 'o',
  $: 's',
  '5': 's',
  '7': 't',
}

export const LABELS = ['Very weak', 'Weak', 'Fair', 'Good', 'Strong'] as const

export interface PasswordCheck {
  id: string
  /** requirement wording, for checklists */
  label: string
  /** failure wording, for error messages */
  problem: string
  passed: boolean
  required: boolean
}

export interface PasswordReport {
  score: 0 | 1 | 2 | 3 | 4
  label: (typeof LABELS)[number]
  ok: boolean
  checks: PasswordCheck[]
  suggestions: string[]
  /** One sentence explaining a rejection, or null when acceptable. */
  problem: string | null
}

export interface PasswordContext {
  email?: string | null
  displayName?: string | null
}

function personalTokens({ email, displayName }: PasswordContext): string[] {
  const tokens: string[] = []
  if (email) {
    const e = email.trim().toLowerCase()
    tokens.push(e, ...e.split('@')[0]!.split(/[._\-+]+/))
  }
  if (displayName) tokens.push(...displayName.toLowerCase().split(/\s+/))
  return [...new Set(tokens.filter((t) => t.length >= PERSONAL_TOKEN_MIN))].sort()
}

const leet = (s: string) => s.replace(/[@431!0$57]/g, (ch) => LEET[ch] ?? ch)
const stripPadding = (s: string) => s.replace(/^[^a-z]+|[^a-z]+$/g, '')

function isCommon(password: string): boolean {
  const lowered = password.toLowerCase()
  const stripped = stripPadding(lowered)
  const variants = new Set([lowered, stripped, leet(lowered), leet(stripped)])
  for (const v of [...variants]) variants.add(stripPadding(v))
  for (const v of variants) if (v.length >= 4 && COMMON_PASSWORDS.has(v)) return true
  for (const variant of [lowered, leet(lowered)]) {
    const words = variant.split(/[^a-z]+/).filter((w) => w.length >= 3)
    if (words.length > 0 && words.every((w) => COMMON_PASSWORDS.has(w))) return true
  }
  return false
}

const hasRepeatRun = (password: string) => new RegExp(`(.)\\1{${MAX_REPEAT_RUN},}`).test(password)

function hasSequence(password: string): boolean {
  const lowered = password.toLowerCase()
  const rows = [...KEYBOARD_ROWS, ALPHABET]
  for (let i = 0; i + SEQUENCE_LENGTH <= lowered.length; i++) {
    const chunk = lowered.slice(i, i + SEQUENCE_LENGTH)
    if (!/^[a-z0-9]+$/.test(chunk)) continue
    for (const row of rows) {
      if (row.includes(chunk) || [...row].reverse().join('').includes(chunk)) return true
    }
  }
  return false
}

function classes(password: string): number {
  return [/[a-z]/, /[A-Z]/, /[0-9]/, /[^a-zA-Z0-9]/].filter((re) => re.test(password)).length
}

export function evaluatePassword(password: string, context: PasswordContext = {}): PasswordReport {
  const length = password.length
  const distinct = new Set(password).size
  const tokens = personalTokens(context)
  const lowered = password.toLowerCase()
  const variety = classes(password)

  const checks: PasswordCheck[] = [
    {
      id: 'length',
      label: `At least ${MIN_LENGTH} characters`,
      problem: `is shorter than ${MIN_LENGTH} characters`,
      passed: length >= MIN_LENGTH,
      required: true,
    },
    {
      id: 'max_length',
      label: `At most ${MAX_LENGTH} characters`,
      problem: `is longer than ${MAX_LENGTH} characters`,
      passed: length <= MAX_LENGTH,
      required: true,
    },
    {
      id: 'whitespace',
      label: 'No spaces at the start or end',
      problem: 'starts or ends with a space',
      passed: password === password.trim(),
      required: true,
    },
    {
      id: 'common',
      label: 'Not a commonly used password',
      problem: 'is too common',
      passed: length > 0 && !isCommon(password),
      required: true,
    },
    {
      id: 'personal',
      label: "Doesn't contain your name or email",
      problem: 'contains your name or email',
      passed: !tokens.some((t) => lowered.includes(t)),
      required: true,
    },
    {
      id: 'repeat',
      label: 'No long runs of the same character',
      problem: 'repeats the same characters too much',
      passed: length > 0 && !hasRepeatRun(password) && distinct >= Math.min(MIN_DISTINCT, length),
      required: true,
    },
    {
      id: 'sequence',
      label: 'No predictable sequences like abcd, 1234 or qwerty',
      problem: 'contains a predictable sequence',
      passed: !hasSequence(password),
      required: true,
    },
    {
      id: 'variety',
      label: 'Mixes letters, numbers and symbols',
      problem: 'uses few kinds of characters',
      passed: variety >= 3,
      required: false,
    },
    {
      id: 'long',
      label: '14+ characters (a passphrase works well)',
      problem: 'is on the short side',
      passed: length >= 14,
      required: false,
    },
  ]

  let score = 0
  if (length >= MIN_LENGTH) score++
  if (length >= 14) score++
  if (length >= 20) score++
  if (variety >= 3) score++
  if (distinct >= 8) score++
  score = Math.min(score, 4)
  if (checks.some((c) => c.required && !c.passed)) score = Math.min(score, 1)
  if (!checks[3]!.passed) score = 0

  const suggestions: string[] = []
  if (length < 14)
    suggestions.push('Longer is stronger: try a passphrase of several unrelated words.')
  if (variety < 3) suggestions.push('Mixing letters, numbers and symbols adds variety.')
  if (distinct < 8 && length >= MIN_LENGTH) suggestions.push('Use more distinct characters.')

  const failures = checks.filter((c) => c.required && !c.passed)
  const ok = failures.length === 0 && score >= 2
  const problem = failures.length
    ? `Password ${failures.map((c) => c.problem).join('; ')}.`
    : ok
      ? null
      : 'Password is too weak: add length or variety.'

  return {
    score: score as PasswordReport['score'],
    label: LABELS[score]!,
    ok,
    checks,
    suggestions,
    problem,
  }
}

/** Strength tiers used by the score: 10 (minimum), 14, 20+ characters. */
const LENGTH_TIERS = [MIN_LENGTH, 14, 20]

/** Colour for a score, used by the strength meter (inline so it never depends on CSS purging). */
export const SCORE_COLORS = ['#f43f5e', '#f43f5e', '#f59e0b', '#84cc16', '#10b981'] as const

/**
 * Fill percentage for the strength meter. The score alone only moves in steps of 25 %;
 * this adds progress towards the next length tier so the bar visibly grows while typing,
 * and keeps a small sliver visible for very weak input so the meter always responds.
 */
export function strengthPercent(password: string, report: PasswordReport): number {
  if (password.length === 0) return 0
  if (report.score >= 4) return 100
  if (report.score === 0) {
    // Still unacceptable, but let the sliver grow towards the minimum length while typing
    // (unless it's a known-common password, which never improves by being longer).
    const common = report.checks.find((c) => c.id === 'common')
    if (common && !common.passed) return 8
    return 8 + Math.round(Math.min(1, password.length / MIN_LENGTH) * 12)
  }
  const base = report.score * 25
  const next = LENGTH_TIERS.find((t) => password.length < t)
  if (next === undefined) return base
  const prev = LENGTH_TIERS[LENGTH_TIERS.indexOf(next) - 1] ?? 0
  const fraction = Math.max(0, Math.min(1, (password.length - prev) / (next - prev)))
  return Math.min(base + Math.round(fraction * 20), 99)
}
