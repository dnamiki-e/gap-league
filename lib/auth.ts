import type { NextAuthOptions } from "next-auth"
import GoogleProvider from "next-auth/providers/google"
import CredentialsProvider from "next-auth/providers/credentials"
import { PrismaAdapter } from "@auth/prisma-adapter"
import type { Adapter } from "next-auth/adapters"
import { prisma } from "@/lib/prisma"
import { verifyPassword } from "@/lib/password"
import {
  isGoogleEnabled,
  isPasswordEnabled,
  normalizeEmail,
  rejectGoogleSignInReason,
} from "@/lib/auth-policy"
import { getAuthConfig, getEnvAuthConfig, type AuthConfig } from "@/lib/auth-config"
import { z } from "zod"

// 認証モードは管理画面（DB）で切替でき、未設定なら環境変数に従う。
// 解決は lib/auth-config.ts。
//   password : メール+パスワードのみ
//   google   : Google OAuth（許可ドメインを設定すればドメイン制限）
//   both     : 両方（Google ログイン or ゲスト登録／メールログイン）
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ""

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

function buildProviders(config: AuthConfig): NextAuthOptions["providers"] {
  const providers: NextAuthOptions["providers"] = []

  if (isGoogleEnabled(config.mode)) {
    providers.push(
      GoogleProvider({
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
        // 管理者が先に作成した（Account 未紐付けの）ユーザーを初回ログインで統合する。
        // 乗っ取り防止のガードは signIn コールバック側で行う。
        allowDangerousEmailAccountLinking: true,
      })
    )
  }

  if (isPasswordEnabled(config.mode)) {
    providers.push(
      CredentialsProvider({
        name: "Email",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(credentials) {
          const parsed = credentialsSchema.safeParse(credentials)
          if (!parsed.success) return null
          const email = normalizeEmail(parsed.data.email)
          const { password } = parsed.data

          const user = await prisma.user.findUnique({ where: { email } })
          // 未登録 / パスワード未設定(Google専用) / 無効ユーザーは拒否
          if (!user || !user.passwordHash || !user.isActive) return null
          const ok = await verifyPassword(password, user.passwordHash)
          if (!ok) return null

          return { id: user.id, email: user.email, name: user.displayName ?? user.name }
        },
      })
    )
  }

  return providers
}

/** providers 以外の共通部分。静的 options と動的 options で同じものを使う。 */
const baseOptions: Omit<NextAuthOptions, "providers"> = {
  adapter: PrismaAdapter(prisma) as Adapter,
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
      }
      return token
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string
        const dbUser = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: {
            isAdmin: true,
            isActive: true,
            displayName: true,
            profileSetup: true,
            favoriteClubId: true,
          },
        })
        if (dbUser) {
          session.user.isAdmin = dbUser.isAdmin
          session.user.isActive = dbUser.isActive
          session.user.displayName = dbUser.displayName
          session.user.profileSetup = dbUser.profileSetup
          session.user.favoriteClubId = dbUser.favoriteClubId
        }
      }
      return session
    },
    async signIn({ user, account }) {
      // password（credentials）は authorize() で検証済みのため素通し。
      if (account?.provider !== "google") return true
      if (!user.email) return false

      const email = normalizeEmail(user.email)
      const config = await getAuthConfig()

      // 初期構築のブートストラップ。招待制でも、ここに書いたアドレスは通す。
      // （User 行が1件も無い状態で招待制にすると、招待を出す管理者を作れない）
      const bootstrapAdminEmails = (process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((e) => normalizeEmail(e))
        .filter(Boolean)

      const found = await prisma.user.findUnique({
        where: { email },
        select: {
          isActive: true,
          passwordHash: true,
          accounts: { where: { provider: "google" }, select: { id: true } },
        },
      })
      const existing = found
        ? {
            isActive: found.isActive,
            passwordHash: found.passwordHash,
            hasGoogleAccount: found.accounts.length > 0,
          }
        : null

      // 判定は lib/auth-policy.ts の純粋関数に寄せてある（テストで経路を確かめるため）
      const rejection = rejectGoogleSignInReason(email, existing, {
        allowedEmailDomain: config.allowedEmailDomain,
        allowSignup: config.allowSignup,
        bootstrapAdminEmails,
      })
      if (rejection) return false

      if (bootstrapAdminEmails.includes(email)) {
        await prisma.user
          .update({ where: { email }, data: { isAdmin: true } })
          .catch(() => {})
      }
      return true
    },
  },
  pages: {
    signIn: `${BASE_PATH}/login`,
    error: `${BASE_PATH}/login`,
  },
}

/**
 * getServerSession(authOptions) 用の静的 options。
 *
 * セッションの復元は JWT の復号とコールバックだけで済み、providers は使わない。
 * そのため providers は env から組んだもので固定してよい。
 * 逆に、この形（同期のオブジェクト）を保っておかないと、
 * 各画面・各 API の getServerSession(authOptions) を全部 await 化することになる。
 */
export const authOptions: NextAuthOptions = {
  ...baseOptions,
  providers: buildProviders(getEnvAuthConfig()),
}

/**
 * NextAuth のルートハンドラ用 options。
 * ログイン画面に出す provider と Google の資格情報は、管理画面の設定（DB）で決まる。
 */
export async function getAuthOptions(): Promise<NextAuthOptions> {
  return {
    ...baseOptions,
    providers: buildProviders(await getAuthConfig()),
  }
}
