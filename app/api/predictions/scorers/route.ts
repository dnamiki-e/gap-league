import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { fetchExcludedPlayerIds } from "@/lib/league-data"
import { getScorerDeadline } from "@/lib/season-visibility"

/**
 * 得点予想（1シーズンにつき最大3人）。
 *
 * 順位予想の /api/predictions とは別にしてある。あちらは details を総入れ替えする
 * オートセーブなので、同じ口にすると順位を触るたびに得点予想を消す事故が起きる。
 */

const MAX_PICKS = 3
const scorersSchema = z.object({
  seasonId: z.string(),
  picks: z
    .array(
      z.object({
        playerId: z.string(),
        slot: z.number().int().min(1).max(MAX_PICKS),
        /** どのクラブの一覧から選んだか。上流が移籍前後の両クラブに同じ選手を載せるため */
        pickedTeamId: z.string().optional(),
      })
    )
    .max(MAX_PICKS),
})

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const seasonId = new URL(req.url).searchParams.get("seasonId")
  if (!seasonId) return NextResponse.json({ error: "seasonId required" }, { status: 400 })

  const prediction = await prisma.prediction.findUnique({
    where: { userId_seasonId: { userId: session.user.id, seasonId } },
    include: {
      scorers: {
        include: {
          player: { include: { team: { select: { name: true, shortName: true } } } },
          pickedTeam: { select: { name: true, shortName: true } },
        },
        orderBy: { slot: "asc" },
      },
    },
  })

  return NextResponse.json({ picks: prediction?.scorers ?? [] })
}

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = scorersSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: "入力が不正です" }, { status: 400 })
  const { seasonId, picks } = parsed.data

  const season = await prisma.season.findUnique({ where: { id: seasonId } })
  if (!season) return NextResponse.json({ error: "Season not found" }, { status: 404 })
  if (season.isLocked) return NextResponse.json({ error: "確定済みのシーズンです" }, { status: 403 })
  // 得点予想は順位予想と別の締切を持つ（未設定なら順位予想と同じ）
  if (new Date() > getScorerDeadline(season)) {
    return NextResponse.json({ error: "得点予想の締切を過ぎています" }, { status: 403 })
  }

  // 同じ選手を複数枠に入れられない（@@id([predictionId, playerId]) でも弾かれるが、
  // ここで返した方がユーザーに理由が伝わる）
  const playerIds = picks.map((p) => p.playerId)
  if (new Set(playerIds).size !== playerIds.length) {
    return NextResponse.json({ error: "同じ選手は1人までです" }, { status: 400 })
  }
  const slots = picks.map((p) => p.slot)
  if (new Set(slots).size !== slots.length) {
    return NextResponse.json({ error: "枠が重複しています" }, { status: 400 })
  }

  if (playerIds.length > 0) {
    const players = await prisma.player.findMany({
      where: { id: { in: playerIds } },
      select: { apiPlayerId: true },
    })
    if (players.length !== playerIds.length) {
      return NextResponse.json({ error: "選手が見つかりません" }, { status: 400 })
    }
    // 画面を通さずに送られても弾く（前年の得点上位10人は指名できない）
    const excluded = await fetchExcludedPlayerIds({
      leagueCode: season.leagueCode,
      seasonYear: season.seasonYear,
    })
    if (players.some((p) => excluded.has(p.apiPlayerId))) {
      return NextResponse.json(
        { error: "前シーズンの得点上位10人は指名できません" },
        { status: 400 }
      )
    }
  }

  const result = await prisma.$transaction(async (tx) => {
    // 順位予想より先に得点予想を入れる人がいるので、無ければ器だけ作る
    const prediction =
      (await tx.prediction.findUnique({
        where: { userId_seasonId: { userId: session.user!.id, seasonId } },
      })) ??
      (await tx.prediction.create({ data: { userId: session.user!.id, seasonId } }))

    await tx.predictionScorer.deleteMany({ where: { predictionId: prediction.id } })
    if (picks.length > 0) {
      await tx.predictionScorer.createMany({
        data: picks.map((p) => ({
          predictionId: prediction.id,
          playerId: p.playerId,
          slot: p.slot,
          pickedTeamId: p.pickedTeamId ?? null,
        })),
      })
    }
    return tx.predictionScorer.findMany({
      where: { predictionId: prediction.id },
      include: {
        player: { include: { team: { select: { name: true, shortName: true } } } },
        pickedTeam: { select: { name: true, shortName: true } },
      },
      orderBy: { slot: "asc" },
    })
  })

  return NextResponse.json({ picks: result })
}
