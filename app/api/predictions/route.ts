import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

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

  const prediction = await prisma.prediction.findUnique({
    where: {
      userId_seasonId: {
        userId: session.user.id,
        seasonId,
      },
    },
    include: { details: { include: { team: true } } },
  })

  return NextResponse.json(prediction)
}

const predictionSchema = z.object({
  seasonId: z.string(),
  details: z
    .array(
      z.object({
        teamId: z.string(),
        predictedRank: z.number().int().min(1).max(20),
        comment: z.string().max(200).optional(),
      })
    )
    .min(1)
    .max(20),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  const parsed = predictionSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  }

  const { seasonId, details } = parsed.data

  const season = await prisma.season.findUnique({ where: { id: seasonId } })
  if (!season) {
    return NextResponse.json({ error: "Season not found" }, { status: 404 })
  }
  if (season.isLocked) {
    return NextResponse.json({ error: "Season is locked" }, { status: 403 })
  }
  if (new Date() > season.predictionDeadline) {
    return NextResponse.json({ error: "Prediction deadline has passed" }, { status: 403 })
  }

  const ranks = details.map((d) => d.predictedRank)
  const teamIds = details.map((d) => d.teamId)
  if (new Set(ranks).size !== ranks.length) {
    return NextResponse.json({ error: "Duplicate ranks" }, { status: 400 })
  }
  if (new Set(teamIds).size !== teamIds.length) {
    return NextResponse.json({ error: "Duplicate teams" }, { status: 400 })
  }

  const existing = await prisma.prediction.findUnique({
    where: { userId_seasonId: { userId: session.user.id, seasonId } },
  })

  let prediction
  if (existing) {
    await prisma.predictionDetail.deleteMany({
      where: { predictionId: existing.id },
    })
    prediction = await prisma.prediction.update({
      where: { id: existing.id },
      data: {
        details: {
          create: details.map((d) => ({
            teamId: d.teamId,
            predictedRank: d.predictedRank,
            comment: d.comment ?? null,
          })),
        },
      },
      include: { details: true },
    })
  } else {
    prediction = await prisma.prediction.create({
      data: {
        userId: session.user.id,
        seasonId,
        details: {
          create: details.map((d) => ({
            teamId: d.teamId,
            predictedRank: d.predictedRank,
            comment: d.comment ?? null,
          })),
        },
      },
      include: { details: true },
    })
  }

  return NextResponse.json(prediction)
}
