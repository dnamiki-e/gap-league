"use client"

import { useEffect, useState } from "react"
import { apiUrl } from "@/lib/api"

/**
 * 認証設定。ソースを配布して別環境で使う前提のため、
 * Google 連携は環境変数を触らずここで完結して設定・停止できるようにする。
 */

type AuthMode = "password" | "google" | "both"

interface AuthConfigView {
  mode: AuthMode
  allowSignup: boolean
  googleClientId: string
  googleClientSecretSet: boolean
  allowedEmailDomain: string
  source: {
    mode: "db" | "env"
    allowSignup: "db" | "env"
    googleClientId: "db" | "env" | "unset"
    googleClientSecret: "db" | "env" | "unset"
    allowedEmailDomain: "db" | "env"
  }
  googleRedirectUri: string
  canStoreSecret: boolean
}

const MODE_OPTIONS: { value: AuthMode; label: string; desc: string }[] = [
  {
    value: "password",
    label: "メール + パスワードのみ",
    desc: "Google 連携は使いません。外部サービスの設定が不要です。",
  },
  {
    value: "google",
    label: "Google ログインのみ",
    desc: "Google Cloud Console でクライアントを作り、下の欄に入れてください。",
  },
  {
    value: "both",
    label: "両方",
    desc: "ログイン画面に Google ボタンとメール入力の両方を出します。",
  },
]

/** 値の出どころ。env のままなのか、この画面で保存した値なのかを示す */
function SourceTag({ source }: { source: "db" | "env" | "unset" }) {
  const label =
    source === "db" ? "この画面の設定" : source === "env" ? "環境変数" : "未設定"
  return (
    <span className="ml-2 align-middle text-[10px] font-semibold px-1.5 py-0.5 rounded border border-white/15 text-[#94a3b8]">
      {label}
    </span>
  )
}

