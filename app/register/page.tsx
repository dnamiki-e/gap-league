import { Suspense } from "react"
import Link from "next/link"
import RegisterForm from "@/components/RegisterForm"
import { isPasswordEnabled } from "@/lib/auth-policy"
import { getAuthConfig } from "@/lib/auth-config"

export default async function RegisterPage() {
  const config = await getAuthConfig()
  const mode = config.mode
  const allowSignup = config.allowSignup && isPasswordEnabled(mode)

  if (!allowSignup) {
    return (
      <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] flex items-center justify-center px-4">
        <div className="w-full max-w-md bg-[var(--surface)] rounded-2xl p-8 border border-[var(--border)] text-center">
          <h1 className="text-xl font-bold mb-3">新規登録は受け付けていません</h1>
          <p className="text-sm text-[var(--text-muted)] mb-6">
            アカウントは管理者が発行します。
          </p>
          <Link
            href="/login"
            className="text-[var(--accent-cyan)] font-semibold hover:underline"
          >
            ログイン画面へ戻る
          </Link>
        </div>
      </div>
    )
  }

  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--background)]" />}>
      <RegisterForm />
    </Suspense>
  )
}
