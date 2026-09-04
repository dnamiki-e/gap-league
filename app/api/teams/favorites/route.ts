import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { LEAGUE_GROUPS } from "@/lib/league-teams"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // DB の全チームを TLA で引く（既に同期済みのものは crest URL 付き）
  const dbTeams = await prisma.team.findMany()
  const dbByTla = new Map(dbTeams.map((t) => [t.tla, t]))
  const dbByName = new Map(dbTeams.map((t) => [t.name.toLowerCase(), t]))

  const groups = LEAGUE_GROUPS.map((group) => ({
    code: group.code,
    name: group.name,
    teams: group.teams.map((staticTeam) => {
      const dbTeam =
        dbByTla.get(staticTeam.tla) ??
        dbByName.get(staticTeam.name.toLowerCase())

      return {
        // DB に存在する場合は実 ID、なければ "static-{code}-{tla}" のプレースホルダー
        id: dbTeam?.id ?? staticTeam.id,
        name: staticTeam.name,
        shortName: staticTeam.shortName,
        tla: staticTeam.tla,
        leagueCode: staticTeam.leagueCode,
        crestUrl: dbTeam?.crestUrl ?? null,
        isStatic: !dbTeam, // プロフィール保存時に upsert が必要かどうかのフラグ
      }
    }),
  }))

  return NextResponse.json(groups)
}
