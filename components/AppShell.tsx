"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "next-auth/react"
import { useSiteName } from "@/components/providers/SiteNameProvider"

interface NavItem {
  href: string
  label: string
  icon: string
  adminOnly?: boolean
  external?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { href: "/home", label: "ホーム", icon: "🏠" },
  { href: "/predict", label: "予想入力", icon: "✏️" },
  { href: "/ranking", label: "ランキング", icon: "📊" },
  { href: "/stats", label: "分析", icon: "📈" },
  { href: "/league", label: "リーグ", icon: "⚽" },
  { href: "/ranking/archive", label: "アーカイブ", icon: "📋" },
  { href: "/admin", label: "管理", icon: "⚙️", adminOnly: true },
]

// モバイル用。左ナビと同じ並び・同じ粒度にする（セクション間の移動はナビだけが担うため、
// ここに無いセクションは辿り着けなくなる）。5枠のためラベルは短く保つ。
// プロフィールはモバイルヘッダーのアバターから入れるのでタブからは外している。
// 6枠になったため 320px では1枠 53px。「ランキング」は 50px で余白が残らないので
// ここだけ「順位」に縮める（左ナビは「ランキング」のまま。既に「予想入力」→「予想」の前例がある）。
const BOTTOM_TABS: NavItem[] = [
  { href: "/home", label: "ホーム", icon: "🏠" },
  { href: "/predict", label: "予想", icon: "✏️" },
  { href: "/ranking", label: "順位", icon: "📊" },
  { href: "/stats", label: "分析", icon: "📈" },
  { href: "/league", label: "リーグ", icon: "⚽" },
  { href: "/ranking/archive", label: "アーカイブ", icon: "📋" },
]

