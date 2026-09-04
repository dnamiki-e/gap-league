# データ源

チーム・順位表・試合・得点ランキング・スカッドをどこから取るか。

実装は [lib/football-data.ts](../lib/football-data.ts) 1ファイルに閉じている。
呼び出し側（`lib/season-sync.ts` / `lib/league-data.ts` / `lib/players.ts` / `app/api/*`）は
どちらの経路が選ばれても同じ型を受け取る。

---

## 経路は2つ。既定は football-data.org 直叩き

| 経路 | 有効になる条件 | 用途 |
|---|---|---|
| **football-data.org 直叩き** | 既定（`FOOTBALL_DATA_API_KEY` を設定） | 単独で立てるならこちら |
| **Hub API 経由** | `SOCCER_CRAWLER_BASE_URL` と `SOCCER_CRAWLER_API_KEY` が**両方**埋まっているとき | 複数アプリで football-data.org のレート枠を共有したいとき |

Hub の2つが揃っているときだけ Hub が選ばれ、そのとき `FOOTBALL_DATA_API_KEY` は使われない。
どちらの設定も無い状態で上流アクセスが起きると `DataSourceNotConfiguredError` を投げる。

現在の経路は `dataSourceName()` で確認できる。

---

## 1. football-data.org 直叩き（既定）

### 準備

