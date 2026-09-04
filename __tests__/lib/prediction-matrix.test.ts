import { describe, it, expect } from "vitest"
import {
  buildMatrixRows,
  sortMatrixRows,
  defaultMatrixColor,
  defaultMatrixOrder,
  devStep,
  parseMatrixOrder,
  parseMatrixColor,
} from "@/lib/prediction-matrix"

const teams = [
  { teamId: "ars", actualRank: 9 },
  { teamId: "mci", actualRank: 1 },
  { teamId: "tot", actualRank: 20 },
]
const users = ["u1", "u2", "u3"]
const preds = new Map([
  ["u1", new Map([["ars", 1], ["mci", 5], ["tot", 1]])],
  ["u2", new Map([["ars", 1], ["mci", 2], ["tot", 12]])],
  ["u3", new Map([["ars", 2], ["mci", 2], ["tot", 6]])],
])

describe("buildMatrixRows", () => {
  it("チームごとに平均・最小・最大・割れ度を出す", () => {
    const rows = buildMatrixRows(teams, users, preds)
    const tot = rows.find((r) => r.teamId === "tot")!
    expect(tot.avg).toBeCloseTo(19 / 3)
    expect(tot.min).toBe(1)
    expect(tot.max).toBe(12)
    expect(tot.spread).toBe(11)
  })

  it("予想していない人はセルを持たない", () => {
    const partial = new Map([["u1", new Map([["ars", 3]])]])
    const rows = buildMatrixRows(teams, users, partial)
    const ars = rows.find((r) => r.teamId === "ars")!
    expect(ars.preds.size).toBe(1)
    expect(ars.avg).toBe(3)
    expect(ars.spread).toBe(0)
  })

  // 予想が1件も無いシーズン（23-24）でも表を出せる必要がある
  it("予想が1件も無ければ avg は null・割れ度は 0", () => {
    const rows = buildMatrixRows(teams, users, new Map())
    expect(rows.every((r) => r.avg === null && r.spread === 0)).toBe(true)
  })
})

describe("sortMatrixRows", () => {
  const rows = buildMatrixRows(teams, users, preds)

  it("avg は平均の小さい順", () => {
    expect(sortMatrixRows(rows, "avg").map((r) => r.teamId)).toEqual(["ars", "mci", "tot"])
  })

  it("actual は実順位の順", () => {
    expect(sortMatrixRows(rows, "actual").map((r) => r.teamId)).toEqual(["mci", "ars", "tot"])
  })

  it("spread は割れ度の大きい順", () => {
    expect(sortMatrixRows(rows, "spread")[0].teamId).toBe("tot")
  })

  it("元の配列を壊さない", () => {
    const before = rows.map((r) => r.teamId)
    sortMatrixRows(rows, "spread")
    expect(rows.map((r) => r.teamId)).toEqual(before)
  })

  // 開き直すたびに順番が変わると「さっきと違う」が起きる
  it("平均が同じなら実順位で決まる（並びが毎回同じになる）", () => {
    const tied = buildMatrixRows(
      [{ teamId: "a", actualRank: 7 }, { teamId: "b", actualRank: 3 }],
      ["u1"],
      new Map([["u1", new Map([["a", 5], ["b", 5]])]])
    )
    expect(sortMatrixRows(tied, "avg").map((r) => r.teamId)).toEqual(["b", "a"])
  })

  it("予想が無いチームは最後に置く", () => {
    const mixed = buildMatrixRows(
      [{ teamId: "none", actualRank: 1 }, { teamId: "has", actualRank: 18 }],
      ["u1"],
      new Map([["u1", new Map([["has", 4]])]])
    )
    expect(sortMatrixRows(mixed, "avg").map((r) => r.teamId)).toEqual(["has", "none"])
  })
})

describe("defaultMatrixColor", () => {
  const base = { isLocked: false, resultsRevealed: false, remainingMatchdays: 36, hasStandings: true, endgameRemaining: 5 }

  // 第2節で実順位との差で塗ると、ほぼ全部が「差8以上」になって実態を映さない
  it("進行中で残り節が多いうちは「みんなとのズレ」", () => {
    expect(defaultMatrixColor(base)).toBe("dev")
  })

  it("確定済み・開示済みは「実順位との差」", () => {
    expect(defaultMatrixColor({ ...base, isLocked: true })).toBe("actual")
    expect(defaultMatrixColor({ ...base, resultsRevealed: true })).toBe("actual")
  })

  it("残り5節以下になったら「実順位との差」へ寄せる", () => {
    expect(defaultMatrixColor({ ...base, remainingMatchdays: 5 })).toBe("actual")
    expect(defaultMatrixColor({ ...base, remainingMatchdays: 6 })).toBe("dev")
  })

  it("順位データがまだ無ければ「みんなとのズレ」", () => {
    expect(defaultMatrixColor({ ...base, hasStandings: false, remainingMatchdays: 0 })).toBe("dev")
  })
})

describe("defaultMatrixOrder", () => {
  it("色が実順位基準のときだけ実順位で並べる", () => {
    expect(defaultMatrixOrder("actual")).toBe("actual")
    expect(defaultMatrixOrder("dev")).toBe("avg")
    expect(defaultMatrixOrder("none")).toBe("avg")
  })
})

describe("devStep", () => {
  it("平均より上位に見たら負、下位に見たら正", () => {
    expect(devStep(1, 7.3)).toBeLessThan(0)
    expect(devStep(12, 7.3)).toBeGreaterThan(0)
  })

  it("1未満のズレは中立", () => {
    expect(devStep(7, 7.3)).toBe(0)
    expect(devStep(8, 7.3)).toBe(0)
  })

  it("ズレが大きいほど段階が上がる（上限4）", () => {
    expect(devStep(9, 7.3)).toBe(1)
    expect(devStep(10, 7.3)).toBe(2)
    expect(devStep(12, 7.3)).toBe(3)
    expect(devStep(20, 7.3)).toBe(4)
    expect(devStep(1, 7.3)).toBe(-4)
  })

  it("平均が無ければ中立", () => {
    expect(devStep(5, null)).toBe(0)
  })
})

describe("クエリの解釈", () => {
  it("未知の値・未指定は既定に寄せる", () => {
    expect(parseMatrixOrder(undefined, "avg")).toBe("avg")
    expect(parseMatrixOrder("nope", "actual")).toBe("actual")
    expect(parseMatrixColor("<script>", "dev")).toBe("dev")
  })

  it("既知の値はそのまま通す", () => {
    expect(parseMatrixOrder("spread", "avg")).toBe("spread")
    expect(parseMatrixColor("none", "dev")).toBe("none")
  })
})
