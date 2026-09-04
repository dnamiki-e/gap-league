import { describe, it, expect } from "vitest"
import { calculateScore } from "@/lib/scoring"

describe("calculateScore", () => {
  it("完全一致（全チーム）でスコアが -2×20 = -40 になる", () => {
    const details = Array.from({ length: 20 }, (_, i) => ({
      predictedRank: i + 1,
      actualRank: i + 1,
    }))
    expect(calculateScore(details)).toBe(-40)
  })

  it("全チーム1位ずれでスコアが +20 になる", () => {
    // 全20チームが正確に1位ずれ（diff=1）の場合: 20 × 1 = +20
    const allOff = Array.from({ length: 20 }, (_, i) => ({
      predictedRank: i + 1,
      actualRank: i + 2,  // diff=1 for all teams
    }))
    expect(calculateScore(allOff)).toBe(20)
  })

  it("1件のみ完全一致でスコアが -2 になる", () => {
    const details = [{ predictedRank: 1, actualRank: 1 }]
    expect(calculateScore(details)).toBe(-2)
  })

  it("1件のみ5位ずれでスコアが +5 になる", () => {
    const details = [{ predictedRank: 1, actualRank: 6 }]
    expect(calculateScore(details)).toBe(5)
  })

  it("空配列でスコアが 0 になる", () => {
    expect(calculateScore([])).toBe(0)
  })

  it("複数チームの混合スコアを正しく計算する", () => {
    const details = [
      { predictedRank: 1, actualRank: 1 },   // -2
      { predictedRank: 2, actualRank: 4 },   // +2
      { predictedRank: 3, actualRank: 10 },  // +7
      { predictedRank: 4, actualRank: 3 },   // +1
    ]
    // -2 + 2 + 7 + 1 = 8
    expect(calculateScore(details)).toBe(8)
  })

  it("20位ずれの大きな差分を正しく計算する", () => {
    const details = [{ predictedRank: 1, actualRank: 20 }]
    expect(calculateScore(details)).toBe(19)
  })

  it("全チーム逆順でスコアが正の値になる", () => {
    const details = Array.from({ length: 20 }, (_, i) => ({
      predictedRank: i + 1,
      actualRank: 20 - i,
    }))
    const score = calculateScore(details)
    expect(score).toBeGreaterThan(0)
  })
})

describe("calculateScore（サイト設定によるルール変更）", () => {
  it("完全一致点を設定値で変えられる", () => {
    const details = [{ predictedRank: 1, actualRank: 1 }]
    expect(calculateScore(details, { exactMatch: -5, diffMultiplier: 1 })).toBe(-5)
  })

  it("順位差の倍率を設定値で変えられる", () => {
    const details = [{ predictedRank: 1, actualRank: 4 }] // diff=3
    expect(calculateScore(details, { exactMatch: -2, diffMultiplier: 2 })).toBe(6)
  })

  it("混合: 完全一致点と倍率の両方を反映する", () => {
    const details = [
      { predictedRank: 1, actualRank: 1 }, // exactMatch
      { predictedRank: 2, actualRank: 4 }, // diff=2 × 3 = 6
    ]
    expect(calculateScore(details, { exactMatch: -1, diffMultiplier: 3 })).toBe(5)
  })

  it("config 省略時は既定ルール（-2 / 等倍）で計算する", () => {
    const details = [
      { predictedRank: 1, actualRank: 1 },
      { predictedRank: 2, actualRank: 5 },
    ]
    expect(calculateScore(details)).toBe(1) // -2 + 3
  })
})
