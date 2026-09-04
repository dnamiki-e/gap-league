/** デプロイ時のベースパス（ルート直下なら "" / サブパス配信なら "/xxx"）。env で切替。 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

/** fetch 用に basePath を前置した API パスを返す。 */
export function apiUrl(path: string): string {
  return `${BASE_PATH}${path}`
}

/** クライアント側のルート遷移用に basePath を前置したパスを返す。 */
export function appPath(path: string): string {
  return `${BASE_PATH}${path}`
}

/**
 * ログイン後の遷移先を解決する。
 * middleware は basePath なしのパスを callbackUrl に載せるため前置が必要。
 * window.location.href への代入は basePath が自動付与されないのでここを通す。
 */
export function resolveCallbackUrl(
  raw: string | null | undefined,
  fallbackPath = "/home"
): string {
  const value = raw ?? appPath(fallbackPath)
  if (value.startsWith("http") || (BASE_PATH && value.startsWith(BASE_PATH))) {
    return value
  }
  return `${BASE_PATH}${value}`
}
