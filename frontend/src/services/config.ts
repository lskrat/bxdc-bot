const trimTrailingSlash = (value?: string) => value?.replace(/\/+$/, '') ?? ''

const apiBaseUrl = trimTrailingSlash(import.meta.env.VITE_API_URL)

function buildUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return baseUrl ? `${baseUrl}${normalizedPath}` : normalizedPath
}

/** Browser calls skill-gateway only; agent-core is reached server-side. */
export function apiUrl(path: string): string {
  return buildUrl(apiBaseUrl, path)
}
