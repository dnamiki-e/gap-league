/**
 * シーズンごとの「他人の予想・順位・スコアを表示してよいか」を判定するヘルパー群。
 *
 * ルール:
 *  - 予想締切前 → 他人の予想・順位・スコアは一切非表示（自分の予想はいつでも見える）
 *  - 締切後・進行中で残りが十分ある → 通常表示
 *  - 締切後・終盤（残り節数がリーグごとの閾値以下）→ 順位・予想を全員分マスク
 *  - 管理者が「結果開示」を押した（resultsRevealed=true）→ 常に表示
 *  - シーズン確定済み（isLocked=true）→ 常に表示（アーカイブ扱い）
 *
 * 総節数と終盤の閾値はリーグごとに違う（lib/leagues.ts が正本）。
 * 節数の少ないリーグに一律の閾値を当てると、シーズンのほとんどが隠れてしまう。
 */
import { getLeague } from "@/lib/leagues"

export interface MinimalStanding {
  played: number
}

export interface MinimalSeason {
  leagueCode: string
  isLocked: boolean
  resultsRevealed: boolean
  predictionDeadline: Date | string
}

export function getTotalMatchdays(leagueCode: string): number {
  return getLeague(leagueCode).totalMatchdays
}

/** 残り何節から他人の予想・順位を隠すか。0 なら隠さない。 */
export function getEndgameRemaining(leagueCode: string): number {
  return getLeague(leagueCode).endgameRemaining
}

/** 予想締切を過ぎたか */
export function hasPassedDeadline(season: MinimalSeason, now: Date = new Date()): boolean {
  return now >= new Date(season.predictionDeadline)
}

/** 現時点で完了している最大節数（=リーグ全体の進行節）。標準ケースでは全チーム同じ played。 */
export function getCurrentMatchday(standings: MinimalStanding[]): number {
  if (standings.length === 0) return 0
  return standings.reduce((m, s) => (s.played > m ? s.played : m), 0)
}

/** 全チーム最低でも1試合以上消化しているか。データ同期で開幕前スタンディング（played=0）が入ってもゲート可能。 */
export function isSeasonStarted(standings: MinimalStanding[]): boolean {
  return standings.some((s) => s.played > 0)
}

/** 全チームが総節数に到達した（＝シーズン完了） */
export function isSeasonFinished(standings: MinimalStanding[], leagueCode: string): boolean {
  if (standings.length === 0) return false
  const total = getTotalMatchdays(leagueCode)
  return standings.every((s) => s.played >= total)
}

/** 残り節数（最終節=1、シーズン終了=0） */
export function getRemainingMatchdays(standings: MinimalStanding[], leagueCode: string): number {
  const total = getTotalMatchdays(leagueCode)
  const current = getCurrentMatchday(standings)
  return Math.max(0, total - current)
}

/** 終盤（残り節数がリーグの閾値以下）に入ったか。閾値0のリーグは終盤モードを持たない。 */
export function isEndgamePhase(standings: MinimalStanding[], leagueCode: string): boolean {
  if (!isSeasonStarted(standings)) return false
  const threshold = getEndgameRemaining(leagueCode)
  if (threshold <= 0) return false
  return getRemainingMatchdays(standings, leagueCode) <= threshold
}

/** 「結果を開示する」ボタンを押せるか（＝最終節完了後） */
export function canRevealResults(standings: MinimalStanding[], leagueCode: string): boolean {
  return isSeasonFinished(standings, leagueCode)
}

export type VisibilityStatus =
  | "no-season"        // アクティブシーズンなし
  | "pre-deadline"     // 予想締切前（他人の予想・順位は非表示）
  | "in-progress"      // 進行中（通常表示）
  | "endgame-hidden"   // 残り5節以下・未開示（順位マスク）
  | "revealed"         // 管理者が結果開示済み（表示）
  | "finalized"        // シーズン確定済み（表示）

export function getVisibilityStatus(
  season: MinimalSeason | null,
  standings: MinimalStanding[],
  now: Date = new Date(),
): VisibilityStatus {
  if (!season) return "no-season"
  if (season.isLocked) return "finalized"
  if (season.resultsRevealed) return "revealed"
  if (!hasPassedDeadline(season, now)) return "pre-deadline"
  if (isEndgamePhase(standings, season.leagueCode)) return "endgame-hidden"
  return "in-progress"
}

/** 他人の順位・スコアを表示してよいか */
export function canShowRankings(
  season: MinimalSeason | null,
  standings: MinimalStanding[],
  now: Date = new Date(),
): boolean {
  const status = getVisibilityStatus(season, standings, now)
  return status === "in-progress" || status === "revealed" || status === "finalized"
}

/** 他人の予想内容を表示してよいか（判定は canShowRankings と同一） */
export function canShowPredictions(
  season: MinimalSeason | null,
  standings: MinimalStanding[],
  now: Date = new Date(),
): boolean {
  return canShowRankings(season, standings, now)
}

/**
 * 得点予想の締切。順位予想より後ろに設定できるようにしてある。
 * 未設定なら順位予想と同じ締切とみなす（過去シーズンはこの経路）。
 */
export function getScorerDeadline(season: {
  predictionDeadline: Date | string
  scorerDeadline?: Date | string | null
}): Date {
  return new Date(season.scorerDeadline ?? season.predictionDeadline)
}
