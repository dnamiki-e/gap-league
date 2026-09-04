import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import AppShell from "@/components/AppShell"

// next-auth のモック
vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: {
      user: {
        id: "user-1",
        email: "test@example.com",
        displayName: "テストユーザー",
        image: null,
        isAdmin: false,
      },
    },
    status: "authenticated",
  }),
}))

// next/navigation のモック
vi.mock("next/navigation", () => ({
  usePathname: () => "/home",
}))

// next/link のモック
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

describe("AppShell", () => {
  it("サイドバーにロゴが表示される", () => {
    render(
      <AppShell>
        <div>コンテンツ</div>
      </AppShell>
    )
    const logos = screen.getAllByText("Gap League")
    expect(logos.length).toBeGreaterThan(0)
  })

  it("childrenが正しくレンダリングされる", () => {
    render(
      <AppShell>
        <div data-testid="child">テストコンテンツ</div>
      </AppShell>
    )
    expect(screen.getByTestId("child")).toBeInTheDocument()
  })

  it("管理者でない場合は管理メニューが表示されない", () => {
    render(
      <AppShell>
        <div>テスト</div>
      </AppShell>
    )
    // サイドバーの管理リンクはadminOnly - 管理者でないので非表示
    expect(screen.queryByText("管理")).not.toBeInTheDocument()
  })

  it("ナビゲーション項目（ホーム・予想入力・ランキング）が表示される", () => {
    render(
      <AppShell>
        <div>テスト</div>
      </AppShell>
    )
    expect(screen.getAllByText("ホーム").length).toBeGreaterThan(0)
    expect(screen.getAllByText(/予想/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/ランキング/).length).toBeGreaterThan(0)
  })

  // セクション間の移動は左ナビ／下部タブだけが担う方針にしたため、
  // 下部タブから漏れたセクションはスマホから一切辿り着けなくなる。
  it("左ナビの一般セクションは全て下部タブからも辿れる", () => {
    render(
      <AppShell>
        <div>テスト</div>
      </AppShell>
    )
    const hrefsIn = (label: string) =>
      Array.from(screen.getByRole("navigation", { name: label }).querySelectorAll("a"))
        .map((a) => a.getAttribute("href"))

    const sidebar = hrefsIn("メインメニュー")
    const bottom = hrefsIn("下部メニュー")

    expect(sidebar).toContain("/ranking/archive")
    for (const href of sidebar) {
      expect(bottom, `${href} が下部タブに無い`).toContain(href)
    }
  })

  it("titleプロップがモバイルヘッダーに表示される", () => {
    render(
      <AppShell title="テストページ">
        <div>テスト</div>
      </AppShell>
    )
    expect(screen.getByText("テストページ")).toBeInTheDocument()
  })
})

// 管理者テストは next-auth モックのホイスティング制約から統合テストとして別途実施
