import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { randomBytes } from "crypto"
import { z } from "zod"

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ""
const INVITE_TTL_DAYS = 7

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    // passwordHash を返さないよう必要フィールドのみ select する
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      displayName: true,
      isAdmin: true,
      isActive: true,
      profileSetup: true,
      createdAt: true,
      favoriteClub: {
        select: { name: true, crestUrl: true, tla: true },
      },
      scores: {
        select: { totalPoints: true, season: { select: { name: true } } },
        orderBy: { calculatedAt: "desc" },
      },
      _count: {
        select: { predictions: true },
      },
    },
  })

  return NextResponse.json(users)
}

const createSchema = z.object({
  email: z.string().email(),
  nickname: z.string().max(50).optional(),
})

// 管理者が参加者を発行する。ユーザー作成＋招待トークンを返す。
// 招待URLの絶対化はクライアント側で window.location.origin を前置する。
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = createSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 })
  }
  const { email, nickname } = parsed.data

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) {
    return NextResponse.json(
      { error: "このメールアドレスは既に登録されています" },
      { status: 409 }
    )
  }

  const token = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000)

  let user, invitation
  try {
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email,
          displayName: nickname ?? null,
          isActive: true,
          profileSetup: false,
        },
      })
      const invitation = await tx.invitationToken.create({
        data: { token, userId: user.id, expiresAt },
      })
      return { user, invitation }
    })
    user = result.user
    invitation = result.invitation
  } catch (e) {
    // 事前チェックとの競合でユニーク制約に当たった場合も 409 にする
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "このメールアドレスは既に登録されています" },
        { status: 409 }
      )
    }
    throw e
  }

  return NextResponse.json({
    user: { id: user.id, email: user.email, displayName: user.displayName },
    invitePath: `${BASE_PATH}/invite/${invitation.token}`,
    expiresAt: invitation.expiresAt,
  })
}
