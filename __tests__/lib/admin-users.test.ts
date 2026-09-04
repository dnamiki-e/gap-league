import { describe, it, expect } from "vitest"
import { blockUserDeletion, hasCompetitionData } from "@/lib/admin-users"

const clean = {
  id: "target-1",
  isAdmin: false,
  predictionCount: 0,
  scoreCount: 0,
}
const ctx = { requesterId: "admin-1", adminCount: 3, force: false }

describe("hasCompetitionData", () => {
  it("予想もスコアも無ければ false", () => {
    expect(hasCompetitionData(clean)).toBe(false)
  })

  it("どちらか一方でもあれば true", () => {
    expect(hasCompetitionData({ ...clean, predictionCount: 1 })).toBe(true)
    expect(hasCompetitionData({ ...clean, scoreCount: 1 })).toBe(true)
  })
})

describe("blockUserDeletion", () => {
  it("データを持たないユーザーはそのまま削除できる", () => {
    expect(blockUserDeletion(clean, ctx)).toBeNull()
  })

  it("自分自身は削除できない", () => {
    const block = blockUserDeletion({ ...clean, id: "admin-1" }, ctx)
    expect(block?.status).toBe(400)
    expect(block?.error).toMatch(/自分自身/)
  })

  it("自分自身の判定は force でも覆せない", () => {
    const block = blockUserDeletion({ ...clean, id: "admin-1" }, { ...ctx, force: true })
    expect(block?.status).toBe(400)
  })

  it("最後の管理者は削除できない", () => {
    const block = blockUserDeletion(
      { ...clean, isAdmin: true },
      { ...ctx, adminCount: 1 }
    )
    expect(block?.status).toBe(400)
    expect(block?.error).toMatch(/最後の管理者/)
  })

  it("管理者が複数いれば管理者も削除できる", () => {
    expect(blockUserDeletion({ ...clean, isAdmin: true }, { ...ctx, adminCount: 2 })).toBeNull()
  })

  it("最後の管理者の判定は force でも覆せない", () => {
    const block = blockUserDeletion(
      { ...clean, isAdmin: true },
      { ...ctx, adminCount: 1, force: true }
    )
    expect(block?.status).toBe(400)
    expect(block?.error).toMatch(/最後の管理者/)
  })

  it("予想を持つユーザーは force なしでは 409 で止める", () => {
    const block = blockUserDeletion({ ...clean, predictionCount: 3, scoreCount: 2 }, ctx)
    expect(block?.status).toBe(409)
    expect(block?.needsForce).toBe(true)
    expect(block?.predictionCount).toBe(3)
    expect(block?.scoreCount).toBe(2)
  })

  it("スコアだけ持つ場合も force なしでは止める", () => {
    expect(blockUserDeletion({ ...clean, scoreCount: 1 }, ctx)?.status).toBe(409)
  })

  it("force があれば予想を持つユーザーも削除できる", () => {
    expect(
      blockUserDeletion({ ...clean, predictionCount: 3, scoreCount: 2 }, { ...ctx, force: true })
    ).toBeNull()
  })

  it("自分自身の判定はデータの有無より先に効く", () => {
    const block = blockUserDeletion(
      { ...clean, id: "admin-1", predictionCount: 5 },
      ctx
    )
    expect(block?.error).toMatch(/自分自身/)
  })
})
