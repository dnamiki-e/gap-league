import { leagueName } from "@/lib/leagues"

export interface StaticTeam {
  id: string // used as value in select (format: "static-{leagueCode}-{tla}")
  name: string
  shortName: string
  tla: string
  leagueCode: string
  leagueName: string
  crestUrl: null
}

export interface LeagueGroup {
  code: string
  name: string
  teams: StaticTeam[]
}

// 推しクラブ選択用の静的ロスター。表示名は lib/leagues.ts が正本なので持たない。
const LEAGUE_ROSTERS: { code: string; teams: [string, string, string][] }[] = [
  {
    code: "PL",
    teams: [
      ["Arsenal", "Arsenal", "ARS"],
      ["Aston Villa", "Aston Villa", "AVL"],
      ["Bournemouth", "Bournemouth", "BOU"],
      ["Brentford", "Brentford", "BRE"],
      ["Brighton", "Brighton", "BHA"],
      ["Chelsea", "Chelsea", "CHE"],
      ["Crystal Palace", "Crystal Palace", "CRY"],
      ["Everton", "Everton", "EVE"],
      ["Fulham", "Fulham", "FUL"],
      ["Ipswich Town", "Ipswich", "IPS"],
      ["Leicester City", "Leicester", "LEI"],
      ["Liverpool", "Liverpool", "LIV"],
      ["Manchester City", "Man City", "MCI"],
      ["Manchester United", "Man United", "MUN"],
      ["Newcastle United", "Newcastle", "NEW"],
      ["Nottingham Forest", "Nott'm Forest", "NFO"],
      ["Southampton", "Southampton", "SOU"],
      ["Tottenham Hotspur", "Spurs", "TOT"],
      ["West Ham United", "West Ham", "WHU"],
      ["Wolverhampton Wanderers", "Wolves", "WOL"],
    ],
  },
  {
    code: "PD",
    teams: [
      ["Athletic Club", "Athletic", "ATH"],
      ["Atlético de Madrid", "Atlético", "ATM"],
      ["FC Barcelona", "Barcelona", "BAR"],
      ["Celta de Vigo", "Celta Vigo", "CEL"],
      ["Deportivo Alavés", "Alavés", "ALA"],
      ["Espanyol", "Espanyol", "ESP"],
      ["Getafe CF", "Getafe", "GET"],
      ["Girona FC", "Girona", "GIR"],
      ["Las Palmas", "Las Palmas", "LPA"],
      ["CD Leganés", "Leganés", "LEG"],
      ["RCD Mallorca", "Mallorca", "MAL"],
      ["CA Osasuna", "Osasuna", "OSA"],
      ["Rayo Vallecano", "Rayo", "RAY"],
      ["Real Betis", "Real Betis", "BET"],
      ["Real Madrid CF", "Real Madrid", "RMA"],
      ["Real Sociedad", "Real Sociedad", "RSO"],
      ["Real Valladolid CF", "Valladolid", "VLL"],
      ["Sevilla FC", "Sevilla", "SEV"],
      ["Valencia CF", "Valencia", "VAL"],
      ["Villarreal CF", "Villarreal", "VIL"],
    ],
  },
  {
    code: "BL1",
    teams: [
      ["FC Augsburg", "Augsburg", "AUG"],
      ["Bayer 04 Leverkusen", "Leverkusen", "B04"],
      ["FC Bayern München", "Bayern", "FCB"],
      ["VfL Bochum", "Bochum", "BOC"],
      ["Borussia Dortmund", "Dortmund", "BVB"],
      ["Borussia Mönchengladbach", "Gladbach", "BMG"],
      ["Eintracht Frankfurt", "Frankfurt", "SGE"],
      ["SC Freiburg", "Freiburg", "SCF"],
      ["1. FC Heidenheim", "Heidenheim", "FCH"],
      ["TSG 1899 Hoffenheim", "Hoffenheim", "TSG"],
      ["Holstein Kiel", "Kiel", "KIE"],
      ["RB Leipzig", "RB Leipzig", "RBL"],
      ["1. FSV Mainz 05", "Mainz", "M05"],
      ["FC St. Pauli", "St. Pauli", "STP"],
      ["VfB Stuttgart", "Stuttgart", "VFB"],
      ["1. FC Union Berlin", "Union Berlin", "FCU"],
      ["Werder Bremen", "Werder", "SVW"],
      ["VfL Wolfsburg", "Wolfsburg", "WOB"],
    ],
  },
  {
    code: "FL1",
    teams: [
      ["Angers SCO", "Angers", "ANG"],
      ["AJ Auxerre", "Auxerre", "AJA"],
      ["Stade Brestois 29", "Brest", "BRE"],
      ["Le Havre AC", "Le Havre", "HAC"],
      ["RC Lens", "Lens", "RCL"],
      ["LOSC Lille", "Lille", "LOSC"],
      ["Olympique Lyonnais", "Lyon", "OL"],
      ["Olympique de Marseille", "Marseille", "OM"],
      ["AS Monaco", "Monaco", "ASM"],
      ["Montpellier HSC", "Montpellier", "MHSC"],
      ["FC Nantes", "Nantes", "FCN"],
      ["OGC Nice", "Nice", "OGCN"],
      ["Paris Saint-Germain", "PSG", "PSG"],
      ["Stade de Reims", "Reims", "SDR"],
      ["Stade Rennais FC", "Rennes", "SRFC"],
      ["AS Saint-Étienne", "Saint-Étienne", "ASSE"],
      ["RC Strasbourg", "Strasbourg", "RCSA"],
      ["Toulouse FC", "Toulouse", "TFC"],
    ],
  },
  {
    code: "SA",
    teams: [
      ["Atalanta BC", "Atalanta", "ATA"],
      ["Bologna FC 1909", "Bologna", "BOL"],
      ["Cagliari Calcio", "Cagliari", "CAG"],
      ["Como 1907", "Como", "COM"],
      ["Empoli FC", "Empoli", "EMP"],
      ["ACF Fiorentina", "Fiorentina", "FIO"],
      ["Genoa CFC", "Genoa", "GEN"],
      ["Inter Milan", "Inter", "INT"],
      ["Juventus FC", "Juventus", "JUV"],
      ["SS Lazio", "Lazio", "LAZ"],
      ["US Lecce", "Lecce", "LEC"],
      ["AC Milan", "AC Milan", "ACM"],
      ["AC Monza", "Monza", "MON"],
      ["SSC Napoli", "Napoli", "NAP"],
      ["Parma Calcio 1913", "Parma", "PAR"],
      ["AS Roma", "Roma", "ROM"],
      ["Torino FC", "Torino", "TOR"],
      ["Udinese Calcio", "Udinese", "UDI"],
      ["Venezia FC", "Venezia", "VEN"],
      ["Hellas Verona FC", "Verona", "HEL"],
    ],
  },
]

export const LEAGUE_GROUPS: LeagueGroup[] = LEAGUE_ROSTERS.map((league) => ({
  code: league.code,
  name: leagueName(league.code),
  teams: league.teams.map(([name, shortName, tla]) => ({
    id: `static-${league.code}-${tla}`,
    name,
    shortName,
    tla,
    leagueCode: league.code,
    leagueName: leagueName(league.code),
    crestUrl: null,
  })),
}))

export const ALL_STATIC_TEAMS: StaticTeam[] = LEAGUE_GROUPS.flatMap((g) => g.teams)

/** 静的チーム用の一意な負の apiTeamId を生成（実際の football-data.org IDと衝突しない） */
export function getSyntheticApiTeamId(leagueCode: string, tla: string): number {
  const str = `${leagueCode}_${tla}`
  let hash = 0
  for (const c of str) {
    hash = (Math.imul(31, hash) + c.charCodeAt(0)) | 0
  }
  return -(Math.abs(hash) % 900000) - 100000 // 負の6桁: -100000 〜 -999999
}
