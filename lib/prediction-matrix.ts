
/**
 * チーム × 人の予想比較表（/results の「予想を比較」）の並びと色。
 *
 * 開幕直後と終盤で、読みたいものが違う:
 *  - 開幕直後は実順位がまだ意味を持たない（第2節でハル2位）。実順位で並べると
 *    同期のたびに行が入れ替わり、色も全部「差8以上」になって実態を映さない。
 *    このときは「みんなの予想の平均」で並べ、「平均からのズレ」で塗る。
 *  - 終盤・確定後は実順位が答えなので、実順位との差で塗る。
 *
 * 表示に関わらない計算だけをここに置く（DB も JSX も持たない）。
 */

/** 行の並び順 */
export type MatrixOrder = "avg" | "actual" | "spread"
/** セルの色の基準 */
export type MatrixColor = "dev" | "actual" | "none"

export const MATRIX_ORDERS: readonly MatrixOrder[] = ["avg", "actual", "spread"] as const
export const MATRIX_COLORS: readonly MatrixColor[] = ["dev", "actual", "none"] as const

export const MATRIX_ORDER_LABELS: Record<MatrixOrder, string> = {
  avg: "予想の平均",
  actual: "実順位",
  spread: "割れ度",
}
export const MATRIX_COLOR_LABELS: Record<MatrixColor, string> = {
  dev: "みんなとのズレ",
  actual: "実順位との差",
  none: "色なし",
}

/** クエリ文字列を安全に解釈する。未知の値は既定に寄せる（古いURLで空表示にしないため） */
export function parseMatrixOrder(raw: string | undefined, fallback: MatrixOrder): MatrixOrder {
  return MATRIX_ORDERS.includes(raw as MatrixOrder) ? (raw as MatrixOrder) : fallback
}
export function parseMatrixColor(raw: string | undefined, fallback: MatrixColor): MatrixColor {
  return MATRIX_COLORS.includes(raw as MatrixColor) ? (raw as MatrixColor) : fallback
}

export interface MatrixTeam {
  teamId: string
  actualRank: number
}

export interface MatrixRow {
  teamId: string
  actualRank: number
  /** みんなの予想の平均順位。予想が1件も無ければ null */
  avg: number | null
  min: number | null
  max: number | null
  /** 割れ度 = 最大 − 最小。予想が1件以下なら 0 */
  spread: number
  /** userId → 予想順位。予想していない人は持たない */
  preds: Map<string, number>
}

/**
 * チームごとに、各人の予想と平均・割れ度をまとめる。
 * predictionByUser は userId → (teamId → 予想順位)。
 */
export function buildMatrixRows(
  teams: MatrixTeam[],
  userIds: string[],
  predictionByUser: Map<string, Map<string, number>>
): MatrixRow[] {
  return teams.map((team) => {
    const preds = new Map<string, number>()
    for (const userId of userIds) {
      const rank = predictionByUser.get(userId)?.get(team.teamId)
      if (rank !== undefined) preds.set(userId, rank)
    }
    const values = [...preds.values()]
    if (values.length === 0) {
      return { teamId: team.teamId, actualRank: team.actualRank, avg: null, min: null, max: null, spread: 0, preds }
    }
    const sum = values.reduce((a, b) => a + b, 0)
    const min = Math.min(...values)
    const max = Math.max(...values)
    return {
      teamId: team.teamId,
      actualRank: team.actualRank,
      avg: sum / values.length,
      min,
      max,
      spread: max - min,
      preds,
    }
  })
}

/**
 * 行を並べ替える（元の配列は変えない）。
 * 予想が無いチーム（avg が null）は常に最後。並びが安定しないと
 * 同じ画面を開き直したときに順番が変わって見える。
 */
export function sortMatrixRows<T extends { actualRank: number; avg: number | null; spread: number }>(
  rows: T[],
  order: MatrixOrder
): T[] {
  const copy = [...rows]
  copy.sort((a, b) => {
    if (order === "actual") return a.actualRank - b.actualRank
    if (a.avg === null && b.avg === null) return a.actualRank - b.actualRank
    if (a.avg === null) return 1
    if (b.avg === null) return -1
    if (order === "spread" && b.spread !== a.spread) return b.spread - a.spread
    if (a.avg !== b.avg) return a.avg - b.avg
    return a.actualRank - b.actualRank
  })
  return copy
}

/**
 * セルの色の既定。
 * 実順位が答えとして通用するのは終盤以降なので、それまでは「みんなとのズレ」。
 */
export function defaultMatrixColor(params: {
  isLocked: boolean
  resultsRevealed: boolean
  remainingMatchdays: number
  hasStandings: boolean
  /** 終盤とみなす残り節数。リーグごとに違う（lib/leagues.ts） */
  endgameRemaining: number
}): MatrixColor {
  if (!params.hasStandings) return "dev"
  if (params.isLocked || params.resultsRevealed) return "actual"
  if (params.remainingMatchdays <= params.endgameRemaining) return "actual"
  return "dev"
}

/** 行の並びの既定。実順位で並べて読めるのは、色が実順位基準になってから */
export function defaultMatrixOrder(color: MatrixColor): MatrixOrder {
  return color === "actual" ? "actual" : "avg"
}

/**
 * 平均からのズレの段階。
 * 戻り値は -4〜4。負が「みんなより上位に見た」、正が「下位に見た」、0 が中立。
 * 段階に落とすのは、0.1 刻みの生の値で色を塗ると差が読めないため。
 */
export function devStep(predicted: number, avg: number | null): number {
  if (avg === null) return 0
  const signed = predicted - avg
  const size = Math.abs(signed)
  if (size < 1) return 0
  const step = size < 2 ? 1 : size < 3.5 ? 2 : size < 5.5 ? 3 : 4
  return signed < 0 ? -step : step
}