export default function AdminAuthPage() {
  const [view, setView] = useState<AuthConfigView | null>(null)
  const [mode, setMode] = useState<AuthMode>("password")
  const [allowSignup, setAllowSignup] = useState(false)
  const [clientId, setClientId] = useState("")
  const [clientSecret, setClientSecret] = useState("")
  const [clearSecret, setClearSecret] = useState(false)
  const [domain, setDomain] = useState("")

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)

  function apply(data: AuthConfigView) {
    setView(data)
    setMode(data.mode)
    setAllowSignup(data.allowSignup)
    setClientId(data.googleClientId)
    setClientSecret("")
    setClearSecret(false)
    setDomain(data.allowedEmailDomain)
  }

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(apiUrl("/api/admin/auth-config"))
        if (!res.ok) throw new Error("認証設定の取得に失敗しました")
        apply(await res.json())
      } catch (err) {
        setError(err instanceof Error ? err.message : "エラー")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    setSaved(false)
    setSaving(true)
    try {
      const res = await fetch(apiUrl("/api/admin/auth-config"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          allowSignup,
          googleClientId: clientId.trim(),
          // 入力があればそれを保存。「消す」を選んだときだけ空文字を送って
          // 環境変数に戻す。どちらでもなければ送らない（＝変更しない）。
          ...(clientSecret.trim() !== ""
            ? { googleClientSecret: clientSecret.trim() }
            : clearSecret
              ? { googleClientSecret: "" }
              : {}),
          allowedEmailDomain: domain.trim(),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "保存に失敗しました")
      apply(data as AuthConfigView)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラー")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="text-[#94a3b8] py-20 text-center">読み込み中...</div>
  }
  if (!view) {
    return (
      <div className="text-[#f87171] py-20 text-center">
        {error || "認証設定を読み込めませんでした"}
      </div>
    )
  }

  const googleUsed = mode === "google" || mode === "both"

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-[#f1f5f9]">認証設定</h1>
        <p className="text-[#94a3b8] mt-1 text-sm">
          ログイン方法を切り替えます。Google 連携はここで設定・停止できるので、
          別の環境へ移すときに環境変数を書き換える必要はありません。
        </p>
      </div>

      {error && (
        <div className="p-4 bg-[#f87171]/10 border border-[#f87171]/30 rounded-xl text-sm text-[#f87171]">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ログイン方法 */}
        <fieldset className="bg-[#1a1f2e] rounded-2xl p-6 border border-white/10 space-y-3">
          <legend className="text-base font-bold text-[#f1f5f9] px-1">
            ログイン方法
            <SourceTag source={view.source.mode} />
          </legend>
          {MODE_OPTIONS.map((o) => (
            <label
              key={o.value}
              className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                mode === o.value
                  ? "bg-[#38bdf8]/10 border-[#38bdf8]/40"
                  : "bg-white/5 border-white/10 hover:bg-white/10"
              }`}
            >
              <input
                type="radio"
                name="mode"
                value={o.value}
                checked={mode === o.value}
                onChange={() => setMode(o.value)}
                className="mt-1 accent-[#38bdf8]"
              />
              <span>
                <span className="block text-sm text-[#f1f5f9] font-medium">{o.label}</span>
                <span className="block text-xs text-[#94a3b8] mt-0.5">{o.desc}</span>
              </span>
            </label>
          ))}
        </fieldset>

        {/* 自己登録 */}
        <div className="bg-[#1a1f2e] rounded-2xl p-6 border border-white/10 space-y-3">
          <div>
            <h2 className="text-base font-bold text-[#f1f5f9]">
              新規登録
              <SourceTag source={view.source.allowSignup} />
            </h2>
            <p className="text-[#94a3b8] text-xs mt-0.5">
              OFF（招待制）のときは、管理者が「ユーザー」画面で発行したアカウントだけがログインできます。
              Google ログインも同じ扱いで、登録していないアドレスは入れません。
            </p>
          </div>
          <label className="flex items-center gap-3 px-4 py-3 rounded-xl border border-white/10 bg-white/5 cursor-pointer">
            <input
              type="checkbox"
              checked={allowSignup}
              onChange={(e) => setAllowSignup(e.target.checked)}
              className="accent-[#38bdf8]"
            />
            <span className="text-sm text-[#f1f5f9]">誰でも自分で登録できるようにする</span>
          </label>
          {!allowSignup && (
            <p className="text-xs text-[#94a3b8]">
              現在は招待制です。
              {googleUsed &&
                "（環境変数 ADMIN_EMAILS に書いたアドレスだけは、初期構築のため招待なしで入れます）"}
            </p>
          )}
        </div>

        {/* Google 連携 */}
        <div
          className={`bg-[#1a1f2e] rounded-2xl p-6 border space-y-4 ${
            googleUsed ? "border-white/10" : "border-white/5 opacity-60"
          }`}
        >
          <div>
            <h2 className="text-base font-bold text-[#f1f5f9]">Google 連携</h2>
            <p className="text-[#94a3b8] text-xs mt-0.5">
              {googleUsed
                ? "Google Cloud Console で「OAuth クライアント（ウェブアプリケーション）」を作り、その値を入れてください。"
                : "ログイン方法に Google を含めると有効になります。"}
            </p>
          </div>

          {/* 設定時に相手側へ登録する値。ここが分からないと設定できないので画面に出す */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 space-y-1">
            <p className="text-xs text-[#94a3b8]">
              Google 側に登録する「承認済みのリダイレクト URI」
            </p>
            {view.googleRedirectUri ? (
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-xs text-[#f1f5f9] break-all">{view.googleRedirectUri}</code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard?.writeText(view.googleRedirectUri)
                    setCopied(true)
                  }}
                  className="text-xs px-2 py-1 rounded-lg border border-white/15 text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-white/10"
                >
                  {copied ? "コピーしました" : "コピー"}
                </button>
              </div>
            ) : (
              <p className="text-xs text-[#fbbf24]">
                環境変数 NEXTAUTH_URL が未設定のため、URI を組み立てられません。
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[#f1f5f9] mb-2">
              クライアント ID
              <SourceTag source={view.source.googleClientId} />
            </label>
            <input
              type="text"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="000000000000-xxxxxxxx.apps.googleusercontent.com"
              autoComplete="off"
              className="w-full bg-white/5 border border-white/10 text-[#f1f5f9] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/50 transition-colors"
            />
            <p className="mt-1 text-xs text-[#94a3b8]">空欄にすると環境変数の値に戻ります。</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#f1f5f9] mb-2">
              クライアントシークレット
              <SourceTag source={view.source.googleClientSecret} />
            </label>
            <input
              type="password"
              value={clientSecret}
              onChange={(e) => {
                setClientSecret(e.target.value)
                if (e.target.value !== "") setClearSecret(false)
              }}
              placeholder={
                view.googleClientSecretSet ? "設定済み（変更するときだけ入力）" : "未設定"
              }
              autoComplete="new-password"
              className="w-full bg-white/5 border border-white/10 text-[#f1f5f9] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/50 transition-colors"
            />
            <p className="mt-1 text-xs text-[#94a3b8]">
              暗号化して保存します。保存後は画面に表示されません。
            </p>
            {!view.canStoreSecret && (
              <p className="mt-1 text-xs text-[#f87171]">
                環境変数 NEXTAUTH_SECRET が未設定のため、シークレットを保存できません。
              </p>
            )}
            {view.source.googleClientSecret === "db" && (
              <label className="mt-2 flex items-center gap-2 text-xs text-[#94a3b8]">
                <input
                  type="checkbox"
                  checked={clearSecret}
                  onChange={(e) => setClearSecret(e.target.checked)}
                  disabled={clientSecret.trim() !== ""}
                  className="accent-[#38bdf8]"
                />
                保存済みのシークレットを削除して環境変数に戻す
              </label>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[#f1f5f9] mb-2">
              許可するメールドメイン
              <SourceTag source={view.source.allowedEmailDomain} />
            </label>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="example.com（空欄で制限なし）"
              autoComplete="off"
              className="w-full bg-white/5 border border-white/10 text-[#f1f5f9] rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#38bdf8]/50 transition-colors"
            />
            <p className="mt-1 text-xs text-[#94a3b8]">
              指定すると、そのドメインの Google アカウントだけがログインできます。
              空欄ならどの Google アカウントでも入れます。
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="bg-[#38bdf8] hover:bg-[#38bdf8]/80 disabled:opacity-50 text-[#0f1117] font-bold px-6 py-3 rounded-xl transition-colors"
        >
          {saving ? "保存中..." : saved ? "✓ 保存しました" : "設定を保存"}
        </button>
      </form>
    </div>
  )
}
