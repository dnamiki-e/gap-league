// ネットワーク不要の純粋ロジック。上流の形が揺れても壊れないことを担保する。
import { describe, it, expect } from "vitest"
import { normalizePosition } from "../../lib/football-data"

describe("normalizePosition", () => {
  it("粗い分類はそのまま4分類になる", () => {
    expect(normalizePosition("Goalkeeper")).toBe("Goalkeeper")
    expect(normalizePosition("Defence")).toBe("Defence")
    expect(normalizePosition("Midfield")).toBe("Midfield")
    expect(normalizePosition("Offence")).toBe("Offence")
  })

  it("細かい分類も4分類へ寄せる（上流が時期によって返し分けるため）", () => {
    expect(normalizePosition("Centre-Back")).toBe("Defence")
    expect(normalizePosition("Left-Back")).toBe("Defence")
    expect(normalizePosition("Defensive Midfield")).toBe("Midfield")
    expect(normalizePosition("Attacking Midfield")).toBe("Midfield")
    expect(normalizePosition("Centre-Forward")).toBe("Offence")
    expect(normalizePosition("Left Winger")).toBe("Offence")
  })

  it("GK は表記が揺れても GK と判定する（得点予想の候補から外す判定に効く）", () => {
    expect(normalizePosition("goalkeeper")).toBe("Goalkeeper")
    expect(normalizePosition("Keeper")).toBe("Goalkeeper")
  })

  it("未設定は null のまま返す", () => {
    expect(normalizePosition(null)).toBeNull()
    expect(normalizePosition(undefined)).toBeNull()
    expect(normalizePosition("")).toBeNull()
  })

  it("知らない値は捨てずにそのまま返す（表示だけ崩れて機能は止まらない）", () => {
    expect(normalizePosition("Sweeper Libero")).toBe("Sweeper Libero")
  })
})
