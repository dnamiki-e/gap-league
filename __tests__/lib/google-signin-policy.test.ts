import { describe, it, expect } from "vitest"
import { rejectGoogleSignInReason } from "@/lib/auth-policy"

const OPEN = { allowedEmailDomain: "", allowSignup: true, bootstrapAdminEmails: [] }
const INVITE_ONLY = { allowedEmailDomain: "", allowSignup: false, bootstrapAdminEmails: [] }
const ACTIVE_GOOGLE_USER = { isActive: true, passwordHash: null, hasGoogleAccount: true }

describe("rejectGoogleSignInReason", () => {
  it("開放構成では未登録アドレスでも通る", () => {
    expect(rejectGoogleSignInReason("new@gmail.com", null, OPEN)).toBeNull()
  })

  it("招待制では未登録アドレスを拒否する", () => {
    expect(rejectGoogleSignInReason("new@gmail.com", null, INVITE_ONLY)).toBe(
      "invitation-required"
    )
  })

  it("招待制でも、管理者が先に登録したアドレスは通る", () => {
    expect(
      rejectGoogleSignInReason("invited@gmail.com", { isActive: true, passwordHash: null, hasGoogleAccount: false }, INVITE_ONLY)
    ).toBeNull()
  })

  it("招待制でも ADMIN_EMAILS は通る（初期構築で管理者を作れなくなるのを防ぐ）", () => {
    expect(
      rejectGoogleSignInReason("boss@example.com", null, {
        ...INVITE_ONLY,
        bootstrapAdminEmails: ["BOSS@example.com"],
      })
    ).toBeNull()
  })

  it("既存ユーザーは招待制でも通り続ける", () => {
    expect(rejectGoogleSignInReason("member@gmail.com", ACTIVE_GOOGLE_USER, INVITE_ONLY)).toBeNull()
  })

  it("無効化されたユーザーは拒否する", () => {
    expect(
      rejectGoogleSignInReason("banned@gmail.com", { ...ACTIVE_GOOGLE_USER, isActive: false }, OPEN)
    ).toBe("user-deactivated")
  })

  it("パスワード登録済み・Google未紐付けは自動統合させない", () => {
    expect(
      rejectGoogleSignInReason("squatted@gmail.com", { isActive: true, passwordHash: "hash", hasGoogleAccount: false }, OPEN)
    ).toBe("password-account-exists")
  })

  it("既に Google が紐付いているなら、パスワードを持っていても通る", () => {
    expect(
      rejectGoogleSignInReason("both@gmail.com", { isActive: true, passwordHash: "hash", hasGoogleAccount: true }, OPEN)
    ).toBeNull()
  })

  it("ドメイン制限は他の判定より先に効く", () => {
    expect(
      rejectGoogleSignInReason("x@other.com", null, { ...OPEN, allowedEmailDomain: "example.com" })
    ).toBe("domain-not-allowed:example.com")
    expect(
      rejectGoogleSignInReason("x@Example.com", null, { ...OPEN, allowedEmailDomain: "example.com" })
    ).toBeNull()
  })

  it("サブドメインは許可ドメインと一致させない（endsWith による取りこぼし防止）", () => {
    expect(
      rejectGoogleSignInReason("x@evil-example.com", null, {
        ...OPEN,
        allowedEmailDomain: "example.com",
      })
    ).toBe("domain-not-allowed:example.com")
  })
})
