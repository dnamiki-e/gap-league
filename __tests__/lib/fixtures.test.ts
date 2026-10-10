import { describe, it, expect } from "vitest"
import {
  jstDayKey,
  addDaysKey,
  formatDayLabel,
  formatKickoff,
  matchesOnDay,
  pickNextRound,
  groupByDay,
  kickoffDisplay,
  matchState,
  roundLabel,
  type FixtureLike,
} from "@/lib/fixtures"

function m(utc: string, matchday: number | null, status = "TIMED", stage = "REGULAR_SEASON"): FixtureLike {
  return { stage, matchday, status, utcDate: new Date(utc) }
}

describe("JST の日付・時刻", () => {
  it("UTC の土曜19:00 は日本では日曜04:00", () => {
    const d = new Date("2026-10-10T19:00:00Z")
    expect(jstDayKey(d)).toBe("2026-10-11")
    expect(formatKickoff(d)).toBe("04:00")
  })

  it("UTC の 14:59 は同日 23:59、15:00 は翌日 00:00（日付の境界）", () => {
    expect(jstDayKey(new Date("2026-10-10T14:59:00Z"))).toBe("2026-10-10")
    expect(jstDayKey(new Date("2026-10-10T15:00:00Z"))).toBe("2026-10-11")
  })

  it("月末をまたいで日付を進められる", () => {
    expect(addDaysKey("2026-10-31", 1)).toBe("2026-11-01")
  })

  it("日付ラベルに曜日が付く", () => {
    expect(formatDayLabel("2026-10-10")).toBe("10/10（土）")
  })
})

describe("matchesOnDay", () => {
  const all = [
    m("2026-10-10T14:00:00Z", 6), // JST 10/10 23:00
    m("2026-10-10T11:30:00Z", 6), // JST 10/10 20:30
    m("2026-10-10T16:30:00Z", 6), // JST 10/11 01:30
    m("2026-10-10T14:00:00Z", 3, "POSTPONED"),
  ]

  it("JST の日付で絞り、キックオフ順に並べる", () => {
    const res = matchesOnDay(all, "2026-10-10")
    expect(res.map((x) => formatKickoff(x.utcDate))).toEqual(["20:30", "23:00"])
  })

  it("UTC では同じ日でも JST で翌日になる試合は翌日側に出る", () => {
    expect(matchesOnDay(all, "2026-10-11")).toHaveLength(1)
  })

  it("延期の試合は日程が確定していないので出さない", () => {
    expect(matchesOnDay(all, "2026-10-10").every((x) => x.status !== "POSTPONED")).toBe(true)
  })

  it("試合の無い日は空", () => {
    expect(matchesOnDay(all, "2026-10-20")).toEqual([])
  })
})

describe("pickNextRound", () => {
  const rounds = [
    m("2026-09-18T19:00:00Z", 5, "FINISHED"),
    m("2026-10-10T11:30:00Z", 6),
    m("2026-10-12T19:00:00Z", 6),
    m("2026-10-17T11:30:00Z", 7),
  ]

  it("開幕前の節が次節になる（今節の始まる前）", () => {
    const next = pickNextRound(rounds, new Date("2026-10-10T07:57:00Z"))
    expect(next?.label).toBe("第6節")
    expect(next?.matches).toHaveLength(2)
  })

  it("節が始まったら、その節は今節であって次節ではない", () => {
    const next = pickNextRound(rounds, new Date("2026-10-10T12:00:00Z"))
    expect(next?.label).toBe("第7節")
  })

  it("延期された古い節の試合に引きずられない", () => {
    const withPostponed = [...rounds, m("2026-09-26T14:00:00Z", 4, "POSTPONED")]
    const next = pickNextRound(withPostponed, new Date("2026-10-10T12:00:00Z"))
    expect(next?.label).toBe("第7節")
  })

  it("延期後に新しい日付で組み直された試合は、その日の節の一員として扱わない", () => {
    // 第4節の1試合が10/21に移った。第4節の他の試合は過去なので、第4節は「始まった節」のまま
    const rescheduled = [m("2026-09-26T14:00:00Z", 4, "FINISHED"), m("2026-10-21T19:00:00Z", 4), ...rounds]
    const next = pickNextRound(rescheduled, new Date("2026-10-10T12:00:00Z"))
    expect(next?.label).toBe("第7節")
  })

  it("残り試合が無ければ null", () => {
    expect(pickNextRound([m("2026-05-24T15:00:00Z", 38, "FINISHED")], new Date("2026-10-10T00:00:00Z"))).toBeNull()
  })

  it("節番号の無い決勝トーナメントはステージ名で節を作る", () => {
    const ko = [m("2027-02-17T20:00:00Z", null, "TIMED", "LAST_16"), m("2027-02-18T20:00:00Z", null, "TIMED", "LAST_16")]
    const next = pickNextRound(ko, new Date("2027-02-01T00:00:00Z"))
    expect(next?.label).toBe("ラウンド16")
    expect(next?.matches).toHaveLength(2)
  })
})

describe("groupByDay", () => {
  it("JST の日付ごとにまとめ、日付順・キックオフ順に並べる", () => {
    const g = groupByDay([
      m("2026-10-12T19:00:00Z", 6), // JST 10/13
      m("2026-10-10T14:00:00Z", 6), // JST 10/10
      m("2026-10-10T11:30:00Z", 6), // JST 10/10
    ])
    expect(g.map((d) => d.dayKey)).toEqual(["2026-10-10", "2026-10-13"])
    expect(g[0].matches.map((x) => formatKickoff(x.utcDate))).toEqual(["20:30", "23:00"])
  })
})

describe("kickoffDisplay / roundLabel", () => {
  it("TIMED は時刻を出し、SCHEDULED（時刻未確定）は出さない", () => {
    expect(kickoffDisplay(m("2026-10-10T11:30:00Z", 6, "TIMED"))).toEqual({ kind: "time", text: "20:30" })
    expect(kickoffDisplay(m("2026-10-10T00:00:00Z", 6, "SCHEDULED"))).toEqual({ kind: "tbd" })
  })

  it("未知のステージはそのまま表示する", () => {
    expect(roundLabel({ stage: "NEW_STAGE", matchday: null })).toBe("NEW_STAGE")
  })
})

describe("matchState", () => {
  const now = new Date("2026-10-10T12:00:00Z")

  it("終了・試合中は上流のステータスに従う", () => {
    expect(matchState(m("2026-10-10T11:30:00Z", 6, "FINISHED"), now)).toBe("finished")
    expect(matchState(m("2026-10-10T11:30:00Z", 6, "IN_PLAY"), now)).toBe("live")
    expect(matchState(m("2026-10-10T11:30:00Z", 6, "PAUSED"), now)).toBe("live")
  })

  it("キックオフ前なら試合前", () => {
    expect(matchState(m("2026-10-10T14:00:00Z", 6, "TIMED"), now)).toBe("upcoming")
  })

  it("時刻を過ぎたのに試合前のままなら『開始済み』（同期待ち）として分ける", () => {
    expect(matchState(m("2026-10-10T11:30:00Z", 6, "TIMED"), now)).toBe("started")
  })
})
