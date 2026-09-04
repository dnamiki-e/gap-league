// 初期管理者を環境変数から投入する（password モード用）。
//   ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD を .env に設定して `npm run seed`。
// 冪等: 既存の同一メールがあればパスワード/権限を更新する。
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  const email = process.env.ADMIN_EMAIL
  const password = process.env.ADMIN_INITIAL_PASSWORD

  if (!email || !password) {
    console.error(
      "✗ ADMIN_EMAIL と ADMIN_INITIAL_PASSWORD を .env に設定してください。"
    )
    process.exit(1)
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const displayName = email.split("@")[0]

  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash, isAdmin: true, isActive: true, profileSetup: true },
    create: {
      email,
      name: displayName,
      displayName,
      passwordHash,
      isAdmin: true,
      isActive: true,
      profileSetup: true,
    },
  })
  console.log(`✓ 管理者を投入しました: ${user.email} (id=${user.id})`)

  // サイト設定を既定値で初期化
  await prisma.siteConfig.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  })
  console.log("✓ SiteConfig を初期化しました")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
