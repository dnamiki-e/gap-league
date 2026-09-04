import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { encryptSecret, decryptSecret, maskSecret } from "@/lib/secret-box"

const ORIGINAL = process.env.NEXTAUTH_SECRET

describe("secret-box", () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = "test-secret-key"
  })
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.NEXTAUTH_SECRET
    else process.env.NEXTAUTH_SECRET = ORIGINAL
  })

  it("暗号化した値を復号できる", () => {
    const enc = encryptSecret("GOCSPX-abcdef123456")
    expect(enc).not.toBeNull()
    expect(enc).not.toContain("GOCSPX")
    expect(decryptSecret(enc)).toBe("GOCSPX-abcdef123456")
  })

  it("同じ平文でも毎回違う暗号文になる（IV がランダム）", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"))
  })

  it("鍵が変わったら復号できず null を返す（例外を投げない）", () => {
    const enc = encryptSecret("secret")
    process.env.NEXTAUTH_SECRET = "different-key"
    expect(decryptSecret(enc)).toBeNull()
  })

  it("改変された暗号文は null（認証タグで検出する）", () => {
    const enc = encryptSecret("secret")!
    const parts = enc.split(":")
    parts[3] = Buffer.from("tampered").toString("base64")
    expect(decryptSecret(parts.join(":"))).toBeNull()
  })

  it("形式違い・空・null は null", () => {
    expect(decryptSecret(null)).toBeNull()
    expect(decryptSecret("")).toBeNull()
    expect(decryptSecret("plain-text")).toBeNull()
    expect(decryptSecret("v2:a:b:c")).toBeNull()
  })

  it("NEXTAUTH_SECRET が無ければ暗号化できない", () => {
    delete process.env.NEXTAUTH_SECRET
    expect(encryptSecret("secret")).toBeNull()
  })

  it("マスクは末尾4文字だけ残す", () => {
    expect(maskSecret("abcdefgh")).toBe("••••efgh")
    expect(maskSecret("abc")).toBe("•••")
  })
})

describe("googleRedirectUri", () => {
  it("NEXTAUTH_URL が /api/auth を含む書き方でも二重にならない", async () => {
    const { googleRedirectUri } = await import("@/lib/auth-config")
    expect(
      googleRedirectUri({ nextAuthUrl: "https://example.com/gap/api/auth", basePath: "/gap" })
    ).toBe("https://example.com/gap/api/auth/callback/google")
  })

  it("サイトのルートまでの書き方なら basePath を足す", async () => {
    const { googleRedirectUri } = await import("@/lib/auth-config")
    expect(
      googleRedirectUri({ nextAuthUrl: "https://example.com", basePath: "/gap" })
    ).toBe("https://example.com/gap/api/auth/callback/google")
  })

  it("basePath 無し・末尾スラッシュ付きでも正しい", async () => {
    const { googleRedirectUri } = await import("@/lib/auth-config")
    expect(googleRedirectUri({ nextAuthUrl: "http://localhost:3020/", basePath: "" })).toBe(
      "http://localhost:3020/api/auth/callback/google"
    )
  })

  it("既に basePath で終わっていれば足さない", async () => {
    const { googleRedirectUri } = await import("@/lib/auth-config")
    expect(
      googleRedirectUri({ nextAuthUrl: "https://example.com/gap", basePath: "/gap" })
    ).toBe("https://example.com/gap/api/auth/callback/google")
  })

  it("NEXTAUTH_URL 未設定なら空文字", async () => {
    const { googleRedirectUri } = await import("@/lib/auth-config")
    expect(googleRedirectUri({ nextAuthUrl: "", basePath: "/gap" })).toBe("")
  })
})
