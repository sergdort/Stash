type QueryKey = string

const cache = new Map<QueryKey, unknown>()

export function getCachedQuery<T>(key: QueryKey): T | undefined {
  return cache.get(key) as T | undefined
}

export function setCachedQuery<T>(key: QueryKey, value: T): void {
  cache.set(key, value)
}

export function clearCachedQuery(key: QueryKey): void {
  cache.delete(key)
}
