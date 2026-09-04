import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getSquadForTeam, searchPlayers } from "@/lib/players"

/**
 * 得点予想の候補選手。
 *   ?teamId=<Team id>&seasonId=<Season id>  … そのクラブのスカッド
 *   ?q=<名前>&seasonId=<Season id>          … 同期済みの選手を名前で検索
 *
 * seasonId を渡すと、そのシーズンの前年の得点上位3人を候補から外す。
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const teamId = searchParams.get("teamId")
  const q = searchParams.get("q")
  const seasonId = searchParams.get("seasonId")

  const season = seasonId
    ? await prisma.season.findUnique({
        where: { id: seasonId },
        select: { leagueCode: true, seasonYear: true },
      })
    : null

  try {
    if (teamId) {
      return NextResponse.json({ players: await getSquadForTeam(teamId, season ?? undefined) })
    }
    if (q) {
      return NextResponse.json({ players: await searchPlayers(q, season ?? undefined) })
    }
  } catch {
    return NextResponse.json({ error: "選手一覧を取得できませんでした" }, { status: 503 })
  }

  return NextResponse.json({ error: "teamId または q が必要です" }, { status: 400 })
}
