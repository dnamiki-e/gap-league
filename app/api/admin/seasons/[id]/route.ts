import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { canRevealResults, hasPassedDeadline } from "@/lib/season-visibility"

const updateSeasonSchema = z.object({
  isLocked: z.boolean().optional(),
  isActive: z.boolean().optional(),
  predictionDeadline: z.string().datetime().optional(),
  name: z.string().min(1).optional(),
  resultsRevealed: z.boolean().optional(),
})

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const parsed = updateSeasonSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  }

  const updateData: {
    isLocked?: boolean
    isActive?: boolean
    predictionDeadline?: Date
    name?: string
    resultsRevealed?: boolean
  } = {}

  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive
  if (parsed.data.predictionDeadline) {
    updateData.predictionDeadline = new Date(parsed.data.predictionDeadline)
  }
  if (parsed.data.name) updateData.name = parsed.data.name

  // isLocked / resultsRevealed の検証には現行の season 情報が必要なため先に取得しておく
  const needsSeasonLookup =
    parsed.data.isLocked === true || parsed.data.resultsRevealed === true
  const season = needsSeasonLookup
    ? await prisma.season.findUnique({ where: { id } })
    : null
  if (needsSeasonLookup && !season) {
    return NextResponse.json({ error: "Season not found" }, { status: 404 })
  }

  // isLocked=true にする場合は、予想締切を過ぎているかをサーバ側でも検証する
  // （締切前非公開の仕組みを isLocked でバイパスされることを防ぐ）。
  // 同一リクエストで predictionDeadline も更新される場合は、更新後の値で検証する。
  if (parsed.data.isLocked === true) {
    const effectiveDeadline = updateData.predictionDeadline ?? season!.predictionDeadline
    if (!hasPassedDeadline({ ...season!, predictionDeadline: effectiveDeadline })) {
      return NextResponse.json(
        { error: "予想締切前のためシーズンを確定できません" },
        { status: 400 },
      )
    }
  }
  if (parsed.data.isLocked !== undefined) updateData.isLocked = parsed.data.isLocked

  // resultsRevealed=true にする場合は最終節完了をサーバ側でも検証
  if (parsed.data.resultsRevealed !== undefined) {
    if (parsed.data.resultsRevealed === true) {
      const standings = await prisma.standing.findMany({
        where: { seasonId: id },
        select: { played: true },
      })
      if (!canRevealResults(standings, season!.leagueCode)) {
        return NextResponse.json(
          { error: "最終節が完了していないため開示できません" },
          { status: 400 },
        )
      }
    }
    updateData.resultsRevealed = parsed.data.resultsRevealed
  }

  const updated = await prisma.season.update({
    where: { id },
    data: updateData,
  })

  return NextResponse.json(updated)
}
