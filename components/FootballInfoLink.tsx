/**
 * 日程・順位表・移籍・ニュースを別サイトに持っている場合、そちらへ送る。
 *
 * リンク先は環境変数 NEXT_PUBLIC_FOOTBALL_INFO_URL で与える。
 * 未設定なら何も描画しない（＝この機能を持たない配布先では出ない）。
 */
const BASE = (process.env.NEXT_PUBLIC_FOOTBALL_INFO_URL ?? "").trim().replace(/\/+$/, "")

export default function FootballInfoLink() {
  if (!BASE) return null

  const items = [
    { href: `${BASE}/matches`, label: "試合日程・結果" },
    { href: `${BASE}/standings`, label: "順位表" },
    { href: `${BASE}/transfers`, label: "移籍情報" },
    { href: `${BASE}/news`, label: "ニュース" },
  ]
  return (
    <div className="bg-[#1a1f2e] rounded-2xl border border-white/10 p-5 space-y-3">
      <h2 className="text-sm font-semibold text-[#94a3b8] uppercase tracking-wider">
        もっと詳しいデータ
      </h2>
      <p className="text-sm text-[#94a3b8]">
        試合日程・順位表・移籍情報・ニュースは別サイトにあります。
      </p>
      <ul className="flex flex-wrap gap-2">
        {items.map((i) => (
          <li key={i.href}>
            <a
              href={i.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center min-h-[44px] px-4 rounded-lg border border-[#38bdf8]/30 bg-[#38bdf8]/10 text-sm font-medium text-[#38bdf8] hover:bg-[#38bdf8]/20"
            >
              {i.label} ↗
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
