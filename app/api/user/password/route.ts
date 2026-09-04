import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { hashPassword, verifyPassword } from "@/lib/password"
import { z } from "zod"

const schema = z.object({
  // パスワード未設定（Google ログインのみ）のユーザーは省略可
  currentPassword: z.string().optional(),
  newPassword: z
    .string()
    .min(8, "新しいパスワードは8文字以上にしてください")
    .max(128),
})

// ログイン中ユーザーのパスワード変更／初回設定。
// 「変更」か「新規設定」かは DB の passwordHash のみで判定する（クライアント申告は信用しない）。
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    )
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, passwordHash: true },
  })
  if (!user) {
    return NextResponse.json(
      { error: "セッションが無効です。再ログインしてください" },
      { status: 401 }
    )
  }

  // 既にパスワードがある場合のみ現在のパスワードを検証する
  if (user.passwordHash) {
    const current = parsed.data.currentPassword ?? ""
    if (!current) {
      return NextResponse.json(
        { error: "現在のパスワードを入力してください" },
        { status: 400 }
      )
    }
    const ok = await verifyPassword(current, user.passwordHash)
    if (!ok) {
      return NextResponse.json(
        { error: "現在のパスワードが正しくありません" },
        { status: 400 }
      )
    }
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(parsed.data.newPassword) },
  })

  return NextResponse.json({ ok: true, hasPassword: true })
}
