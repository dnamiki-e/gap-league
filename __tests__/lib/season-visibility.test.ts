import { describe, it, expect } from "vitest"
import {
  getVisibilityStatus,
  canShowRankings,
  canShowPredictions,
  hasPassedDeadline,
  type MinimalSeason,
  type MinimalStanding,
} from "@/lib/season-visibility"

// 判定の基準時刻（固定）。締切の前後をこの時刻との比較で作る。
const NOW = new Date("2026-08-21T00:00:00Z")
const deadlinePassed = new Date("2026-08-20T00:00:00Z") // 締切済み
const deadlineNotYet = new Date("2026-08-22T00:00:00Z") // 締切前

function makeSeason(overrides: Partial<MinimalSeason> = {}): MinimalSeason {
  return {
    leagueCode: "PL", // 総節数38
    isLocked: false,
    resultsRevealed: false,
    predictionDeadline: deadlinePassed, // デフォルトは締切済み
    ...overrides,
  }
}

function makeStandings(played: number, count = 20): MinimalStanding[] {
  return Array.from({ length: count }, () => ({ played }))
}

describe("hasPassedDeadline", () => {
  it("締切前は false", () => {
    expect(hasPassedDeadline(makeSeason({ predictionDeadline: deadlineNotYet }), NOW)).toBe(false)
  })
  it("締切後は true", () => {
    expect(hasPassedDeadline(makeSeason({ predictionDeadline: deadlinePassed }), NOW)).toBe(true)
  })
  it("now === predictionDeadline ちょうどは締切を過ぎた扱い（true）", () => {
    const season = makeSeason({ predictionDeadline: NOW })
    expect(hasPassedDeadline(season, NOW)).toBe(true)
    // ユーザーに見える挙動としても pre-deadline にはならないことを確認する
    expect(getVisibilityStatus(season, [], NOW)).not.toBe("pre-deadline")
  })
  it("now 省略時はデフォルト値 new Date() の経路を通る（未来締切なら false）", () => {
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    expect(hasPassedDeadline(makeSeason({ predictionDeadline: farFuture }))).toBe(false)
  })
})

describe("getVisibilityStatus", () => {
  it("シーズンなしは no-season", () => {
    expect(getVisibilityStatus(null, [], NOW)).toBe("no-season")
  })

  it("締切前は standings の有無に関わらず pre-deadline", () => {
    const season = makeSeason({ predictionDeadline: deadlineNotYet })
    expect(getVisibilityStatus(season, [], NOW)).toBe("pre-deadline")
    expect(getVisibilityStatus(season, makeStandings(0), NOW)).toBe("pre-deadline")
    // 締切前に何らかの理由で standings が進行していても pre-deadline を優先する
    expect(getVisibilityStatus(season, makeStandings(10), NOW)).toBe("pre-deadline")
  })

  it("締切後・開幕前（played=0 または空配列）は in-progress", () => {
    const season = makeSeason({ predictionDeadline: deadlinePassed })
    expect(getVisibilityStatus(season, [], NOW)).toBe("in-progress")
    expect(getVisibilityStatus(season, makeStandings(0), NOW)).toBe("in-progress")
  })

  it("締切後・開幕中・残り6節以上は in-progress", () => {
    const season = makeSeason({ predictionDeadline: deadlinePassed })
    // PL: 総節数38、played=32 → 残り6節
    expect(getVisibilityStatus(season, makeStandings(32), NOW)).toBe("in-progress")
  })

  it("締切後・残り5節以下は endgame-hidden", () => {
    const season = makeSeason({ predictionDeadline: deadlinePassed })
    // PL: 総節数38、played=33 → 残り5節
    expect(getVisibilityStatus(season, makeStandings(33), NOW)).toBe("endgame-hidden")
  })

  it("resultsRevealed=true は締切前後・終盤に関わらず revealed", () => {
    const revealed = { resultsRevealed: true }
    expect(getVisibilityStatus(makeSeason({ ...revealed, predictionDeadline: deadlineNotYet }), [], NOW)).toBe("revealed")
    expect(getVisibilityStatus(makeSeason({ ...revealed, predictionDeadline: deadlinePassed }), makeStandings(0), NOW)).toBe("revealed")
    expect(getVisibilityStatus(makeSeason({ ...revealed, predictionDeadline: deadlinePassed }), makeStandings(33), NOW)).toBe("revealed")
  })

  it("isLocked=true は常に finalized", () => {
    const locked = { isLocked: true }
    expect(getVisibilityStatus(makeSeason({ ...locked, predictionDeadline: deadlineNotYet }), [], NOW)).toBe("finalized")
    expect(getVisibilityStatus(makeSeason({ ...locked, predictionDeadline: deadlinePassed }), makeStandings(33), NOW)).toBe("finalized")
  })

  it("now 省略時はデフォルト値 new Date() の経路を通る（締切済み・開幕前なら in-progress）", () => {
    const pastDeadline = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const season = makeSeason({ predictionDeadline: pastDeadline })
    expect(getVisibilityStatus(season, [])).toBe("in-progress")
  })
})

describe("canShowRankings / canShowPredictions", () => {
  it("pre-deadline のときは false", () => {
    const season = makeSeason({ predictionDeadline: deadlineNotYet })
    expect(canShowRankings(season, [], NOW)).toBe(false)
    expect(canShowPredictions(season, [], NOW)).toBe(false)
  })

  it("endgame-hidden のときは false", () => {
    const season = makeSeason({ predictionDeadline: deadlinePassed })
    const standings = makeStandings(33)
    expect(canShowRankings(season, standings, NOW)).toBe(false)
    expect(canShowPredictions(season, standings, NOW)).toBe(false)
  })

  it("in-progress のときは true", () => {
    const season = makeSeason({ predictionDeadline: deadlinePassed })
    const standings = makeStandings(32)
    expect(canShowRankings(season, standings, NOW)).toBe(true)
    expect(canShowPredictions(season, standings, NOW)).toBe(true)
  })

  it("revealed / finalized のときは true", () => {
    const revealedSeason = makeSeason({ resultsRevealed: true, predictionDeadline: deadlineNotYet })
    expect(canShowRankings(revealedSeason, [], NOW)).toBe(true)
    expect(canShowPredictions(revealedSeason, [], NOW)).toBe(true)

    const finalizedSeason = makeSeason({ isLocked: true, predictionDeadline: deadlineNotYet })
    expect(canShowRankings(finalizedSeason, [], NOW)).toBe(true)
    expect(canShowPredictions(finalizedSeason, [], NOW)).toBe(true)
  })

  it("シーズンなしのときは false", () => {
    expect(canShowRankings(null, [], NOW)).toBe(false)
    expect(canShowPredictions(null, [], NOW)).toBe(false)
  })

  it("now 省略時はデフォルト値 new Date() の経路を通る（締切前なら false）", () => {
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
    const season = makeSeason({ predictionDeadline: farFuture })
    expect(canShowRankings(season, [])).toBe(false)
    expect(canShowPredictions(season, [])).toBe(false)
  })
})
