import { fetchScorersRaw, type RawScorer } from "@/lib/football-data"
import { cached } from "@/lib/ttl-cache"

/** 上流は 10リクエスト/分。この秒数だけプロセス内で使い回す */
const CACHE_MS = 60_000

/**
 * リーグの実データ（予想ゲームではなく、現実のリーグの事実）を取得する層。
 *
 * 取得は全て lib/football-data.ts 経由。上流の football-data.org は
 * 10 リクエスト/分しか許さないため、直接 fetch を書かないこと
 * （キャッシュとレート制御を素通りする）。
 */

// ───────── 得点ランキング ─────────

/** 得点ランキング1行。中身は lib/football-data.ts の RawScorer と同じ。 */
export type Scorer = RawScorer

export async function fetchScorers(params: {
  leagueCode: string
  seasonYear: number
  limit?: number
}): Promise<{ scorers: Scorer[]; currentMatchday: number | null }> {
  const { leagueCode, seasonYear, limit = 50 } = params
  return cached(`scorers:${leagueCode}:${seasonYear}:${limit}`, CACHE_MS, () =>
    fetchScorersRaw({ leagueCode, seasonYear, limit })
  )
}

// ───────── 前年の得点上位（指名不可） ─────────

/** 前年の得点上位から何人を指名不可にするか */
export const EXCLUDED_TOP_SCORERS = 10

/**
 * 指名できない選手（前年の得点上位10人）の apiPlayerId。
 *
 * 前年の得点上位を全員が選んで横並びになるのを避けるためのルール。
 * 前年のデータが無いシーズン（最初のシーズン等）では空を返す＝制限なし。
 * 同得点で10位が複数いる場合は、上流の順位に従って先頭10人だけを外す。
 */
export async function fetchExcludedPlayerIds(params: {
  leagueCode: string
  seasonYear: number
}): Promise<Set<number>> {
  const { leagueCode, seasonYear } = params
  // 失敗（前年が上流に無い・プラン対象外で403）も結果としてキャッシュする。
  // ここで例外を素通しさせると、選手一覧を開くたびに必ず落ちるリクエストを
  // 投げ直すことになり、レート制御の待ち時間ぶん予想画面が遅くなる。
  return cached(`excluded:${leagueCode}:${seasonYear}`, CACHE_MS, async () => {
    try {
      const { scorers } = await fetchScorers({
        leagueCode,
        seasonYear: seasonYear - 1,
        limit: EXCLUDED_TOP_SCORERS,
      })
      return new Set(
        scorers
          .slice(0, EXCLUDED_TOP_SCORERS)
          .map((s) => s.playerId)
          .filter((id): id is number => id !== null)
      )
    } catch {
      // 前年データが取れないときに指名そのものを止めない
      return new Set<number>()
    }
  })
}
