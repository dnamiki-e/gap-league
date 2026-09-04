/**
 * 画面のガタつき検査。
 *
 * 「状態を切り替えても、切替の前後どちらにも存在する操作部品は同じ位置にいること」
 * だけを検査する。押した指の下でボタンが動くのを防ぐのが目的。
 * 部品より下のコンテンツは高さが変わってよい。
 *
 * 使い方:
 *   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
 *   GAP_QA_EMAIL=... GAP_QA_PASSWORD=... \
 *   node scripts/layout-check.mjs
 *
 * 検査用に管理者権限の一時ユーザーが要る（管理画面も対象のため）。
 * パスワードは bcrypt で作って User に直接入れ、実行後に必ず削除すること:
 *   node -e "console.log(require('bcryptjs').hashSync('<pass>',10))"
 *   INSERT INTO "User" (id,email,name,"displayName","passwordHash","isAdmin","createdAt")
 *     VALUES ('qa-tmp','qa@example.com','QA','QA','<hash>',true,now());
 *   DELETE FROM "User" WHERE id='qa-tmp'
 *     AND id NOT IN (SELECT "userId" FROM "Prediction")
 *     AND id NOT IN (SELECT "userId" FROM "Score");
 *
 * GAP_EXTRA_USER_ID に「表示名が長いユーザー」のIDを渡すと、
 * 説明文の折り返しで下の操作部がズレないかも検査する。
 */
const BASE = process.env.GAP_BASE ?? "http://localhost:3020"
const EMAIL = process.env.GAP_QA_EMAIL
const PASSWORD = process.env.GAP_QA_PASSWORD
const PW_MODULE = process.env.PLAYWRIGHT_MODULE ?? "playwright"
const ONLY = process.env.GAP_ONLY // シナリオ名の部分一致で絞り込む

if (!EMAIL || !PASSWORD) {
  console.error("GAP_QA_EMAIL / GAP_QA_PASSWORD が必要です")
  process.exit(2)
}

const { chromium } = await import(PW_MODULE)

const VIEWPORTS = [
  { name: "PC 1440", width: 1440, height: 900, mobile: false },
  { name: "タブ 768", width: 768, height: 1024, mobile: false },
  { name: "SP 390", width: 390, height: 844, mobile: true },
  { name: "SP 320", width: 320, height: 720, mobile: true },
]

let ng = 0
let checks = 0
const ok = (cond, msg) => {
  checks++
  if (!cond) ng++
  console.log(`  ${cond ? "OK " : "NG "} ${msg}`)
}

/** 切替をまたいで画面に残る操作部品。ここに挙げたものは位置が動いてはいけない。 */
async function measure(page) {
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(150)
  const out = {}
  const put = async (key, locator) => {
    if ((await locator.count()) === 0) return
    const box = await locator.first().boundingBox()
    if (box) out[key] = Math.round(box.y)
  }
  await put("サブナビ", page.locator('nav[aria-label="セクション内メニュー"]'))
  await put("見出し", page.locator("main h1"))
  await put("シーズン選択", page.locator("main a").filter({ hasText: /^\d\d-\d\d$/ }))
  await put("予想した人", page.locator("main").getByText("予想した人", { exact: true }))
  return out
}

async function scenario(page, name, states) {
  if (ONLY && !name.includes(ONLY)) return
  const seen = []
  for (const st of states) {
    await page.goto(`${BASE}${st.url}`, { waitUntil: "networkidle", timeout: 30000 })
    seen.push({ label: st.label, m: await measure(page) })
  }
  const keys = [...new Set(seen.flatMap((r) => Object.keys(r.m)))]
  for (const k of keys) {
    const present = seen.filter((r) => k in r.m)
    if (present.length < 2) continue // 片方にしか無い部品は「動いた」とは言えない
    if (present.length < seen.length) {
      console.log(`  --  ${name} / ${k}: 一部の状態にのみ存在（${present.map((r) => r.label).join(", ")}）`)
    }
    const ys = present.map((r) => r.m[k])
    ok(
      ys.every((y) => y === ys[0]),
      `${name} / ${k}  ${present.map((r, i) => `${r.label}:${ys[i]}`).join("  ")}`
    )
  }
}

