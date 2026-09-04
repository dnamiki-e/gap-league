import { prisma } from "@/lib/prisma"
import { fetchScorers } from "@/lib/league-data"

/**
 * 指名した選手の合計得点。これが得点予想ランキングの順位を決める。
 *
 * 上流は1点以上の全得点者を返す（PL で約280人、最少1点）ので、
 * **一覧に無い選手は0点と確定できる**。取りこぼしではない。
 */
export function totalPickGoals(
  apiPlayerIds: number[],
  goalsByPlayerId: Map<number, number>
): number {
  return apiPlayerIds.reduce((sum, id) => sum + (goalsByPlayerId.get(id) ?? 0), 0)
}

export interface ScorerBoardPick {
  playerName: string
  teamName: string | null
  goals: number
}

export interface ScorerBoardRow {
  userId: string
  displayName: string | null
  email: string | null
  picks: ScorerBoardPick[]
  /** 指名3人の合計得点。多いほど上位 */
  totalGoals: number
  /** 得点予想を入力済みか。false の行は「未入力」として最後に並べる */
  hasPicks: boolean
}

export interface ScorerBoard {
  /** 現在の得点王（同得点なら全員）。実データなのでネタバレにならない */
  leaders: Array<{ name: string; teamName: string; goals: number }>
  rows: ScorerBoardRow[]
}

/**
 * 得点予想ランキング（誰が誰を指名し、その選手が何点取っているか）。
 * 順位予想とは別のランキングで、スコアは合算しない。
 * 順位予想と違い締切前でも表示する方針。
 */
export async function getScorerBoard(params: {
  seasonId: string
  leagueCode: string
  seasonYear: number
}): Promise<ScorerBoard | null> {
  const { seasonId, leagueCode, seasonYear } = params

  const picks = await prisma.predictionScorer.findMany({
    where: { prediction: { seasonId } },
    select: {
      slot: true,
      prediction: {
        select: { userId: true, user: { select: { displayName: true, email: true } } },
      },
      player: {
        select: { apiPlayerId: true, name: true, team: { select: { name: true, shortName: true } } },
      },
      // 上流が移籍前後の両クラブに同じ選手を載せるため、Player.teamId は
      // 「最後に同期したクラブ」になる。指名時に見えていたクラブを優先する。
      pickedTeam: { select: { name: true, shortName: true } },
    },
    orderBy: { slot: "asc" },
  })
  if (picks.length === 0) return null

  let goals: Map<number, number>
  let scorers: Awaited<ReturnType<typeof fetchScorers>>["scorers"]
  try {
    const res = await fetchScorers({ leagueCode, seasonYear, limit: 500 })
    goals = new Map(res.scorers.filter((s) => s.playerId !== null).map((s) => [s.playerId!, s.goals]))
    scorers = res.scorers
  } catch {
    return null
  }

  const top = scorers.length > 0 ? scorers[0].goals : 0
  const leaders = scorers
    .filter((s) => s.goals === top && top > 0)
    .map((s) => ({ name: s.playerName, teamName: s.teamShortName ?? s.teamName, goals: s.goals }))

  const byUser = new Map<string, ScorerBoardRow>()
  const pickedIdsByUser = new Map<string, number[]>()
  for (const p of picks) {
    const userId = p.prediction.userId
    const row =
      byUser.get(userId) ??
      {
        userId,
        displayName: p.prediction.user.displayName,
        email: p.prediction.user.email,
        picks: [],
        totalGoals: 0,
        hasPicks: true,
      }
    row.picks.push({
      playerName: p.player.name,
      teamName:
        p.pickedTeam?.shortName ??
        p.pickedTeam?.name ??
        p.player.team.shortName ??
        p.player.team.name,
      goals: goals.get(p.player.apiPlayerId) ?? 0,
    })
    pickedIdsByUser.set(userId, [...(pickedIdsByUser.get(userId) ?? []), p.player.apiPlayerId])
    byUser.set(userId, row)
  }

  for (const [userId, ids] of pickedIdsByUser) {
    const row = byUser.get(userId)
    if (row) row.totalGoals = totalPickGoals(ids, goals)
  }

  // 未入力の参加者も行として出す。出さないと本人が自分の不在に気づけない。
  const participants = await prisma.prediction.findMany({
    where: { seasonId },
    select: { userId: true, user: { select: { displayName: true, email: true } } },
  })

  return { leaders, rows: mergeScorerRows([...byUser.values()], participants) }
}

export interface ScorerBoardParticipant {
  userId: string
  user: { displayName: string | null; email: string | null }
}

/**
 * 得点予想ボードの行を並べる。
 *
 * 入力済みは合計得点の多い順（＝有利な順）、未入力はその後ろに名前順で置く。
 * 未入力を落とすと本人が自分の行が無いことに気づけないので、必ず行を出す。
 */
export function mergeScorerRows(
  entered: ScorerBoardRow[],
  participants: ScorerBoardParticipant[]
): ScorerBoardRow[] {
  const enteredIds = new Set(entered.map((r) => r.userId))
  const notEntered: ScorerBoardRow[] = participants
    .filter((p) => !enteredIds.has(p.userId))
    .map((p) => ({
      userId: p.userId,
      displayName: p.user.displayName,
      email: p.user.email,
      picks: [],
      totalGoals: 0,
      hasPicks: false,
    }))
    .sort((a, b) =>
      (a.displayName ?? a.email ?? "").localeCompare(b.displayName ?? b.email ?? "", "ja")
    )

  return [
    ...[...entered].sort((a, b) => b.totalGoals - a.totalGoals),
    ...notEntered,
  ]
}
