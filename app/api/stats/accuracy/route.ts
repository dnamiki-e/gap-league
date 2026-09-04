import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canShowRankings } from "@/lib/season-visibility"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const seasonId = searchParams.get("seasonId")
  const targetUserId = searchParams.get("userId") ?? session.user.id

  if (!seasonId) {
    return NextResponse.json({ error: "seasonId required" }, { status: 400 })
  }

  const standings = await prisma.standing.findMany({ where: { seasonId } })

  // 他人のデータをピンポイントで要求している場合は、公開ゲートが閉じていれば
  // 予想の有無すら漏らさないよう、404 より先に 403 で拒否する
  if (targetUserId !== session.user.id) {
    const season = await prisma.season.findUnique({ where: { id: seasonId } })
    if (!canShowRankings(season, standings)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const prediction = await prisma.prediction.findUnique({
    where: { userId_seasonId: { userId: targetUserId, seasonId } },
    include: { details: { include: { team: true } } },
  })

  if (!prediction) {
    return NextResponse.json({ error: "No prediction found" }, { status: 404 })
  }

  if (standings.length === 0) {
    return NextResponse.json({ error: "No standings data yet" }, { status: 404 })
  }

  const standingMap = new Map(standings.map((s) => [s.teamId, s.actualRank]))

  // Per-team analysis
  const teamAnalysis = prediction.details.map((d) => {
    const actualRank = standingMap.get(d.teamId)
    if (actualRank === undefined) return null
    const diff = Math.abs(d.predictedRank - actualRank)
    return {
      teamId: d.teamId,
      teamName: d.team.name,
      teamTla: d.team.tla,
      crestUrl: d.team.crestUrl,
      predictedRank: d.predictedRank,
      actualRank,
      diff,
      points: diff === 0 ? -2 : diff,
    }
  }).filter((d): d is NonNullable<typeof d> => d !== null)

  const total = teamAnalysis.length
  if (total === 0) return NextResponse.json({ error: "No matching standings" }, { status: 404 })

  // Accuracy metrics
  const exact = teamAnalysis.filter((d) => d.diff === 0).length
  const within1 = teamAnalysis.filter((d) => d.diff <= 1).length
  const within2 = teamAnalysis.filter((d) => d.diff <= 2).length
  const within3 = teamAnalysis.filter((d) => d.diff <= 3).length
  const within5 = teamAnalysis.filter((d) => d.diff <= 5).length
  const avgDiff = teamAnalysis.reduce((sum, d) => sum + d.diff, 0) / total

  // Zone accuracy (Top4, Top6, Relegation zone = bottom 3)
  const top4Predicted = new Set(prediction.details.filter(d => d.predictedRank <= 4).map(d => d.teamId))
  const top4Actual = new Set(standings.filter(s => s.actualRank <= 4).map(s => s.teamId))
  const top4Hit = [...top4Predicted].filter(id => top4Actual.has(id)).length

  const topHalfPredicted = new Set(prediction.details.filter(d => d.predictedRank <= 10).map(d => d.teamId))
  const topHalfActual = new Set(standings.filter(s => s.actualRank <= 10).map(s => s.teamId))
  const topHalfHit = [...topHalfPredicted].filter(id => topHalfActual.has(id)).length

  const relegPredicted = new Set(prediction.details.filter(d => d.predictedRank >= 18).map(d => d.teamId))
  const relegActual = new Set(standings.filter(s => s.actualRank >= 18).map(s => s.teamId))
  const relegHit = [...relegPredicted].filter(id => relegActual.has(id)).length

  const totalScore = teamAnalysis.reduce((sum, d) => sum + d.points, 0)

  return NextResponse.json({
    userId: targetUserId,
    seasonId,
    total,
    totalScore,
    metrics: {
      exactRate: (exact / total) * 100,
      within1Rate: (within1 / total) * 100,
      within2Rate: (within2 / total) * 100,
      within3Rate: (within3 / total) * 100,
      within5Rate: (within5 / total) * 100,
      avgDiff: Math.round(avgDiff * 10) / 10,
      exactCount: exact,
      within1Count: within1,
    },
    zones: {
      top4: { predicted: top4Predicted.size, hit: top4Hit, rate: (top4Hit / 4) * 100 },
      topHalf: { predicted: topHalfPredicted.size, hit: topHalfHit, rate: (topHalfHit / 10) * 100 },
      relegation: { predicted: relegPredicted.size, hit: relegHit, rate: (relegHit / 3) * 100 },
    },
    teamAnalysis: teamAnalysis.sort((a, b) => a.diff - b.diff),
  })
}
