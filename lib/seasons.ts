import { prisma } from "@/lib/prisma"

/**
 * アーカイブ・セクション（順位表 / 予想を比較）が扱うシーズン。
 *
 * この2画面は同じセクションのタブなので、対象シーズンも並び順も必ず一致させる。
 * ずれていると「片方のタブにしか無いシーズン」を選べてしまい、
 * タブを切り替えた瞬間に選択が解決できず空のページになる。
 */
export function getArchiveSeasons() {
  return prisma.season.findMany({
    where: { isLocked: true },
    orderBy: { seasonYear: "desc" },
  })
}

/**
 * 「予想を比較」（/results）が扱うシーズン。
 *
 * 確定済みに加えて、順位予想の締切を過ぎた進行中シーズンも含める。
 * 予想が出そろった直後こそ見たい表なので、シーズン終了まで待たせない。
 * 締切前のシーズンを含めないのは、一覧に出た時点で他人の予想を覗ける入口に
 * なってしまうため（画面側のネタバレゲートに加えて、ここでも塞ぐ）。
 */
export function getComparableSeasons(now: Date = new Date()) {
  return prisma.season.findMany({
    where: {
      OR: [{ isLocked: true }, { isActive: true, predictionDeadline: { lte: now } }],
    },
    orderBy: { seasonYear: "desc" },
  })
}

/**
 * クエリのシーズンを一覧から解決する。
 * 見つからなければ先頭（＝最新）に寄せる。古いブックマークで空ページを見せないため。
 */
export function pickSeason<T extends { id: string }>(
  seasons: T[],
  seasonId?: string
): T | undefined {
  return (seasonId ? seasons.find((s) => s.id === seasonId) : undefined) ?? seasons[0]
}

/**
 * リーグ・セクションが扱うシーズン。
 * 予想ゲームではなく現実のリーグを見る画面なので、確定・進行中を問わず全て並べる。
 */
export function getLeagueSeasons() {
  return prisma.season.findMany({
    where: { isActive: true },
    orderBy: { seasonYear: "desc" },
  })
}
