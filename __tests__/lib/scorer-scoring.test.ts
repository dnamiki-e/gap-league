import { describe, it, expect } from "vitest"
import { totalPickGoals } from "@/lib/scorer-total"
import { calculateScore, DEFAULT_SCORING } from "@/lib/scoring"

const goals = new Map<number, number>([
  [1, 27], // 得点王級
  [2, 15],
  [3, 4],
])

describe("totalPickGoals", () => {
  it("指名が無ければ 0", () => {
    expect(totalPickGoals([], goals)).toBe(0)
  })

  it("指名した選手の得点を足す", () => {
    expect(totalPickGoals([1, 2, 3], goals)).toBe(46)
    expect(totalPickGoals([3], goals)).toBe(4)
  })

  // 得点予想ランキングは合計得点が多いほど上位
  it("得点が多い指名ほど値が大きくなる", () => {
    expect(totalPickGoals([1, 2], goals)).toBeGreaterThan(totalPickGoals([3], goals))
  })

  // 上流は1点以上の全選手を返すので、Map に無い＝0点と確定できる
  it("一覧に無い選手は 0 点", () => {
    expect(totalPickGoals([999], goals)).toBe(0)
    expect(totalPickGoals([1, 999], goals)).toBe(27)
  })
})

describe("順位予想と得点予想は別ランキング", () => {
  // 合算をやめたので、順位予想のスコアは指名の有無で1点も動かない
  it("順位予想のスコアに得点は混ざらない", () => {
    const details = [
      { predictedRank: 1, actualRank: 1 },
      { predictedRank: 2, actualRank: 5 },
    ]
    expect(calculateScore(details, DEFAULT_SCORING)).toBe(1)
  })
})
