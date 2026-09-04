import { describe, it, expect } from "vitest"
import {
  emailDomain,
  isGoogleEnabled,
  isPasswordEnabled,
  normalizeEmail,
  parseAuthMode,
  parseBooleanFlag,
  rejectSignupReason,
} from "@/lib/auth-policy"

describe("parseAuthMode", () => {
  it("google / password / both を認識する", () => {
    expect(parseAuthMode("google")).toBe("google")
    expect(parseAuthMode("password")).toBe("password")
    expect(parseAuthMode("both")).toBe("both")
  })

  it("大文字・前後空白を無視する", () => {
    expect(parseAuthMode(" Both ")).toBe("both")
    expect(parseAuthMode("GOOGLE")).toBe("google")
  })

  it("未設定・不正値は password にフォールバックする", () => {
    expect(parseAuthMode(undefined)).toBe("password")
    expect(parseAuthMode("")).toBe("password")
    expect(parseAuthMode("email")).toBe("password")
  })
})

describe("プロバイダ有効判定", () => {
  it("both では両方有効", () => {
    expect(isGoogleEnabled("both")).toBe(true)
    expect(isPasswordEnabled("both")).toBe(true)
  })

  it("単独モードでは片方だけ有効", () => {
    expect(isGoogleEnabled("google")).toBe(true)
    expect(isPasswordEnabled("google")).toBe(false)
    expect(isGoogleEnabled("password")).toBe(false)
    expect(isPasswordEnabled("password")).toBe(true)
  })
})

describe("parseBooleanFlag", () => {
  it("真とみなす値", () => {
    for (const v of ["1", "true", "TRUE", "yes", "on", " true "]) {
      expect(parseBooleanFlag(v)).toBe(true)
    }
  })

  it("偽とみなす値", () => {
    for (const v of ["0", "false", "no", "off", "maybe"]) {
      expect(parseBooleanFlag(v)).toBe(false)
    }
  })

  it("未設定はフォールバック値を返す", () => {
    expect(parseBooleanFlag(undefined, false)).toBe(false)
    expect(parseBooleanFlag(undefined, true)).toBe(true)
    expect(parseBooleanFlag("  ", true)).toBe(true)
  })
})

describe("normalizeEmail / emailDomain", () => {
  it("前後空白を除いて小文字化する", () => {
    expect(normalizeEmail("  Foo.Bar@Example.COM ")).toBe("foo.bar@example.com")
  })

  it("ドメイン部を取り出す", () => {
    expect(emailDomain("a@Example.com")).toBe("example.com")
    expect(emailDomain("a+tag@sub.example.com")).toBe("sub.example.com")
  })

  it("@ が無ければ空文字", () => {
    expect(emailDomain("not-an-email")).toBe("")
  })
})

describe("rejectSignupReason", () => {
  const base = {
    allowSignup: true,
    googleEnabled: true,
    allowedEmailDomain: "example.com",
  }

  it("自己登録が無効なら拒否する", () => {
    expect(rejectSignupReason("guest@example.org", { ...base, allowSignup: false })).toMatch(
      /受け付けていません/
    )
  })

  it("制限ドメイン宛の自己登録は拒否し Google へ誘導する", () => {
    expect(rejectSignupReason("someone@example.com", base)).toMatch(/Google/)
    // 大文字混在でも同じ判定
    expect(rejectSignupReason("Someone@EXAMPLE.com", base)).toMatch(/Google/)
  })

  it("制限ドメイン以外は受け付ける", () => {
    expect(rejectSignupReason("guest@example.org", base)).toBeNull()
    // 部分一致で誤判定しない
    expect(rejectSignupReason("guest@notexample.com", base)).toBeNull()
    expect(rejectSignupReason("guest@example.com.evil.com", base)).toBeNull()
  })

  it("Google 無効時はドメイン制限を適用しない", () => {
    expect(
      rejectSignupReason("someone@example.com", { ...base, googleEnabled: false })
    ).toBeNull()
  })

  it("ドメイン未設定なら誰でも登録できる", () => {
    expect(
      rejectSignupReason("someone@example.com", { ...base, allowedEmailDomain: "" })
    ).toBeNull()
  })
})
