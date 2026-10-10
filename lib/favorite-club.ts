import { prisma } from "@/lib/prisma"
import { isPlayed } from "@/lib/fixtures"

/** ホームに出す試合数 */
export const FAVORITE_FIXTURE_LIMIT = 3

/** キックオフからこの時間までは「試合中・直後」として残す（過ぎたらホームからは消す） */
const KEEP_AFTER_KICKOFF_MS = 3 * 60 * 60 * 1000

export interface ClubRef {
  id: string
  name: string
  tla: string | null
}

/**
 * 推しクラブと同じクラブを指す Team の id を集める（推しクラブ自身を含む）。
 *
 * 推しクラブに、まだ同期されていないリーグのクラブを選ぶと、実データとは別の
 * ダミー Team（apiTeamId が負）が作られる。後からそのリーグが同期されても
 * 紐付けは張り直されないので、ID の一致だけで試合を引くと日程が出ない。
 * そこでダミーのときだけ、名前（無ければ TLA が一意なとき）で実データ側の Team を探す。
 *
 * TLA だけで引かないのは、別リーグで同じ TLA を持つクラブがあるため
 * （例: ブレントフォードとブレスト）。名前が一致すればそれを優先する。
 */
export function pickSameClubIds(fav: ClubRef, candidates: ClubRef[]): string[] {
  const others = candidates.filter((c) => c.id !== fav.id)
  const byName = others.filter((c) => c.name.toLowerCase() === fav.name.toLowerCase())
  if (byName.length > 0) return [fav.id, ...byName.map((c) => c.id)]

  const byTla = fav.tla ? others.filter((c) => c.tla === fav.tla) : []
  if (byTla.length === 1) return [fav.id, byTla[0].id]
  return [fav.id]
}

export async function resolveClubTeamIds(favoriteClubId: string): Promise<{
  club: { id: string; name: string; shortName: string | null; crestUrl: string | null } | null
  teamIds: string[]
}> {
  const fav = await prisma.team.findUnique({
    where: { id: favoriteClubId },
    select: { id: true, name: true, shortName: true, tla: true, crestUrl: true, apiTeamId: true },
  })
  if (!fav) return { club: null, teamIds: [] }

  // 実データの Team なら ID だけで足りる
  if (fav.apiTeamId >= 0) return { club: fav, teamIds: [fav.id] }

  const candidates = await prisma.team.findMany({
    where: {
      apiTeamId: { gt: 0 },
      OR: [{ name: { equals: fav.name, mode: "insensitive" } }, ...(fav.tla ? [{ tla: fav.tla }] : [])],
    },
    select: { id: true, name: true, tla: true, crestUrl: true },
  })
  const teamIds = pickSameClubIds(fav, candidates)
  // ダミーはエンブレムを持たない。実データ側にあればそれを使う
  const crestUrl = fav.crestUrl ?? candidates.find((c) => teamIds.includes(c.id) && c.crestUrl)?.crestUrl ?? null
  return { club: { ...fav, crestUrl }, teamIds }
}

/**
 * 推しクラブのこれからの試合。進行中の（確定していない）シーズンだけが対象。
 * 国内リーグと CL の両方に出ているクラブなら、日付順に混ざって出る。
 */
export async function getFavoriteClubFixtures(favoriteClubId: string, now: Date = new Date()) {
  const { club, teamIds } = await resolveClubTeamIds(favoriteClubId)
  if (!club) return null

  const rows = await prisma.match.findMany({
    where: {
      season: { isActive: true, isLocked: false },
      utcDate: { gte: new Date(now.getTime() - KEEP_AFTER_KICKOFF_MS) },
      OR: [{ homeTeamId: { in: teamIds } }, { awayTeamId: { in: teamIds } }],
    },
    orderBy: { utcDate: "asc" },
    // 延期を除いてから切るので、余裕を持って取る
    take: FAVORITE_FIXTURE_LIMIT * 3,
    include: {
      season: { select: { leagueCode: true } },
      homeTeam: { select: { id: true, name: true, shortName: true, crestUrl: true } },
      awayTeam: { select: { id: true, name: true, shortName: true, crestUrl: true } },
    },
  })

  const fixtures = rows
    .filter(isPlayed)
    .slice(0, FAVORITE_FIXTURE_LIMIT)
    .map((m) => {
      const isHome = teamIds.includes(m.homeTeamId)
      return {
        id: m.id,
        status: m.status,
        utcDate: m.utcDate,
        leagueCode: m.season.leagueCode,
        isHome,
        opponent: isHome ? m.awayTeam : m.homeTeam,
        scoreFor: isHome ? m.scoreHomeFt : m.scoreAwayFt,
        scoreAgainst: isHome ? m.scoreAwayFt : m.scoreHomeFt,
      }
    })

  return { club, fixtures }
}

export type FavoriteClubFixtures = NonNullable<Awaited<ReturnType<typeof getFavoriteClubFixtures>>>
