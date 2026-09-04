import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { calculateScore } from "@/lib/scoring"
import { getScoringConfig } from "@/lib/site-config"
import { canShowRankings } from "@/lib/season-visibility"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const scoring = await getScoringConfig()

  const { searchParams } = new URL(req.url)
  const seasonId = searchParams.get("seasonId")

  if (!seasonId) {
    return NextResponse.json({ error: "seasonId required" }, { status: 400 })
  }

  const season = await prisma.season.findUnique({ where: { id: seasonId } })
  // ゲート判定は StandingSnapshot ではなく Standing の played で行う（現在の進行節数を反映するため）
  const standingsForGate = await prisma.standing.findMany({ where: { seasonId } })
  const showRankings = canShowRankings(season, standingsForGate)

  // Get all snapshots for this season, grouped by matchday
  const snapshots = await prisma.standingSnapshot.findMany({
    where: { seasonId },
    orderBy: [{ matchday: "asc" }, { actualRank: "asc" }],
  })

  if (snapshots.length === 0) {
    return NextResponse.json({ matchdays: [], users: [] })
  }

  // Get all predictions for this season
  const predictions = await prisma.prediction.findMany({
    where: { seasonId },
    include: {
      user: { select: { id: true, displayName: true, email: true, image: true } },
      details: true,
    },
  })

  // Group snapshots by matchday
  const matchdayMap = new Map<number, Map<string, number>>()
  for (const snap of snapshots) {
    if (!matchdayMap.has(snap.matchday)) {
      matchdayMap.set(snap.matchday, new Map())
    }
    matchdayMap.get(snap.matchday)!.set(snap.teamId, snap.actualRank)
  }

  const matchdays = [...matchdayMap.keys()].sort((a, b) => a - b)

  // For each matchday, calculate each user's score and rank
  const userScoresPerMatchday: Array<{
    matchday: number
    scores: Array<{ userId: string; score: number; rank: number }>
  }> = []

  for (const matchday of matchdays) {
    const standingMap = matchdayMap.get(matchday)!

    const scores = predictions
      .map(pred => {
        const scoreDetails = pred.details
          .map(d => {
            const actualRank = standingMap.get(d.teamId)
            if (actualRank === undefined) return null
            return { predictedRank: d.predictedRank, actualRank }
          })
          .filter((d): d is { predictedRank: number; actualRank: number } => d !== null)

        if (scoreDetails.length === 0) return null
        return { userId: pred.userId, score: calculateScore(scoreDetails, scoring) }
      })
      .filter((s): s is { userId: string; score: number } => s !== null)

    scores.sort((a, b) => a.score - b.score)
    const withRanks = scores.map((s, i) => ({ ...s, rank: i + 1 }))

    userScoresPerMatchday.push({ matchday, scores: withRanks })
  }

  // Build user list with their full timeline
  const userTimelines = predictions.map(pred => {
    const timeline = userScoresPerMatchday.map(({ matchday, scores }) => {
      const entry = scores.find(s => s.userId === pred.userId)
      return {
        matchday,
        score: entry?.score ?? null,
        rank: entry?.rank ?? null,
      }
    })

    return {
      userId: pred.userId,
      displayName: pred.user.displayName,
      email: pred.user.email,
      image: pred.user.image,
      timeline,
      currentRank: timeline[timeline.length - 1]?.rank ?? null,
      currentScore: timeline[timeline.length - 1]?.score ?? null,
    }
  })

  // 締切前・終盤モードでは他人の行を除外し、自分の行だけ返す
  const visibleUsers = showRankings
    ? userTimelines
    : userTimelines.filter((u) => u.userId === session.user!.id)

  return NextResponse.json({
    seasonId,
    matchdays,
    users: visibleUsers,
  })
}
