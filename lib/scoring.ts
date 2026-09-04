export interface ScoringConfig {
  /** 順位完全一致時の点（既定 -2） */
  exactMatch: number
  /** 順位差1あたりの点（既定 1） */
  diffMultiplier: number
}

export const DEFAULT_SCORING: ScoringConfig = { exactMatch: -2, diffMultiplier: 1 }

/**
 * 順位予想のスコア。予想順位と実順位の差の合計（小さいほど上位）。
 * 得点予想は別ランキングなので、ここには混ぜない。
 * config 未指定時は既定ルール（完全一致 -2 / 差分そのまま）。
 */
export function calculateScore(
  details: Array<{ predictedRank: number; actualRank: number }>,
  config: ScoringConfig = DEFAULT_SCORING
): number {
  return details.reduce((total, { predictedRank, actualRank }) => {
    const diff = Math.abs(predictedRank - actualRank)
    return total + (diff === 0 ? config.exactMatch : diff * config.diffMultiplier)
  }, 0)
}
