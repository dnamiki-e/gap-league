import { describe, it, expect } from "vitest"
import { mergeScorerRows, type ScorerBoardRow } from "@/lib/scorer-total"

function row(userId: string, displayName: string, totalGoals: number): ScorerBoardRow {
  return {
    userId,
    displayName,
    email: `${userId}@example.com`,
    picks: [{ playerName: "P", teamName: "T", goals: totalGoals }],
    totalGoals,
    hasPicks: true,
  }
}

const participants = [
  { userId: "u1", user: { displayName: "あおい", email: "u1@example.com" } },
  { userId: "u2", user: { displayName: "いつき", email: "u2@example.com" } },
  { userId: "u3", user: { displayName: "うみか", email: "u3@example.com" } },
]

describe("mergeScorerRows", () => {
  it("入力済みは合計得点の多い順に並ぶ", () => {
    const rows = mergeScorerRows([row("u1", "あおい", 4), row("u2", "いつき", 9)], participants)
    expect(rows.slice(0, 2).map((r) => r.userId)).toEqual(["u2", "u1"])
  })

  // 未入力の人を落とすと、本人が自分の行が無いことに気づけない
  it("未入力の参加者も行として返り、入力済みより後ろに並ぶ", () => {
    const rows = mergeScorerRows([row("u1", "あおい", 4)], participants)
    expect(rows).toHaveLength(3)
    expect(rows[0]).toMatchObject({ userId: "u1", hasPicks: true })
    expect(rows.slice(1).every((r) => r.hasPicks === false)).toBe(true)
    expect(rows.slice(1).every((r) => r.picks.length === 0 && r.totalGoals === 0)).toBe(true)
  })

  it("入力済みの人を未入力として重複させない", () => {
    const rows = mergeScorerRows([row("u1", "あおい", 4)], participants)
    expect(rows.filter((r) => r.userId === "u1")).toHaveLength(1)
  })

  it("参加者が全員入力済みなら未入力行は出ない", () => {
    const entered = [row("u1", "あおい", 4), row("u2", "いつき", 9), row("u3", "うみか", 1)]
    const rows = mergeScorerRows(entered, participants)
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.hasPicks)).toBe(true)
  })

  it("入力が1件も無ければ全員が未入力行になる", () => {
    const rows = mergeScorerRows([], participants)
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => !r.hasPicks)).toBe(true)
  })
})
