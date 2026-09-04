/**
 * 管理者によるユーザー削除の可否判定（純粋ロジック）。
 * DB アクセスを持たないので単体テストできる。
 */

export type DeletionTarget = {
  id: string
  isAdmin: boolean
  /** そのユーザーが持つ予想（シーズン単位）の件数 */
  predictionCount: number
  /** そのユーザーが持つスコアの件数 */
  scoreCount: number
}

export type DeletionContext = {
  /** 操作している管理者の userId */
  requesterId: string
  /** サイト全体の管理者数 */
  adminCount: number
  /** 予想・スコアごと削除することを明示的に承認したか */
  force: boolean
}

export type DeletionBlock = {
  status: number
  error: string
  /** 予想・スコアがあるために止めた場合のみ true（UI で再確認を出す目印） */
  needsForce?: boolean
  predictionCount?: number
  scoreCount?: number
}

/** ユーザーが予想・スコアを持っているか。 */
export function hasCompetitionData(target: DeletionTarget): boolean {
  return target.predictionCount > 0 || target.scoreCount > 0
}

/**
 * 削除を止めるべき理由を返す。問題なければ null。
 *
 * - 自分自身は削除できない（管理者が自分をロックアウトするのを防ぐ）
 * - 最後の管理者は削除できない（サイトが管理不能になるのを防ぐ）
 * - 予想・スコアを持つユーザーは force なしでは削除しない
 *   （ランキングの過去データが消えるため、UI で明示確認を挟む）
 */
export function blockUserDeletion(
  target: DeletionTarget,
  ctx: DeletionContext
): DeletionBlock | null {
  if (target.id === ctx.requesterId) {
    return { status: 400, error: "自分自身のアカウントは削除できません" }
  }

  if (target.isAdmin && ctx.adminCount <= 1) {
    return {
      status: 400,
      error: "最後の管理者は削除できません。先に別の管理者を設定してください",
    }
  }

  if (hasCompetitionData(target) && !ctx.force) {
    return {
      status: 409,
      error: `このユーザーは予想 ${target.predictionCount} 件・スコア ${target.scoreCount} 件を持っています。削除するとランキングからも消えます`,
      needsForce: true,
      predictionCount: target.predictionCount,
      scoreCount: target.scoreCount,
    }
  }

  return null
}
