import Link from "next/link"

/** シーズン選択（第3階層）。1つしか無いときは出さない。 */
export default function LeagueSeasonPills({
  seasons,
  selectedId,
  basePath,
}: {
  seasons: Array<{ id: string; name: string }>
  selectedId: string | undefined
  basePath: string
}) {
  if (seasons.length <= 1) return null
  return (
    <div className="flex gap-2 flex-wrap">
      {seasons.map((s) => (
        <Link
          key={s.id}
          href={`${basePath}?seasonId=${s.id}`}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            selectedId === s.id
              ? "bg-[#38bdf8]/10 text-[#38bdf8] border border-[#38bdf8]/30"
              : "bg-white/5 text-[#94a3b8] hover:bg-white/10 border border-white/10"
          }`}
        >
          {s.name}
        </Link>
      ))}
    </div>
  )
}
