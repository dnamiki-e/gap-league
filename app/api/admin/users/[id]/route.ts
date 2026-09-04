import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { Prisma } from "@prisma/client"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { blockUserDeletion } from "@/lib/admin-users"
import { parseBooleanFlag } from "@/lib/auth-policy"
import { z } from "zod"

const updateUserSchema = z.object({
  isAdmin: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const body = await req.json()
  const parsed = updateUserSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  }

  const updateData: { isAdmin?: boolean; isActive?: boolean } = {}
  if (parsed.data.isAdmin !== undefined) updateData.isAdmin = parsed.data.isAdmin
  if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive

  const user = await prisma.user.update({
    where: { id },
    data: updateData,
    select: { id: true, isAdmin: true, isActive: true },
  })

  return NextResponse.json(user)
}

// 管理者によるユーザー削除。
// 予想・スコアを持つユーザーは ?force=true を付けない限り削除しない（409 を返す）。
// force 時は予想・スコアもトランザクションでまとめて削除する。
// Account / Session / InvitationToken は FK の ON DELETE CASCADE で消える。
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin || !session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const force = parseBooleanFlag(req.nextUrl.searchParams.get("force"))

  const target = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      displayName: true,
      isAdmin: true,
      _count: { select: { predictions: true, scores: true } },
    },
  })
  if (!target) {
    return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 })
  }

  const adminCount = await prisma.user.count({ where: { isAdmin: true } })

  const block = blockUserDeletion(
    {
      id: target.id,
      isAdmin: target.isAdmin,
      predictionCount: target._count.predictions,
      scoreCount: target._count.scores,
    },
    { requesterId: session.user.id, adminCount, force }
  )
  if (block) {
    const { status, ...payload } = block
    return NextResponse.json(payload, { status })
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Prediction / Score は FK が RESTRICT のため明示的に消す。
      // PredictionDetail は Prediction 削除でカスケードする。
      await tx.prediction.deleteMany({ where: { userId: id } })
      await tx.score.deleteMany({ where: { userId: id } })
      await tx.user.delete({ where: { id } })
    })
  } catch (err) {
    // P2025: 取得後に他の管理者が削除した（並行操作）
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return NextResponse.json({ error: "ユーザーが見つかりません" }, { status: 404 })
    }
    throw err
  }

  return NextResponse.json({
    ok: true,
    deleted: {
      id: target.id,
      email: target.email,
      displayName: target.displayName,
      predictionCount: target._count.predictions,
      scoreCount: target._count.scores,
    },
  })
}
