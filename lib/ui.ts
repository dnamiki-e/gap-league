/**
 * 画面共通の見た目トークン（クラス文字列）。
 *
 * ページごとに max-w がバラついていると遷移のたびにコンテンツの左端が動くため、
 * 本文の幅は2種類だけに固定する。
 *   wide … 一覧・表・チャートなどの通常ページ（既定）
 *   form … 入力フォーム中心の狭いページ
 */
export type PageWidth = "wide" | "form"

export function pageClass(width: PageWidth = "wide", extra = ""): string {
  const maxWidth = width === "form" ? "max-w-2xl" : "max-w-5xl"
  return `${maxWidth} mx-auto px-4 py-8 ${extra}`.trimEnd()
}

/**
 * 第2階層（セクション内のビュー切替）の見た目＝セグメンテッドコントロール。
 *
 * リンクで切り替える版（components/SectionNav.tsx）とページ内の状態で切り替える版
 * （components/ViewTabs.tsx）の2つがあるが、見た目が違うと「同じ層の部品」だと
 * 読み取れなくなるため、クラス文字列はここ1か所だけに置く。
 */
export const segmentedTrackClass =
  "min-w-0 flex items-center gap-1 p-1 rounded-xl bg-[var(--fill)] border border-[var(--border)] overflow-x-auto"

export function segmentedItemClass(active: boolean): string {
  const base = "shrink-0 whitespace-nowrap px-3 py-1.5 text-sm rounded-lg transition-colors"
  return active
    ? `${base} bg-[var(--card-surface)] text-[var(--foreground)] font-semibold shadow-sm`
    : `${base} text-[var(--text-muted)] hover:text-[var(--foreground)]`
}

/**
 * セクション内サブナビ（第2階層）の項目。
 * 表示は components/SectionNav.tsx。
 */
export interface SectionNavItem {
  /** 実際のリンク先。?seasonId= などのクエリを含めてよい */
  href: string
  /** アクティブ判定に使うパス（クエリを含めない） */
  path: string
  label: string
  /** 既定は前方一致。子パスを持つ項目が二重点灯するのを防ぎたいときに true */
  exact?: boolean
}

/**
 * サブナビ移動でシーズン選択（第3階層）を落とさないためのクエリ付与。
 * 25-26 を見ている状態で「予想を比較」を押したら 25-26 の比較表に着く、という約束。
 */
function withSeason(href: string, seasonId?: string): string {
  return seasonId ? `${href}?seasonId=${seasonId}` : href
}

/** アーカイブ・セクション: 確定シーズンの見方を切り替える */
export function archiveNav(seasonId?: string): SectionNavItem[] {
  return [
    { href: withSeason("/ranking/archive", seasonId), path: "/ranking/archive", label: "順位表" },
    { href: withSeason("/results", seasonId), path: "/results", label: "予想を比較" },
  ]
}

/**
 * ランキング・セクション: 進行中シーズンの見方を切り替える。
 *
 * 「予想を比較」は締切後にしか意味がないので、締切前は項目を出さない
 * （出すと、押した先で /results がシーズンを解決できずアーカイブへ飛ぶ）。
 */
export function rankingNav(seasonId?: string, showCompare = true): SectionNavItem[] {
  const items: SectionNavItem[] = [
    { href: withSeason("/ranking", seasonId), path: "/ranking", label: "順位表", exact: true },
  ]
  if (showCompare) {
    items.push({ href: withSeason("/results", seasonId), path: "/results", label: "予想を比較" })
  }
  return items
}

/** 分析セクション: 集計の切り口を切り替える */
export function statsNav(seasonId?: string): SectionNavItem[] {
  return [
    { href: withSeason("/stats", seasonId), path: "/stats", label: "的中率", exact: true },
    { href: withSeason("/stats/timeline", seasonId), path: "/stats/timeline", label: "節別変動" },
  ]
}

