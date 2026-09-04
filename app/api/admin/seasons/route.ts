import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { fetchTeams } from "@/lib/football-data"
import { z } from "zod"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const seasons = await prisma.season.findMany({
    orderBy: { seasonYear: "desc" },
    include: {
      _count: {
        select: { predictions: true, seasonTeams: true },
      },
    },
  })

  // 各シーズンの最小/最大 played を集計（開示ボタン活性判定に使う）
  const seasonIds = seasons.map((s) => s.id)
  const standings = await prisma.standing.findMany({
    where: { seasonId: { in: seasonIds } },
    select: { seasonId: true, played: true },
  })
  const playedBySeason = new Map<string, { min: number; max: number; count: number }>()
  for (const s of standings) {
    const cur = playedBySeason.get(s.seasonId)
    if (!cur) {
      playedBySeason.set(s.seasonId, { min: s.played, max: s.played, count: 1 })
    } else {
      cur.min = Math.min(cur.min, s.played)
      cur.max = Math.max(cur.max, s.played)
      cur.count += 1
    }
  }

  const enriched = seasons.map((s) => {
    const played = playedBySeason.get(s.id) ?? { min: 0, max: 0, count: 0 }
    return {
      ...s,
      minPlayed: played.min,
      maxPlayed: played.max,
      standingsCount: played.count,
    }
  })

  return NextResponse.json(enriched)
}

const createSeasonSchema = z.object({
  leagueCode: z.string().default("PL"),
  seasonYear: z.number().int(),
  name: z.string().min(1),
  predictionDeadline: z.string().datetime(),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json()
  const parsed = createSeasonSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input", details: parsed.error }, { status: 400 })
  }

  const { leagueCode, seasonYear, name, predictionDeadline } = parsed.data

  const season = await prisma.season.create({
    data: {
      leagueCode,
      seasonYear,
      name,
      predictionDeadline: new Date(predictionDeadline),
    },
  })

  // Try to sync teams from football-data.org
  try {
    const data = await fetchTeams(leagueCode, seasonYear)
    const apiTeams = data.teams ?? []

    for (const apiTeam of apiTeams) {
      const team = await prisma.team.upsert({
        where: { apiTeamId: apiTeam.id },
        update: {
          name: apiTeam.name,
          shortName: apiTeam.shortName,
          tla: apiTeam.tla,
          crestUrl: apiTeam.crest,
        },
        create: {
          apiTeamId: apiTeam.id,
          name: apiTeam.name,
          shortName: apiTeam.shortName,
          tla: apiTeam.tla,
          crestUrl: apiTeam.crest,
          leagueCode,
        },
      })

      await prisma.seasonTeam.upsert({
        where: { seasonId_teamId: { seasonId: season.id, teamId: team.id } },
        update: {},
        create: { seasonId: season.id, teamId: team.id },
      })
    }
  } catch (err) {
    console.error("Failed to sync teams on season creation:", err)
  }

  return NextResponse.json(season, { status: 201 })
}
