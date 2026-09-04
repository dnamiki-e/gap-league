import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { redirect } from "next/navigation"
import AppShell from "@/components/AppShell"
import SectionNav from "@/components/SectionNav"
import { pageClass } from "@/lib/ui"

/** "/admin" は完全一致（/admin/users で2つ同時にアクティブになるのを防ぐ） */
const ADMIN_NAV = [
  { href: "/admin", path: "/admin", label: "ダッシュボード", exact: true },
  { href: "/admin/seasons", path: "/admin/seasons", label: "シーズン" },
  { href: "/admin/users", path: "/admin/users", label: "ユーザー" },
  { href: "/admin/settings", path: "/admin/settings", label: "サイト設定" },
  { href: "/admin/auth", path: "/admin/auth", label: "認証設定" },
]

/**
 * 管理配下のレイアウト。
 * AppShell（左ナビ / モバイルのボトムタブ）の内側に入れることで、
 * 管理画面でもアプリ全体のナビ文脈を保つ。管理内の移動は SectionNav が担う。
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user) redirect("/login")
  if (!session.user.isAdmin) redirect("/home")

  return (
    <AppShell title="管理">
      <div className={pageClass("wide", "space-y-6")}>
        <SectionNav items={ADMIN_NAV} />
        {children}
      </div>
    </AppShell>
  )
}
