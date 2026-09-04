import { prisma } from "@/lib/prisma"

/**
 * サイト全体設定（シングルトン）。管理画面から編集可能。
 * 行は常に id="singleton" の1件のみ。
 */

const SINGLETON_ID = "singleton"

export interface SiteConfigData {
  siteName: string
  locale: string
  scoreExactMatch: number
  scoreDiffMultiplier: number
  enabledLeagues: string[]
}

// プロセス内キャッシュ（VPS の単一プロセス運用を想定）。更新時に破棄する。
let cache: SiteConfigData | null = null

function toData(row: {
  siteName: string
  locale: string
  scoreExactMatch: number
  scoreDiffMultiplier: number
  enabledLeagues: string[]
}): SiteConfigData {
  return {
    siteName: row.siteName,
    locale: row.locale,
    scoreExactMatch: row.scoreExactMatch,
    scoreDiffMultiplier: row.scoreDiffMultiplier,
    enabledLeagues: row.enabledLeagues,
  }
}

/** サイト設定を取得（無ければ既定値で作成）。 */
export async function getSiteConfig(): Promise<SiteConfigData> {
  if (cache) return cache
  const row = await prisma.siteConfig.upsert({
    where: { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  })
  cache = toData(row)
  return cache
}

/** サイト設定を更新し、キャッシュを更新して返す。 */
export async function updateSiteConfig(
  data: Partial<SiteConfigData>
): Promise<SiteConfigData> {
  const row = await prisma.siteConfig.upsert({
    where: { id: SINGLETON_ID },
    update: data,
    create: { id: SINGLETON_ID, ...data },
  })
  cache = toData(row)
  return cache
}

/** スコアルール（calculateScore に渡す形）を取得する。 */
export async function getScoringConfig(): Promise<{
  exactMatch: number
  diffMultiplier: number
}> {
  const c = await getSiteConfig()
  return { exactMatch: c.scoreExactMatch, diffMultiplier: c.scoreDiffMultiplier }
}

/** テスト・更新後にキャッシュを破棄する。 */
export function invalidateSiteConfigCache(): void {
  cache = null
}
