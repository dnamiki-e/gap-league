import NextAuth from "next-auth"
import type { NextRequest } from "next/server"
import { getAuthOptions } from "@/lib/auth"

/**
 * provider の有効・無効と Google の資格情報を管理画面（DB）で変えられるようにするため、
 * options はリクエストごとに組み直す。
 * NextAuth(options) の形でモジュール読み込み時に1度だけ初期化すると、
 * 設定を変えても再起動まで効かない。
 *
 * 第2引数に params を渡すと next-auth は App Router 用のハンドラを選ぶ
 * （node_modules/next-auth/next/index.d.ts の 3引数オーバーロード）。
 */
async function handler(
  req: NextRequest,
  ctx: { params: Promise<{ nextauth: string[] }> }
) {
  return NextAuth(req, ctx, await getAuthOptions())
}

export { handler as GET, handler as POST }
