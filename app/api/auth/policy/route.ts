import { NextResponse } from "next/server"
import { getAuthConfig } from "@/lib/auth-config"
import { isGoogleEnabled, isPasswordEnabled } from "@/lib/auth-policy"

/**
 * 認証方式の公開情報。ログイン前でも読める（＝秘密は一切載せない）。
 *
 * クライアントコンポーネントは NEXT_PUBLIC_* をビルド時に焼き込むため、
 * 管理画面で認証方式を変えても再ビルドまで反映されない。
 * 画面側はこの口を読んで、実行時の設定に合わせる。
 */
export async function GET() {
  const config = await getAuthConfig()
  return NextResponse.json(
    {
      mode: config.mode,
      allowSignup: config.allowSignup,
      googleEnabled: isGoogleEnabled(config.mode),
      passwordEnabled: isPasswordEnabled(config.mode),
    },
    // 設定変更が即座に効くようキャッシュしない
    { headers: { "Cache-Control": "no-store" } }
  )
}