[football-data.org で登録](https://www.football-data.org/client/register)して API キーを取得し、
`.env` に置く。

```bash
FOOTBALL_DATA_API_KEY=あなたのキー
```

無料プラン（Free Tier）で 5大リーグと CL は取得できる（順位表・得点ランキングとも実測確認済み）。

### 使うエンドポイント

`https://api.football-data.org/v4` に `X-Auth-Token: <キー>` を付けて GET する。

| 用途 | パス | 呼ぶ関数 |
|---|---|---|
| チーム一覧 | `/competitions/{code}/teams?season={year}` | `fetchTeams` |
| 順位表 | `/competitions/{code}/standings?season={year}` | `fetchStandings` |
| 試合 | `/competitions/{code}/matches?season={year}&status={status}` | `fetchMatches` |
| 得点ランキング | `/competitions/{code}/scorers?season={year}&limit={n}` | `fetchScorersRaw` |
| スカッド | `/teams/{teamId}` | `fetchSquadRaw` |

`{code}` は競技会コード（`PL` / `PD` / `SA` / `BL1` / `FL1` / `CL`）、`{year}` はシーズン開始年
（2025-26 シーズンなら `2025`）。

CL は順位表が `stage=LEAGUE_STAGE` の1ブロック（36チーム）で返る。
アプリ側は `type=TOTAL` のブロックだけを使うので、HOME / AWAY の重複ブロックは自動的に落ちる。

### レート制限（重要）

**無料プランは 10 リクエスト/分**。これを超えると 429 が返る。アプリ側の対策は3段構え。

1. **直列化 + 最小間隔**（`lib/football-data.ts`）
   直叩き経路の全リクエストを 1本のキューに並べ、前回から 6.5 秒空けてから次を投げる。
   cron の同期は「有効シーズン数 × 2リクエスト」を一気に投げるため、
   5リーグ運用だと待ちなしでは必ず 429 に当たる。
2. **429 の1回リトライ**
   `Retry-After` があればその秒数、無ければ 60 秒待って1回だけ再試行する。
   二度目も 429 なら呼び出し側へエラーを返す（無限に待つと画面が固まるため）。
3. **キャッシュ**
   `next: { revalidate: 60 }` に加え、得点ランキングは 60 秒、
   スカッドは 10 分の TTL キャッシュ（`lib/ttl-cache.ts`）を被せている。
   スカッドは「ユーザーがそのクラブを開いたときだけ取る」形にして、
   20クラブ分を一度に取らないようにしてある。

**新しく上流アクセスを足すときは、必ず `lib/football-data.ts` の関数を経由すること。**
直接 `fetch` を書くと、この3つを全て素通りする。

### 得点ランキングの網羅性（得点予想の前提）

得点予想の集計は「一覧に無い選手は 0 点」と確定させて計算している（`lib/scorer-total.ts`）。
そのため上流は **1点以上の得点者を全員返す**必要がある。

football-data.org は `limit` を大きく取れば全員返す。実測（PL 2025 / `limit=500`）:

```
count: 279 / 返却 279 件 / 最大 27 得点 ・ 最小 1 得点
```

最小が 1 得点で止まっていれば、打ち切られていない証拠になる。

### 無料プランで起きうること

- 対象外の競技会・古いシーズンを要求すると **403**。
  「プランの対象外の可能性」と分かる文言でエラーにしている。
- 未公開のシーズンは **404** → `SeasonUnavailableError` に変換される。
  同期処理はこれを「エラー」ではなく「警告」として扱い、他の処理を止めない。

---

## 2. Hub API 経由（任意）

自前の中継サーバを立てて、そこに上流アクセスを集約したい場合の経路。
複数アプリで 10リクエスト/分の枠を分け合うときに使う。

```bash
SOCCER_CRAWLER_BASE_URL=http://localhost:4000
SOCCER_CRAWLER_API_KEY=中継サーバのキー
```

リクエストには `X-Api-Key: <キー>` が付く。
レート枠の管理は中継サーバ側の責務なので、アプリ側では待ちを入れない。

### 中継サーバが実装すべき契約

すべて GET。応答は `{ "ok": true, "data": <本体> }` で包む。
存在しないシーズン・チームは **404** を返すこと（`SeasonUnavailableError` に変換される）。

#### `GET /api/v1/competitions/{code}/teams?season={year}`

`data` は配列。

```jsonc
[
  {
    "id": 12,              // 中継サーバ内部のID
    "fd_id": 57,           // football-data.org のチームID。null なら id を使う
    "name": "Arsenal FC",
    "short_name": "Arsenal",
    "tla": "ARS",
    "crest_url": "https://crests.football-data.org/57.png"
  }
]
```

`fd_id` が `Team.apiTeamId` として保存される。ここが上流と食い違うと順位表と紐付かない。

#### `GET /api/v1/competitions/{code}/standings?season={year}`

`data` は順位表の行の配列（ブロックに包まない）。

```jsonc
[
  {
    "position": 1,
    "team_id": 12,
    "team_fd_id": 57,
    "team_name": "Arsenal FC",
    "team_short_name": "Arsenal",
    "team_tla": "ARS",
    "team_crest_url": "https://…",
    "played": 20, "won": 14, "draw": 3, "lost": 3,
    "points": 45, "goals_for": 40, "goals_against": 20, "goal_difference": 20,
    "form": "WWDLW",
    "stage": "REGULAR_SEASON",
    "type": "TOTAL",
    "group_name": null
  }
]
```

数値は null 可。アプリ側で 0 に埋める（DB スキーマが非 null のため）。

#### `GET /api/v1/competitions/{code}/matches?season={year}&status=&limit=&order=`

`status` は `FINISHED` など、`order` は `asc` / `desc`。`data` は配列。

```jsonc
[
  {
    "id": 100, "fd_id": 497001,
    "matchday": 21, "stage": "REGULAR_SEASON", "group_name": null,
    "status": "FINISHED",
    "utc_date": "2026-01-17T15:00:00Z",
    "home_team_id": 12, "home_team_fd_id": 57, "home_team_name": "Arsenal FC",
    "away_team_id": 15, "away_team_fd_id": 65, "away_team_name": "Manchester City FC",
    "score_home_ft": 2, "score_away_ft": 1,
    "score_home_ht": 1, "score_away_ht": 0,
    "winner": "HOME_TEAM"
  }
]
```

`winner` は `HOME_TEAM` / `AWAY_TEAM` / `DRAW` / null。

#### `GET /api/scorers?league={code}&season={year}&limit={n}`

```jsonc
{
  "league": { "code": "PL", "name": "Premier League" },
  "season": { "year": 2025, "current_matchday": 21 },
  "scorers": [
    {
      "rank": 1,
      "player": { "id": 3754, "name": "Erling Haaland", "country": "Norway" },
      "team": { "id": 65, "name": "Manchester City FC", "short_name": "Man City" },
      "goals": 18, "assists": 4, "penalties": 3, "matches_played": 20
    }
  ],
  "total": 280
}
```

- **1点以上の得点者を全員返すこと**。得点予想の集計は「一覧に無い選手は 0 点」と
  確定させて計算している（`lib/scorer-total.ts`）。上位N人だけ返すと集計が狂う。
- `assists` は欠損しても良い（null は「不明」であって 0 ではない、という扱い）。
- `rank` を省略した場合は配列順から採番される。

#### `GET /api/squad?team={fdTeamId}`

```jsonc
{
  "team": { "id": 57, "name": "Arsenal FC" },
  "squad": [
    { "id": 3754, "name": "Bukayo Saka", "position": "Offence" }
  ]
}
```

`position` は `Goalkeeper` / `Defence` / `Midfield` / `Offence` のいずれか。
細かい表記（`Centre-Forward` など）で返しても、アプリ側の `normalizePosition()` が
4分類へ寄せる。GK は得点予想の候補から自動で外れる。

---

## 動作確認

契約テストが両経路に対応している。キーが無い環境では自動で skip される。

```bash
# football-data.org 直叩きで検証
FOOTBALL_DATA_API_KEY=xxx npm test -- football-data.contract

# Hub 経由で検証
SOCCER_CRAWLER_BASE_URL=http://localhost:4000 \
SOCCER_CRAWLER_API_KEY=xxx npm test -- football-data.contract
```

ポジション正規化などネットワーク不要のロジックは
[`__tests__/lib/football-data.test.ts`](../__tests__/lib/football-data.test.ts) が常時検証する。
