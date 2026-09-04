import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: { season: { findMany: vi.fn() } } }))

const { pickSeason } = await import("@/lib/seasons")

const SEASONS = [
  { id: "s2526", name: "25-26" },
  { id: "s2425", name: "24-25" },
  { id: "s2324", name: "23-24" },
]

describe("pickSeason", () => {
  it("クエリのシーズンが一覧にあればそれを選ぶ", () => {
    expect(pickSeason(SEASONS, "s2425")?.name).toBe("24-25")
  })

  it("クエリが無ければ先頭（最新）を選ぶ", () => {
    expect(pickSeason(SEASONS, undefined)?.name).toBe("25-26")
  })

  // 「順位表」タブにしか無いシーズンを「予想を比較」タブで選べていた頃、
  // タブを切り替えた瞬間に選択が解決できず空ページになっていた。
  it("一覧に無いシーズンを渡されても空にせず最新へ寄せる", () => {
    expect(pickSeason(SEASONS, "s2627-未確定")?.name).toBe("25-26")
    expect(pickSeason(SEASONS, "存在しないID")?.name).toBe("25-26")
  })

  it("一覧そのものが空なら undefined", () => {
    expect(pickSeason([], "s2425")).toBeUndefined()
  })
})
