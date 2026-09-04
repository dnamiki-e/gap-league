import { describe, it, expect } from "vitest"
import {
  LEAGUES,
  getLeague,
  leagueName,
  hasScorerPrediction,
  predictionSlots,
} from "../../lib/leagues"

describe("リーグ定義", () => {
  it("コードが重複していない", () => {
    const codes = LEAGUES.map((l) => l.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it("表示名を引ける。未知のコードはコードをそのまま返す", () => {
    expect(leagueName("PL")).toContain("プレミアリーグ")
    expect(leagueName("CL")).toContain("チャンピオンズリーグ")
    expect(leagueName("XX")).toBe("XX")
  })

  it("未知のコードでも既定値で動く（画面が落ちないこと）", () => {
    const l = getLeague("XX")
    expect(l.totalMatchdays).toBe(38)
    expect(l.predictionSlots).toBeNull()
    expect(l.hasScorerPrediction).toBe(false)
  })
})

describe("得点予想を行うリーグ", () => {
  it("プレミアリーグだけが対象", () => {
    expect(hasScorerPrediction("PL")).toBe(true)
    for (const code of ["PD", "SA", "BL1", "FL1", "CL"]) {
      expect(hasScorerPrediction(code)).toBe(false)
    }
  })
})

describe("順位予想の枠数", () => {
  it("各国リーグは参加チーム全部を並べる", () => {
    expect(predictionSlots("PL", 20)).toBe(20)
    expect(predictionSlots("BL1", 18)).toBe(18)
  })

  it("CL のリーグフェーズは36チームでも8枠だけ", () => {
    expect(predictionSlots("CL", 36)).toBe(8)
  })

  it("参加チームが枠数を下回るときは枠が余らない（同期前など）", () => {
    expect(predictionSlots("CL", 5)).toBe(5)
    expect(predictionSlots("PL", 0)).toBe(0)
  })
})

describe("終盤モードの閾値", () => {
  it("節数の少ないリーグは閾値も小さい", () => {
    // 38節のリーグで残り5節 = 終盤13%。同じ5節を8節のCLに当てると62%が隠れてしまう
    expect(getLeague("PL").endgameRemaining).toBe(5)
    expect(getLeague("CL").endgameRemaining).toBe(1)
  })

  it("CL は8節、各国リーグは34〜38節", () => {
    expect(getLeague("CL").totalMatchdays).toBe(8)
    expect(getLeague("PL").totalMatchdays).toBe(38)
    expect(getLeague("BL1").totalMatchdays).toBe(34)
  })
})
