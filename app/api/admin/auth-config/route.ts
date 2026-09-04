import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import {
  getAuthConfig,
  getEnvAuthConfig,
  googleRedirectUri,
  updateAuthConfig,
} from "@/lib/auth-config"
import { isGoogleEnabled } from "@/lib/auth-policy"
import { z } from "zod"

/**
 * 認証設定の参照・更新（管理者のみ）。
 *
 * クライアントシークレットの平文は返さない（設定済みかどうかだけ返す）。
 * 一度入れた値を画面に出す必要はなく、出せば漏れる経路が増えるだけ。
 */

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }
  const config = await getAuthConfig()
  return NextResponse.json({
    mode: config.mode,
    allowSignup: config.allowSignup,
    googleClientId: config.googleClientId,
    /** 平文は返さない。入っているかどうかだけ */
    googleClientSecretSet: config.googleClientSecret !== "",
    allowedEmailDomain: config.allowedEmailDomain,
    source: config.source,
    googleRedirectUri: googleRedirectUri(),
    /** NEXTAUTH_SECRET が無いとシークレットを暗号化保存できない */
    canStoreSecret: Boolean(process.env.NEXTAUTH_SECRET),
  })
}

const schema = z.object({
  mode: z.enum(["password", "google", "both"]),
  allowSignup: z.boolean(),
  googleClientId: z.string().trim().max(200),
  /** 未入力（undefined）は「変更しない」。空文字は「DB の保存値を消して環境変数に戻す」 */
  googleClientSecret: z.string().max(400).optional(),
  allowedEmailDomain: z
    .string()
    .trim()
    .max(100)
    .refine((v) => v === "" || /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v), {
      message: "ドメインの形式が正しくありません（例: example.com。空欄で制限なし）",
    }),
})

export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 }
    )
  }
  const input = parsed.data

  // ロックアウト防止: Google だけの構成にしたのに資格情報が無い、という保存を拒否する。
  //
  // 判定は「保存した後に効く値」で行う必要がある。空欄で送られた項目は DB から消えて
  // 環境変数へ戻るので、保存前の値（current）ではなく env の値を見る。
  // ここを current で見ると、DB の値を消しながら Google 専用に切り替える操作を
  // 通してしまい、誰もログインできなくなる。
  const current = await getAuthConfig()
  const env = getEnvAuthConfig()

  const effectiveClientId = input.googleClientId !== "" ? input.googleClientId : env.googleClientId
  const effectiveSecret =
    input.googleClientSecret === undefined
      ? current.googleClientSecret
      : input.googleClientSecret.trim() !== ""
        ? input.googleClientSecret.trim()
        : env.googleClientSecret

  if (isGoogleEnabled(input.mode) && (!effectiveClientId || !effectiveSecret)) {
    return NextResponse.json(
      {
        error:
          "Google ログインを有効にするには、クライアントIDとクライアントシークレットの両方が必要です",
      },
      { status: 400 }
    )
  }

  // 逆向きのロックアウト。Google を切るなら、パスワードで入れる管理者が
  // 実在しなければならない。Google だけで運用してきた環境では管理者全員が
  // passwordHash を持たないため、ここを塞がないと「パスワードのみ」に
  // 切り替えた瞬間に誰もログインできなくなる（復旧は DB 直叩きのみ）。
  if (!isGoogleEnabled(input.mode)) {
    const adminsWithPassword = await prisma.user.count({
      where: { isAdmin: true, isActive: true, passwordHash: { not: null } },
    })
    if (adminsWithPassword === 0) {
      return NextResponse.json(
        {
          error:
            "パスワードを設定した管理者が1人もいないため、この設定にすると誰もログインできなくなります。先に「プロフィール」からパスワードを設定してください。",
        },
        { status: 400 }
      )
    }
  }

  try {
    await updateAuthConfig({
      mode: input.mode,
      allowSignup: input.allowSignup,
      googleClientId: input.googleClientId,
      googleClientSecret: input.googleClientSecret,
      allowedEmailDomain: input.allowedEmailDomain,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "保存に失敗しました" },
      { status: 500 }
    )
  }

  return GET()
}
