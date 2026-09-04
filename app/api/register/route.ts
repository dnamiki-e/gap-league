import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { hashPassword } from "@/lib/password"
import {
  isGoogleEnabled,
  isPasswordEnabled,
  normalizeEmail,
  rejectSignupReason,
} from "@/lib/auth-policy"
import { getAuthConfig } from "@/lib/auth-config"
import { z } from "zod"

// ゲスト（自己）登録。ログイン不要の公開エンドポイント。
// 既存ユーザー行は一切更新しない（create のみ）。メール重複は 409 で返す。
// 認証方式はリクエストごとに解決する（管理画面での変更を再起動なしで効かせるため）。

const schema = z.object({
  name: z.string().trim().min(1, "お名前を入力してください").max(50),
  email: z.string().trim().email("メールアドレスの形式が正しくありません"),
  password: z.string().min(8, "パスワードは8文字以上にしてください").max(128),
})

// 簡易レート制限（プロセス内。bcrypt を叩く公開口の総当たり・大量作成対策）
const WINDOW_MS = 10 * 60 * 1000
const MAX_ATTEMPTS = 5
const attempts = new Map<string, { count: number; resetAt: number }>()

function rateLimited(key: string): boolean {
  const now = Date.now()
  const entry = attempts.get(key)
  if (!entry || entry.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS })
    // 古いエントリを掃除（メモリ肥大防止）
    if (attempts.size > 1000) {
      for (const [k, v] of attempts) if (v.resetAt < now) attempts.delete(k)
    }
    return false
  }
  entry.count += 1
  return entry.count > MAX_ATTEMPTS
}

function clientKey(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for") ?? ""
  return fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown"
}

export async function POST(req: NextRequest) {
  const authConfig = await getAuthConfig()
  if (!authConfig.allowSignup || !isPasswordEnabled(authConfig.mode)) {
    return NextResponse.json(
      { error: "現在、新規登録は受け付けていません" },
      { status: 403 }
    )
  }

  if (rateLimited(clientKey(req))) {
    return NextResponse.json(
      { error: "試行回数が多すぎます。しばらく待ってからお試しください" },
      { status: 429 }
    )
  }

  const body = await req.json().catch(() => null)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "入力内容を確認してください" },
      { status: 400 }
    )
  }

  const email = normalizeEmail(parsed.data.email)
  const rejection = rejectSignupReason(email, {
    allowSignup: authConfig.allowSignup,
    googleEnabled: isGoogleEnabled(authConfig.mode),
    allowedEmailDomain: authConfig.allowedEmailDomain,
  })
  if (rejection) {
    return NextResponse.json({ error: rejection }, { status: 403 })
  }

  const name = parsed.data.name.trim()

  try {
    await prisma.user.create({
      data: {
        name,
        displayName: name,
        email,
        passwordHash: await hashPassword(parsed.data.password),
        // 管理者権限は自己登録では絶対に付与しない
        isAdmin: false,
        isActive: true,
        // 推しクラブ設定へ誘導するため未完了で作る
        profileSetup: false,
      },
      select: { id: true },
    })
  } catch (err) {
    // P2002: email の unique 制約違反（事前チェックだけでは競合を防げないためここで捕捉）
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return NextResponse.json(
        {
          error:
            "このメールアドレスは既に登録されています。ログイン画面からお進みください",
        },
        { status: 409 }
      )
    }
    throw err
  }

  // クライアントはこの email と入力済みパスワードで signIn("credentials") する
  return NextResponse.json({ email })
}
