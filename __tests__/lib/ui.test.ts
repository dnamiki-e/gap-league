import { describe, it, expect } from "vitest"
import { archiveNav, statsNav, pageClass } from "@/lib/ui"

describe("pageClass", () => {
  it("本文幅は wide / form の2種類に固定される", () => {
    expect(pageClass()).toContain("max-w-5xl")
    expect(pageClass("form")).toContain("max-w-2xl")
  })
})

describe("archiveNav", () => {
  it("選択中のシーズンをサブナビ移動でも保つ", () => {
    expect(archiveNav("s25").map((i) => i.href)).toEqual([
      "/ranking/archive?seasonId=s25",
      "/results?seasonId=s25",
    ])
  })

  it("シーズン未選択なら素のパスにする（?seasonId=undefined を作らない）", () => {
    expect(archiveNav(undefined).map((i) => i.href)).toEqual(["/ranking/archive", "/results"])
  })

  it("アクティブ判定用のパスはクエリを含まない", () => {
    expect(archiveNav("s25").every((i) => !i.path.includes("?"))).toBe(true)
  })
})

describe("statsNav", () => {
  it("選択中のシーズンをサブナビ移動でも保つ", () => {
    expect(statsNav("s26").map((i) => i.href)).toEqual([
      "/stats?seasonId=s26",
      "/stats/timeline?seasonId=s26",
    ])
  })

  it("/stats は完全一致にする（/stats/timeline で2つ同時に点灯させない）", () => {
    const [rate, timeline] = statsNav("s26")
    // 前方一致のままだと /stats が /stats/timeline にもマッチしてしまう
    expect("/stats/timeline".startsWith(`${rate.path}/`)).toBe(true)
    expect(rate.exact).toBe(true)
    expect(timeline.exact).toBeUndefined()
  })
})
