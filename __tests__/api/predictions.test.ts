import { describe, it, expect } from "vitest"
import { z } from "zod"

// API内のバリデーションスキーマと同じものを定義してテスト
const predictionSchema = z.object({
  seasonId: z.string(),
  details: z
    .array(
      z.object({
        teamId: z.string(),
        predictedRank: z.number().int().min(1).max(20),
        comment: z.string().max(200).optional(),
      })
    )
    .min(1)
    .max(20),
})

describe("Prediction API スキーマバリデーション", () => {
  it("正常なリクエストボディを受け入れる", () => {
    const result = predictionSchema.safeParse({
      seasonId: "season-1",
      details: [
        { teamId: "team-1", predictedRank: 1 },
        { teamId: "team-2", predictedRank: 2 },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("commentを含むリクエストボディを受け入れる", () => {
    const result = predictionSchema.safeParse({
      seasonId: "season-1",
      details: [
        { teamId: "team-1", predictedRank: 1, comment: "優勝候補" },
        { teamId: "team-2", predictedRank: 2 },
      ],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.details[0].comment).toBe("優勝候補")
      expect(result.data.details[1].comment).toBeUndefined()
    }
  })

  it("200文字を超えるcommentを拒否する", () => {
    const result = predictionSchema.safeParse({
      seasonId: "season-1",
      details: [
        { teamId: "team-1", predictedRank: 1, comment: "a".repeat(201) },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("200文字ちょうどのcommentを受け入れる", () => {
    const result = predictionSchema.safeParse({
      seasonId: "season-1",
      details: [
        { teamId: "team-1", predictedRank: 1, comment: "a".repeat(200) },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("predictedRankが0の場合を拒否する", () => {
    const result = predictionSchema.safeParse({
      seasonId: "season-1",
      details: [{ teamId: "team-1", predictedRank: 0 }],
    })
    expect(result.success).toBe(false)
  })

  it("predictedRankが21の場合を拒否する", () => {
    const result = predictionSchema.safeParse({
      seasonId: "season-1",
      details: [{ teamId: "team-1", predictedRank: 21 }],
    })
    expect(result.success).toBe(false)
  })

  it("detailsが空配列の場合を拒否する", () => {
    const result = predictionSchema.safeParse({
      seasonId: "season-1",
      details: [],
    })
    expect(result.success).toBe(false)
  })

  it("seasonIdがない場合を拒否する", () => {
    const result = predictionSchema.safeParse({
      details: [{ teamId: "team-1", predictedRank: 1 }],
    })
    expect(result.success).toBe(false)
  })
})

describe("重複チェックロジック", () => {
  it("重複したpredictedRankを検出できる", () => {
    const details = [
      { teamId: "team-1", predictedRank: 1 },
      { teamId: "team-2", predictedRank: 1 },  // 重複
    ]
    const ranks = details.map((d) => d.predictedRank)
    const hasDuplicate = new Set(ranks).size !== ranks.length
    expect(hasDuplicate).toBe(true)
  })

  it("重複なしのpredictedRankはOK", () => {
    const details = [
      { teamId: "team-1", predictedRank: 1 },
      { teamId: "team-2", predictedRank: 2 },
    ]
    const ranks = details.map((d) => d.predictedRank)
    const hasDuplicate = new Set(ranks).size !== ranks.length
    expect(hasDuplicate).toBe(false)
  })

  it("重複したteamIdを検出できる", () => {
    const details = [
      { teamId: "team-1", predictedRank: 1 },
      { teamId: "team-1", predictedRank: 2 },  // 重複
    ]
    const teamIds = details.map((d) => d.teamId)
    const hasDuplicate = new Set(teamIds).size !== teamIds.length
    expect(hasDuplicate).toBe(true)
  })
})
