import { describe, it, expect, vi } from "vitest"

// 判定ロジックだけを試す。DB には触れない
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { pickSameClubIds, type ClubRef } from "@/lib/favorite-club"

const c = (id: string, name: string, tla: string | null): ClubRef => ({ id, name, tla })

describe("pickSameClubIds", () => {
  it("名前が一致する実データの Team を同じクラブとして集める", () => {
    const fav = c("dummy", "Real Madrid CF", "RMA")
    const real = c("real", "Real Madrid CF", "RMA")
    expect(pickSameClubIds(fav, [real])).toEqual(["dummy", "real"])
  })

  it("名前の大文字小文字は区別しない", () => {
    expect(pickSameClubIds(c("d", "real madrid cf", null), [c("r", "Real Madrid CF", null)])).toEqual(["d", "r"])
  })

  it("名前が違っても、TLA が1件に決まれば同じクラブとみなす", () => {
    expect(pickSameClubIds(c("d", "FC Barcelona", "FCB"), [c("r", "Barcelona", "FCB")])).toEqual(["d", "r"])
  })

  it("TLA が複数に当たるときは取り違えを避けて推しクラブ自身だけにする（BRE: ブレントフォード / ブレスト）", () => {
    const fav = c("d", "Stade Brestois", "BRE")
    expect(pickSameClubIds(fav, [c("a", "Brentford FC", "BRE"), c("b", "Brest Other", "BRE")])).toEqual(["d"])
  })

  it("名前が一致すれば TLA の衝突より名前を優先する", () => {
    const fav = c("d", "Stade Brestois 29", "BRE")
    const res = pickSameClubIds(fav, [c("a", "Brentford FC", "BRE"), c("b", "Stade Brestois 29", "BRE")])
    expect(res).toEqual(["d", "b"])
  })

  it("該当が無ければ推しクラブ自身だけ", () => {
    expect(pickSameClubIds(c("d", "X", "XXX"), [c("r", "Y", "YYY")])).toEqual(["d"])
  })

  it("推しクラブ自身が候補に混ざっても重複しない", () => {
    const fav = c("same", "Arsenal FC", "ARS")
    expect(pickSameClubIds(fav, [fav])).toEqual(["same"])
  })
})
