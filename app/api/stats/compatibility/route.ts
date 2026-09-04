import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canShowPredictions } from "@/lib/season-visibility"

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const seasonId = searchParams.get("seasonId")

  if (!seasonId) {
    return NextResponse.json({ error: "seasonId required" }, { status: 400 })
  }

  // 相性診断は他人のpredictedRankを前提にした機能のため、
  // 公開ゲートが閉じている間は機能ごと拒否する
  const season = await prisma.season.findUnique({ where: { id: seasonId } })
  const standingsForGate = await prisma.standing.findMany({ where: { seasonId } })
  if (!canShowPredictions(season, standingsForGate)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  // Get all predictions for this season
  const predictions = await prisma.prediction.findMany({
    where: { seasonId },
    include: {
      user: { select: { id: true, displayName: true, email: true, image: true, favoriteClub: { select: { name: true, crestUrl: true } } } },
      details: true,
    },
  })

  const myPrediction = predictions.find(p => p.userId === session.user!.id)
  if (!myPrediction || myPrediction.details.length === 0) {
    return NextResponse.json({ error: "Your prediction not found" }, { status: 404 })
  }

  // Create teamId → predictedRank map for current user
  const myRankMap = new Map(myPrediction.details.map(d => [d.teamId, d.predictedRank]))

  // Calculate compatibility with each other user
  const MAX_DIFF_SCORE = 200  // maximum possible difference (perfect inversion of 20 teams)

  const compatibilities = predictions
    .filter(p => p.userId !== session.user!.id)
    .map(p => {
      if (p.details.length === 0) return null

      const theirRankMap = new Map(p.details.map(d => [d.teamId, d.predictedRank]))
      const commonTeams = [...myRankMap.keys()].filter(id => theirRankMap.has(id))

      if (commonTeams.length === 0) return null

      const diffSum = commonTeams.reduce((sum, teamId) => {
        const myRank = myRankMap.get(teamId)!
        const theirRank = theirRankMap.get(teamId)!
        return sum + Math.abs(myRank - theirRank)
      }, 0)

      // Scale: normalize to max possible for same number of teams
      const scaledMax = (commonTeams.length / 20) * MAX_DIFF_SCORE
      const compatibilityScore = Math.round((1 - diffSum / scaledMax) * 100)

      // Find biggest agreement/disagreement points
      const teamDiffs = commonTeams.map(teamId => ({
        teamId,
        myRank: myRankMap.get(teamId)!,
        theirRank: theirRankMap.get(teamId)!,
        diff: Math.abs(myRankMap.get(teamId)! - theirRankMap.get(teamId)!),
      }))

      const biggestAgreements = teamDiffs.filter(d => d.diff === 0).length
      const biggestDisagreement = teamDiffs.sort((a, b) => b.diff - a.diff)[0]

      return {
        userId: p.userId,
        displayName: p.user.displayName,
        email: p.user.email,
        image: p.user.image,
        favoriteClub: p.user.favoriteClub,
        compatibilityScore,
        diffSum,
        exactMatches: biggestAgreements,
        biggestDisagreementDiff: biggestDisagreement?.diff ?? 0,
      }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => b.compatibilityScore - a.compatibilityScore)

  return NextResponse.json({
    userId: session.user.id,
    seasonId,
    totalCompared: compatibilities.length,
    mostSimilar: compatibilities[0] ?? null,
    mostDifferent: compatibilities[compatibilities.length - 1] ?? null,
    all: compatibilities,
  })
}