export default function AppShell({
  children,
  title,
  section,
}: {
  children: React.ReactNode
  title?: string
  /**
   * 左ナビ・ボトムタブで点灯させるセクション。
   * /results のように、選択シーズンによって所属セクションが変わる画面が
   * URL だけでは判別できないため、ページ側から渡してもらう。
   */
  section?: "ranking" | "archive"
}) {
  const pathname = usePathname()
  const { data: session } = useSession()
  const siteName = useSiteName()
  const [theme, setTheme] = useState<"light" | "dark">("light")
  const themeStorageKey = "gap-league-theme"

  useEffect(() => {
    // localStorage はクライアントのみ。マウント時に保存テーマへ同期する（意図的）。
    const storedTheme = window.localStorage.getItem(themeStorageKey)
    const nextTheme = storedTheme === "dark" || storedTheme === "light" ? storedTheme : "light"
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(nextTheme)
    document.documentElement.dataset.theme = nextTheme
  }, [])

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark"
    setTheme(nextTheme)
    document.documentElement.dataset.theme = nextTheme
    window.localStorage.setItem(themeStorageKey, nextTheme)
  }

  const isActive = (href: string) => {
    // ページから所属セクションを渡された場合はそれに従う（/results は進行中シーズンなら
    // 「ランキング」、確定シーズンなら「アーカイブ」の一員になる）
    if (section) {
      if (href === "/ranking") return section === "ranking"
      if (href === "/ranking/archive") return section === "archive"
    }
    if (href === "/ranking" && pathname.startsWith("/ranking/archive")) return false
    if (href === "/ranking" && pathname === "/ranking") return true
    // /results はアーカイブの詳細ページ扱い（左ナビは「アーカイブ」を点灯させる）
    if (href === "/ranking/archive" && (pathname.startsWith("/ranking/archive") || pathname.startsWith("/results"))) return true
    return pathname === href || (href !== "/home" && pathname.startsWith(href + "/"))
  }

  const visibleNav = NAV_ITEMS.filter((item) =>
    item.adminOnly ? session?.user?.isAdmin : true
  )

  return (
    <div className="min-h-screen bg-[var(--background)] flex">
      {/* Sidebar - desktop only */}
      <aside className="hidden md:flex flex-col w-60 min-h-screen bg-[var(--surface)] border-r border-[var(--border)] fixed left-0 top-0 z-20">
        {/* Logo */}
        <div className="flex items-center gap-2 px-5 py-5 border-b border-[var(--border)]">
          <span className="text-2xl text-[var(--foreground)]">⚽</span>
          <span className="text-[var(--foreground)] font-black text-lg tracking-tight">{siteName}</span>
        </div>

        {/* Nav items */}
        <nav aria-label="メインメニュー" className="flex-1 px-3 py-4 space-y-1">
          {visibleNav.map((item) => {
            const commonClass = `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
              isActive(item.href)
                ? "bg-[rgba(56,189,248,0.1)] text-[var(--accent-cyan)] border border-[rgba(56,189,248,0.2)]"
                : "text-[var(--text-muted)] hover:text-[var(--foreground)] hover:bg-[var(--card)]"
            }`
            return item.external ? (
              <a
                key={item.href}
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className={commonClass}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
              </a>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={commonClass}
              >
                <span className="text-base">{item.icon}</span>
                <span>{item.label}</span>
                {item.adminOnly && (
                  <span className="ml-auto text-[10px] bg-[#a78bfa]/20 text-[#a78bfa] px-1.5 py-0.5 rounded font-semibold">
                    Admin
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="px-4 py-4 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={toggleTheme}
            className="w-full min-h-[44px] rounded-2xl border border-[var(--border)] bg-[var(--card)] text-[var(--foreground)] px-3 text-sm font-medium transition hover:bg-[var(--background)]"
          >
            {theme === "dark" ? "☀️ ライトモード" : "🌙 ダークモード"}
          </button>
        </div>
        {session?.user && (
          <div className="px-4 py-4 border-t border-[var(--border)]">
            <Link href="/profile" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
              {session.user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt=""
                  className="w-8 h-8 rounded-full border border-[var(--border)]"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[rgba(56,189,248,0.2)] flex items-center justify-center text-[var(--accent-cyan)] font-bold text-sm">
                  {(session.user.displayName ?? session.user.name ?? "?").charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm text-[var(--foreground)] font-medium truncate">
                  {session.user.displayName ?? session.user.name ?? ""}
                </p>
                <p className="text-xs text-[var(--text-muted)] truncate">{session.user.email}</p>
              </div>
            </Link>
          </div>
        )}
      </aside>

      {/* Main content area */}
      {/* min-w-0: flex アイテムの既定 min-width:auto はコンテンツ幅まで伸びるため、
          内側の overflow-x-auto が効かず広いテーブルがページ全体を横に押し広げてしまう。 */}
      <div className="flex-1 min-w-0 md:ml-60 flex flex-col min-h-screen">
        {/* Mobile header */}
        <header className="md:hidden sticky top-0 z-10 bg-[var(--surface)] border-b border-[var(--border)] px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl text-[var(--foreground)]">⚽</span>
            <span className="text-[var(--foreground)] font-black">{title ?? siteName}</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleTheme}
              className="min-w-[44px] min-h-[44px] rounded-2xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)] transition hover:bg-[var(--background)]"
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <Link href="/profile" className="flex items-center gap-3">
              {session?.user?.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={session.user.image}
                  alt=""
                  className="w-8 h-8 rounded-full border border-[var(--border)]"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[rgba(56,189,248,0.2)] flex items-center justify-center text-[var(--accent-cyan)] font-bold text-sm">
                  {(session?.user?.displayName ?? "?").charAt(0).toUpperCase()}
                </div>
              )}
            </Link>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 pb-20 md:pb-8">
          {children}
        </main>
      </div>

      {/* Bottom tabs - mobile only */}
      <nav aria-label="下部メニュー" className="md:hidden fixed bottom-0 left-0 right-0 z-20 bg-[var(--surface)] border-t border-[var(--border)] flex">
        {BOTTOM_TABS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 min-w-0 flex flex-col items-center justify-center py-2.5 gap-1 font-medium transition-colors min-h-[56px] ${
              isActive(item.href)
                ? "text-[var(--accent-cyan)]"
                : "text-[var(--text-muted)] hover:text-[var(--foreground)]"
            }`}
          >
            <span className="text-lg leading-none">{item.icon}</span>
            <span className="text-[10px] leading-tight whitespace-nowrap">{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  )
}
