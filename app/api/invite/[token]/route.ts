import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { hashPassword } from "@/lib/password"
import { resolveFavoriteClubId } from "@/lib/teams"
import { z } from "zod"

// 招待トークン自体が認可となるため、これらのエンドポイントはログイン不要。

async function findValidInvite(token: string) {
  const invite = await prisma.invitationToken.findUnique({
    where: { token },
    include: { user: { select: { email: true, displayName: true } } },
  })
  if (!invite) return null
  if (invite.usedAt) return null
  if (invite.expiresAt.getTime() < Date.now()) return null
  return invite
}

// GET: トークン検証。有効なら対象ユーザーの email/nickname を返す（秘密は返さない）。
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const invite = await findValidInvite(token)
  if (!invite) {
    return NextResponse.json(
      { error: "この招待リンクは無効か、有効期限が切れています" },
      { status: 404 }
    )
  }
  return NextResponse.json({
    email: invite.user.email,
    nickname: invite.user.displayName,
  })
}

const acceptSchema = z.object({
  password: z.string().min(8, "パスワードは8文字以上にしてください"),
  displayName: z.string().min(1).max(50),
  favoriteClubId: z.string().optional().nullable(),
})

// POST: パスワード/プロフィールを設定して招待を消費する。
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  const body = await req.json().catch(() => null)
  const parsed = acceptSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    )
  }

  const invite = await findValidInvite(token)
  if (!invite) {
    return NextResponse.json(
      { error: "この招待リンクは無効か、有効期限が切れています" },
      { status: 404 }
    )
  }

  const passwordHash = await hashPassword(parsed.data.password)
  const favoriteClubId = await resolveFavoriteClubId(parsed.data.favoriteClubId)

  try {
    await prisma.$transaction(async (tx) => {
      // usedAt=null かつ未期限を条件に更新してレース（二重消費）と期限切れ消費を防ぐ
      const consumed = await tx.invitationToken.updateMany({
        where: { token, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      })
      if (consumed.count === 0) {
        throw new Error("ALREADY_USED")
      }
      await tx.user.update({
        where: { id: invite.userId },
        data: {
          passwordHash,
          displayName: parsed.data.displayName,
          favoriteClubId,
          profileSetup: true,
        },
      })
    })
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_USED") {
      return NextResponse.json(
        { error: "この招待リンクは既に使用されています" },
        { status: 409 }
      )
    }
    throw e
  }

  // クライアントはこの email と入力済みパスワードで signIn("credentials") する
  return NextResponse.json({ email: invite.user.email })
}
