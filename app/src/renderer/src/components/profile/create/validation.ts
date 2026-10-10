/** Longest profile name the backend accepts (backend/src/core/profiles.nv, MAX_NAME_LENGTH). */
export const MAX_NAME_LENGTH = 100

export type NameProblem = 'empty' | 'tooLong' | 'duplicate'

/**
 * Checks a profile name as the form shows it. Names are compared trimmed and without case;
 * `existing` is undefined while the profile list is still loading (no duplicate check then).
 */
export function nameProblem(name: string, existing: readonly string[] | undefined): NameProblem | null {
  const trimmed = name.trim()
  if (trimmed === '') return 'empty'
  if (trimmed.length > MAX_NAME_LENGTH) return 'tooLong'
  const wanted = trimmed.toLowerCase()
  if (existing?.some((other) => other.trim().toLowerCase() === wanted)) return 'duplicate'
  return null
}
