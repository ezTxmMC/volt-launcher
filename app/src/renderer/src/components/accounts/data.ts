import { useCallback, useEffect } from 'react'
import { api } from '@/lib/api'
import { useAsync } from '@/lib/hooks'

/** Tells the account and skin views that the backend state changed (after a mutation or a finished job). */
type Domain = 'accounts' | 'skins'

const listeners: Record<Domain, Set<() => void>> = { accounts: new Set(), skins: new Set() }

export function notifyChanged(domain: Domain): void {
  for (const listener of listeners[domain]) listener()
}

function onChanged(domain: Domain, listener: () => void): () => void {
  listeners[domain].add(listener)
  return () => {
    listeners[domain].delete(listener)
  }
}

/** Subscribes to account changes (after a mutation or a finished sign-in job). Returns an unsubscribe function. */
export function onAccountsChanged(listener: () => void): () => void {
  return onChanged('accounts', listener)
}

/** The account list and the offline mode; reloads whenever an account changes. */
export function useAccountsView() {
  const load = useCallback(() => api.accounts.list(), [])
  const result = useAsync(load)
  const { reload } = result
  useEffect(() => onChanged('accounts', reload), [reload])
  return result
}

/** The skin library with its previews; reloads whenever a skin changes. */
export function useSkinLibrary() {
  const load = useCallback(() => api.skins.list(), [])
  const result = useAsync(load)
  const { reload } = result
  useEffect(() => onChanged('skins', reload), [reload])
  return result
}
