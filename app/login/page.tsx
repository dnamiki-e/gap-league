import { Suspense } from "react"
import LoginForm from "@/components/LoginForm"
import { getAuthConfig } from "@/lib/auth-config"

export default async function LoginPage() {
  // 管理画面で切り替えた設定を即座に反映させるため、モジュール読み込み時ではなく
  // リクエストごとに解決する
  const { mode, allowSignup } = await getAuthConfig()

  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--background)]" />}>
      <LoginForm mode={mode} allowSignup={allowSignup} />
    </Suspense>
  )
}
