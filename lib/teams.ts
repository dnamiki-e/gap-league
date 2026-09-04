import { prisma } from "@/lib/prisma"
import { ALL_STATIC_TEAMS, getSyntheticApiTeamId } from "@/lib/league-teams"

/**
 * 推しクラブの favoriteClubId を実 Team ID に解決する。
 * "static-{leagueCode}-{tla}" 形式なら Team を upsert して実 ID を返す。
 * それ以外（既存の実 ID / null / undefined）はそのまま返す。
 *
 * プロフィール更新と招待受諾の両方から利用する共通ロジック。
 */
export async function resolveFavoriteClubId(
  favoriteClubId: string | null | undefined
): Promise<string | null> {
  if (!favoriteClubId) return null
  if (!favoriteClubId.startsWith("static-")) return favoriteClubId

  const parts = favoriteClubId.split("-") // ["static", code, tla]
  if (parts.length < 3) return null

  const leagueCode = parts[1]
  const tla = parts.slice(2).join("-") // TLA にハイフンが含まれる場合に対応
  const staticTeam = ALL_STATIC_TEAMS.find(
    (t) => t.leagueCode === leagueCode && t.tla === tla
  )
  if (!staticTeam) return null

  const syntheticApiId = getSyntheticApiTeamId(leagueCode, tla)
  const team = await prisma.team.upsert({
    where: { apiTeamId: syntheticApiId },
    update: {
      name: staticTeam.name,
      shortName: staticTeam.shortName,
      tla: staticTeam.tla,
      leagueCode: staticTeam.leagueCode,
    },
    create: {
      apiTeamId: syntheticApiId,
      name: staticTeam.name,
      shortName: staticTeam.shortName,
      tla: staticTeam.tla,
      leagueCode: staticTeam.leagueCode,
      crestUrl: null,
    },
  })
  return team.id
}
