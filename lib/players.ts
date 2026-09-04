import { prisma } from "@/lib/prisma"
import { fetchSquadRaw } from "@/lib/football-data"
import { cached } from "@/lib/ttl-cache"
import { fetchExcludedPlayerIds } from "@/lib/league-data"

/**
 * 得点予想の候補選手。
 *
 * 上流のスカッドを、ユーザーがそのクラブを開いたときに取得して Player へ upsert する。
 * 全クラブ一括だと 20リクエストで上流の 10/分に当たるので、見たクラブの分だけ取る
 * 形にして自然に分散させる。
 */

export interface SquadPlayer {
  id: string
  apiPlayerId: number
  name: string
  position: string | null
}

/**
 * FW から並べる。得点予想なので点を取る順に見せる。
 * ポジションは lib/football-data.ts で Goalkeeper / Defence / Midfield / Offence に正規化済み。
 */
const POSITION_ORDER: Record<string, number> = {
  Offence: 0,
  Midfield: 1,
  Defence: 2,
}

/** GK は得点予想の候補にしない（PL で GK の得点は現実的に起きない） */
const EXCLUDED_POSITIONS = new Set(["Goalkeeper"])

export function isSelectablePosition(position: string | null): boolean {
  return !EXCLUDED_POSITIONS.has(position ?? "")
}

export function positionLabel(position: string | null): string {
  switch (position) {
    case "Goalkeeper":
      return "GK"
    case "Defence":
      return "DF"
    case "Midfield":
      return "MF"
    case "Offence":
      return "FW"
    default:
      return "—"
  }
}

/** GK を落とし、FW → MF → DF の順に並べる */
export function sortSquad<T extends { position: string | null; name: string }>(squad: T[]): T[] {
  return squad
    .filter((p) => isSelectablePosition(p.position))
    .sort((a, b) => {
      const pa = POSITION_ORDER[a.position ?? ""] ?? 9
      const pb = POSITION_ORDER[b.position ?? ""] ?? 9
      return pa !== pb ? pa - pb : a.name.localeCompare(b.name)
    })
}

/**
 * 指定クラブのスカッドを取得して Player へ反映し、並べ替えたものを返す。
 * 上流への問い合わせは TTL キャッシュで押さえる（10リクエスト/分）。
 */
export async function getSquadForTeam(
  teamId: string,
  season?: { leagueCode: string; seasonYear: number }
): Promise<SquadPlayer[]> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, apiTeamId: true },
  })
  if (!team) return []

  const upstream = await cached(`squad:${team.apiTeamId}`, 10 * 60_000, () =>
    fetchSquadRaw(team.apiTeamId)
  ).catch(() => null)

  if (upstream?.squad?.length) {
    // 同期は upsert のみ。移籍で外れた選手を消すと、その選手を指名済みの予想が壊れる。
    for (const p of upstream.squad) {
      await prisma.player.upsert({
        where: { apiPlayerId: p.apiPlayerId },
        create: { apiPlayerId: p.apiPlayerId, name: p.name, position: p.position, teamId: team.id },
        update: { name: p.name, position: p.position, teamId: team.id },
      })
    }
  }

  const excluded = season ? await fetchExcludedPlayerIds(season) : new Set<number>()
  const players = await prisma.player.findMany({
    where: { teamId: team.id },
    select: { id: true, apiPlayerId: true, name: true, position: true },
  })
  return sortSquad(players.filter((p) => !excluded.has(p.apiPlayerId)))
}

/** 名前で選手を探す（同期済みのものが対象。クラブが分からないとき用の補助） */
export async function searchPlayers(
  query: string,
  season?: { leagueCode: string; seasonYear: number },
  limit = 30
): Promise<Array<SquadPlayer & { teamName: string }>> {
  const q = query.trim()
  if (q.length < 2) return []
  const excluded = season ? await fetchExcludedPlayerIds(season) : new Set<number>()
  const rows = await prisma.player.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    select: { id: true, apiPlayerId: true, name: true, position: true, team: { select: { name: true } } },
    orderBy: { name: "asc" },
    take: limit,
  })
  return rows
    .filter((r) => isSelectablePosition(r.position) && !excluded.has(r.apiPlayerId))
    .map((r) => ({
      id: r.id,
      apiPlayerId: r.apiPlayerId,
      name: r.name,
      position: r.position,
      teamName: r.team.name,
    }))
}
