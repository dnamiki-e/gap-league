"use client"

import { useEffect, useState } from "react"
import { apiUrl } from "@/lib/api"

/**
 * 実行時の認証方式をクライアントから読む。
 *
 * NEXT_PUBLIC_* はビルド時にバンドルへ焼き込まれるため、管理画面で認証方式を
 * 変えても再ビルドまで反映されない。/api/auth/policy を読むことで実行時の値に従う。
 *
 * 取得前は null。画面側は「まだ分からない」を非表示側に寄せて扱う
 * （出してから消えるより、出ないところから出る方が事故が少ない）。
 */
export interface AuthPolicy {
  mode: "password" | "google" | "both"
  allowSignup: boolean
  googleEnabled: boolean
  passwordEnabled: boolean
}

export function useAuthPolicy(): AuthPolicy | null {
  const [policy, setPolicy] = useState<AuthPolicy | null>(null)

  useEffect(() => {
    let alive = true
    fetch(apiUrl("/api/auth/policy"))
      .then((res) => (res.ok ? res.json() : null))
      .then((data: AuthPolicy | null) => {
        if (alive && data) setPolicy(data)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [])

  return policy
}