/** ページ上のシーズンピルから遷移先URLを収集する */
async function seasonStates(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 30000 })
  const links = page.locator("main a").filter({ hasText: /^\d\d-\d\d$/ })
  const out = []
  for (let i = 0; i < (await links.count()); i++) {
    const href = await links.nth(i).getAttribute("href")
    out.push({ label: (await links.nth(i).textContent()).trim(), url: href.replace(/^.*\/gap/, "") })
  }
  return out
}

/** /stats の「予想した人」から遷移先URLを収集する */
async function userStates(page) {
  await page.goto(`${BASE}/stats`, { waitUntil: "networkidle", timeout: 30000 })
  const links = page.locator('main a[href*="userId="]')
  const out = []
  for (let i = 0; i < (await links.count()); i++) {
    const href = await links.nth(i).getAttribute("href")
    out.push({ label: (await links.nth(i).textContent()).trim().slice(0, 6), url: href.replace(/^.*\/gap/, "") })
  }
  return out
}

const browser = await chromium.launch({ args: ["--ignore-certificate-errors"] })

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    ignoreHTTPSErrors: true,
    locale: "ja-JP",
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" })
  await page.fill("#login-email", EMAIL)
  await page.fill("#login-password", PASSWORD)
  await page.click("button[type=submit]")
  await page.waitForURL(/\/(home|profile)/, { timeout: 25000 })

  console.log(`\n===== ${vp.name}px =====`)

  // --- 1) セクション内のタブ切替 ---
  const archiveSeasons = await seasonStates(page, "/ranking/archive")
  for (const s of archiveSeasons) {
    const sid = new URL(`http://x${s.url}`).searchParams.get("seasonId")
    await scenario(page, `タブ切替 アーカイブ(${s.label})`, [
      { label: "順位表", url: `/ranking/archive?seasonId=${sid}` },
      { label: "予想を比較", url: `/results?seasonId=${sid}` },
    ])
  }
  const statsSeasons = await seasonStates(page, "/stats")
  for (const s of statsSeasons) {
    const sid = new URL(`http://x${s.url}`).searchParams.get("seasonId")
    await scenario(page, `タブ切替 分析(${s.label})`, [
      { label: "的中率", url: `/stats?seasonId=${sid}` },
      { label: "節別変動", url: `/stats/timeline?seasonId=${sid}` },
    ])
  }
  await scenario(page, "タブ切替 管理", [
    { label: "ダッシュボード", url: "/admin" },
    { label: "シーズン", url: "/admin/seasons" },
    { label: "ユーザー", url: "/admin/users" },
    { label: "サイト設定", url: "/admin/settings" },
  ])

  // --- 2) シーズン切替（同じ画面の中で範囲だけ変える） ---
  for (const [label, path] of [
    ["順位表", "/ranking/archive"],
    ["予想を比較", "/results"],
    ["的中率", "/stats"],
    ["節別変動", "/stats/timeline"],
    ["ランキング", "/ranking"],
    ["得点ランキング", "/league"],
  ]) {
    const states = await seasonStates(page, path)
    if (states.length > 1) await scenario(page, `シーズン切替 ${label}`, states)
  }

  // --- 3) 「予想した人」切替 ---
  const users = await userStates(page)
  if (users.length > 1) await scenario(page, "予想した人 切替 分析", users)

  // --- 4) 長い表示名で説明が折り返さないか（任意）---
  // 実データに長い名前が無いと検出できないため、検証用ユーザーのIDを
  // GAP_EXTRA_USER_ID で渡したときだけ検査する。
  if (process.env.GAP_EXTRA_USER_ID) {
    await scenario(page, "長い表示名 分析", [
      { label: "自分", url: "/stats" },
      { label: "長い名前", url: `/stats?userId=${process.env.GAP_EXTRA_USER_ID}` },
    ])
  }

  await ctx.close()
}

await browser.close()
console.log(`\n===== 検査 ${checks} 件 / NG ${ng} 件 =====`)
process.exit(ng ? 1 : 0)
