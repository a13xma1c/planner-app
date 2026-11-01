import { useCallback, useEffect, useRef, useState } from 'react'

/** Debounce a changing value. */
export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

/** useState persisted to localStorage (JSON). */
export function useLocalStorage<T>(
  key: string,
  initial: T,
): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })
  const set = useCallback(
    (v: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v
        try {
          window.localStorage.setItem(key, JSON.stringify(next))
        } catch {
          /* storage may be unavailable (private mode); ignore */
        }
        return next
      })
    },
    [key],
  )
  return [value, set]
}

export type Hotkey = {
  /** e.g. "n", "/", "shift+?", "mod+k" */
  combo: string
  /** Return `false` to decline the event (it stays available to other hotkeys). */
  handler: (event: KeyboardEvent) => void | boolean
  /** Allow firing while typing in inputs (default false). */
  allowInInput?: boolean
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

export function matchesCombo(event: KeyboardEvent, combo: string): boolean {
  const parts = combo.toLowerCase().split('+')
  const key = parts[parts.length - 1]!
  const needMod = parts.includes('mod')
  const needShift = parts.includes('shift')
  const needAlt = parts.includes('alt')
  const hasMod = event.metaKey || event.ctrlKey
  if (needMod !== hasMod) return false
  if (needAlt !== event.altKey) return false
  // For shifted symbol keys ("?") the shift state is implied by the key itself.
  if (needShift && !event.shiftKey) return false
  if (!needShift && event.shiftKey && key.length === 1 && /[a-z0-9]/.test(key)) return false
  return event.key.toLowerCase() === key
}

/** Register global keyboard shortcuts. */
export function useHotkeys(hotkeys: Hotkey[]): void {
  const ref = useRef(hotkeys)
  useEffect(() => {
    ref.current = hotkeys
  })
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return
      for (const hk of ref.current) {
        if (!hk.allowInInput && isEditable(event.target)) continue
        if (matchesCombo(event, hk.combo)) {
          if (hk.handler(event) === false) continue
          event.preventDefault()
          return
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Calls `onOutside` when a pointer-down happens outside the referenced element. */
export function useClickOutside<T extends HTMLElement>(
  ref: React.RefObject<T | null>,
  onOutside: () => void,
  active = true,
): void {
  useEffect(() => {
    if (!active) return
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside()
    }
    document.addEventListener('pointerdown', handler)
    return () => document.removeEventListener('pointerdown', handler)
  }, [ref, onOutside, active])
}
