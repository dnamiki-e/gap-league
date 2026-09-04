import { describe, it, expect, beforeEach, vi } from "vitest"
import { cached, clearTtlCache } from "@/lib/ttl-cache"

beforeEach(() => clearTtlCache())

describe("cached", () => {
  it("TTL 内は上流を1回しか呼ばない", async () => {
    const load = vi.fn().mockResolvedValue("v")
    expect(await cached("k", 60_000, load)).toBe("v")
    expect(await cached("k", 60_000, load)).toBe("v")
    expect(await cached("k", 60_000, load)).toBe("v")
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("キーが違えば別々に取得する", async () => {
    const load = vi.fn().mockResolvedValue("v")
    await cached("a", 60_000, load)
    await cached("b", 60_000, load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it("TTL が切れたら取り直す", async () => {
    const load = vi.fn().mockResolvedValue("v")
    await cached("k", 0, load)
    await cached("k", 0, load)
    expect(load).toHaveBeenCalledTimes(2)
  })

  // 同時アクセスで殺到しても上流は1回。10リクエスト/分の枠を守る要。
  it("同時に呼ばれても上流は1回だけ", async () => {
    let resolve: (v: string) => void = () => {}
    const load = vi.fn(() => new Promise<string>((r) => (resolve = r)))
    const all = Promise.all([
      cached("k", 60_000, load),
      cached("k", 60_000, load),
      cached("k", 60_000, load),
    ])
    resolve("v")
    expect(await all).toEqual(["v", "v", "v"])
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("失敗したら次回は再試行する（失敗をキャッシュしない）", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue("v")
    await expect(cached("k", 60_000, load)).rejects.toThrow("boom")
    expect(await cached("k", 60_000, load)).toBe("v")
    expect(load).toHaveBeenCalledTimes(2)
  })
})
