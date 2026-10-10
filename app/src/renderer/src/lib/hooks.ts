import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from './api'

interface AsyncState<T> {
  /** The loader that produced `data`; used to tell whether the data is current. */
  source: unknown
  data: T | undefined
  error: string | null
}

export interface AsyncResult<T> {
  data: T | undefined
  error: string | null
  /** True until the first result of the current loader arrived (stale data may still be set). */
  loading: boolean
  reload: () => void
}

/**
 * Runs `load` whenever its identity changes (wrap it in useCallback) or `reload` is called.
 * Keeps showing the previous data while reloading.
 */
export function useAsync<T>(load: () => Promise<T>): AsyncResult<T> {
  const [state, setState] = useState<AsyncState<T>>({ source: null, data: undefined, error: null })
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    load().then(
      (data) => {
        if (!cancelled) setState({ source: load, data, error: null })
      },
      (error: unknown) => {
        if (!cancelled) setState((previous) => ({ source: load, data: previous.data, error: errorMessage(error) }))
      }
    )
    return () => {
      cancelled = true
    }
  }, [load, tick])

  const reload = useCallback(() => setTick((value) => value + 1), [])
  return { data: state.data, error: state.error, loading: state.source !== load, reload }
}

export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}
