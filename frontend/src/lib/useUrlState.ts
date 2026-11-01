import { useCallback, useState } from 'react'
import { useSearchParams } from 'react-router'

/**
 * State that lives in the URL query string but updates the UI synchronously.
 *
 * Router navigations are asynchronous, so driving controlled inputs straight from
 * `useSearchParams` makes them briefly revert after each change. Instead we keep a
 * local copy as the source of truth, mirror every change into the URL (`replace`),
 * and adopt the URL again whenever it changes from the outside (links, back/forward).
 *
 * `parse` and `serialize` must be stable (module-level) functions.
 */
export function useUrlState<T>(
  parse: (params: URLSearchParams) => T,
  serialize: (value: T, previous: URLSearchParams) => URLSearchParams,
): [T, (next: T) => void] {
  const [searchParams, setSearchParams] = useSearchParams()
  const [value, setValue] = useState<T>(() => parse(searchParams))

  const key = searchParams.toString()
  const [seenKey, setSeenKey] = useState(key)
  if (key !== seenKey) {
    setSeenKey(key)
    const fromUrl = parse(searchParams)
    if (JSON.stringify(fromUrl) !== JSON.stringify(value)) setValue(fromUrl)
  }

  const set = useCallback(
    (next: T) => {
      setValue(next)
      setSearchParams((prev) => serialize(next, prev), { replace: true })
    },
    [serialize, setSearchParams],
  )
  return [value, set]
}
