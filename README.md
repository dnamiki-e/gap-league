# Gap League ⚽

サッカーのリーグ最終順位を予想し、シーズン終了後に「予想と実順位の差」で競うWebサービスのOSS版。
**ソース一式と [football-data.org](https://www.football-data.org/) の無料APIキーがあれば、誰でも自分のサイトを立てられます。**

予想順位と実順位の差の合計が小さいほど上位（完全一致はマイナス点）。5大リーグ（プレミア / ラ・リーガ / セリエA / ブンデス / リーグアン）と
チャンピオンズリーグのリーグフェーズに対応し、シーズン × リーグ単位で予想できます。

![予想比較表](docs/screenshots/results.png)

**面白いのは、シーズンが進んでから「あいつはこう見てたのか」を並べて眺めるところです。**
青は自分が周りより上に見たチーム、赤は下に見たチーム。濃いほど周りとの差が大きい。
外した予想ほど濃く残るので、あとから見返すと盛り上がります。

## できること

- **順位予想** — チームをドラッグで並べる。実順位とのズレの合計で競う
  （CL のリーグフェーズは36チームのうち上位8位だけを予想）
- **得点予想** — 選手を3人まで指名。その3人の合計得点で競う（順位予想とは別ランキング／プレミアリーグのみ）
- **ネタバレ防止** — 締切前と終盤（残り節数がリーグごとの閾値以下）は他人の予想・順位を自動で隠す
- **自動同期** — cron で順位表を取り込み、スコアを再計算
- **統計** — 的中率、順位の推移、予想の相性
- **管理画面** — シーズン作成・参加者の招待・スコアルール・認証方式の切替

ルールの詳細は [docs/RULES.md](docs/RULES.md)。

## 画面

### ランキング — 今どうなっているか

![ランキング](docs/screenshots/ranking.png)

順位差の合計がそのままスコア。**少ないほど上位**で、完全一致すると -2 されます。
自分の現在位置と首位との差が常に見えるので、シーズン中に何度も覗きに来ることになります。

### 予想入力 — 並べるだけ

![予想入力](docs/screenshots/predict.png)

チームをドラッグして上から並べるだけ。入力中は自動保存されます。
チームごとに「なぜそう思ったか」のコメントも残せて、これが後で効いてきます。

CL のリーグフェーズは36チームもあるので、**上位8位（決勝トーナメント直行圏）だけ**を予想します。

### 分析 — どれくらい当たったか

![分析](docs/screenshots/stats.png)

完全的中の数、±1位以内の割合、平均誤差。節ごとの順位変動も追えます。
参加者を切り替えれば、他の人の精度も見られます。

### ホーム

![ホーム](docs/screenshots/home.png)

### スマートフォン

<p>
  <img src="docs/screenshots/mobile-ranking.png" width="280" alt="スマホのランキング画面">
  <img src="docs/screenshots/mobile-predict.png" width="280" alt="スマホの予想入力画面">
</p>

---

## 必要なもの

- Node.js 20 以上（推奨 22）
- PostgreSQL 14 以上（同梱の `docker-compose.yml` でも可）
- [football-data.org](https://www.football-data.org/client/register) の APIキー（無料プランで可）

## セットアップ

```bash
# 1. 取得
git clone <this-repo> gap-league && cd gap-league
npm install

# 2. 環境変数
cp .env.example .env
#  → .env を編集:
#     NEXTAUTH_SECRET     openssl rand -base64 32 で生成
#     DATABASE_URL        DBの接続文字列
#     FOOTBALL_DATA_API_KEY  football-data.org のキー
#     ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD  初期管理者

# 3. データベース（Docker を使う場合）
docker compose up -d           # PostgreSQL を起動
#    DATABASE_URL=postgresql://gap:gap@localhost:5432/gap_league

# 4. スキーマ適用 & 初期管理者作成
npx prisma generate            # Prisma Client を生成（npm install 時にも自動実行）
npx prisma migrate deploy      # テーブル作成
npm run seed                   # ADMIN_EMAIL/ADMIN_INITIAL_PASSWORD から管理者を投入

# 5. 起動
npm run dev                    # http://localhost:3020
```

ビルドして本番起動する場合:

```bash
npm run build && npm start
```

## 使い方（運用フロー）

1. 管理者で `/login` からログイン（初回は `.env` の初期パスワード。ログイン後に変更を推奨）。
2. 管理画面 `/admin` でシーズン（リーグ＋年）を作成し、データを同期。
3. `/admin/users` で参加者を追加 → **招待リンク**が発行されるので、各参加者へ配布。
4. 参加者は招待リンクを開き、パスワード・ニックネーム・推しチームを設定してログイン。
5. 予想を入力 → シーズン終了後に順位を同期するとスコアが自動計算され、ランキングに反映。

### 自動同期

`.env` に `CRON_SECRET` を設定して、同梱スクリプトを cron に登録します（1日1回が目安）。

```cron
10 3 * * * /path/to/gap-league/scripts/cron-sync.sh >> /var/log/gap-sync.log 2>&1
```

進行中シーズンの順位表を取り込み、全員のスコアを再計算します。
確定済み（ロック済み）のシーズンは対象外です。詳細は [docs/OPERATIONS.md](docs/OPERATIONS.md)。

## 設定（管理画面）

サイト名・スコアルール（完全一致点 / 順位差の倍率）・有効リーグは、管理画面からサイト単位で変更できます。

## 認証モード

**管理画面「管理 > 認証設定」から切り替えできます**（再ビルド・再起動なし）。
環境変数は初期値としてのみ使われ、画面で保存した値が優先されます。

| モード | 用途 | 説明 |
|---|---|---|
| `password`（既定） | 一般公開・社外配布 | admin がユーザーを発行し、招待リンクで初回パスワード設定 |
| `google` | Google アカウントで入る運用 | Google OAuth。許可ドメインを設定すれば特定組織に限定できる |
| `both` | 併用 | ログイン画面に Google ボタンとメール入力の両方を出す |

### 招待制（既定）

「新規登録」を OFF にすると招待制になります。**メール登録画面と Google ログインの両方**が
閉じ、管理者が「管理 > ユーザー」で発行したアドレスだけがログインできます。
発行時に招待リンクが出るので、パスワード運用ならそこから初回パスワードを設定します。
Google 運用なら、アドレスを登録しておけばその Google アカウントでそのまま入れます。

初期構築のみ、環境変数 `ADMIN_EMAILS` のアドレスは招待なしでログインできます
（User 行が1件も無い状態では、招待を出す管理者を作れないため）。

認証設定画面で扱えるもの:

- ログイン方法（上記3モード）
- 利用者による新規登録の許可（OFF = 招待制。Google にも効く）
- Google の クライアントID / クライアントシークレット
  （シークレットは `NEXTAUTH_SECRET` から導出した鍵で暗号化して DB に保存）
- Google ログインを許可するメールドメイン（空欄 = 制限なし）
- Google Cloud Console に登録するリダイレクト URI（コピー用に表示）

環境変数だけで動かすこともできます（`.env.example` 参照）。配布先が
`NEXT_PUBLIC_AUTH_MODE=password` のまま起動すれば、Google の設定は一切不要です。

## データ源

チーム・順位表・試合・得点ランキング・スカッドは football-data.org から取得します。
無料プランは **10リクエスト/分**なので、アプリ側で直列化・キャッシュして収めています。

自前の中継サーバに上流アクセスを集約することもできます（任意・複数アプリでレート枠を
共有したい場合）。求められる API 仕様は [docs/DATA_SOURCE.md](docs/DATA_SOURCE.md) にあります。

## 技術スタック

Next.js (App Router) / TypeScript / Tailwind CSS / Prisma / PostgreSQL / NextAuth

## ドキュメント

| | |
|---|---|
| [docs/SETUP.md](docs/SETUP.md) | 詳細なセットアップ。環境変数の全一覧、Google OAuth、サブパス配信、困ったとき |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | 運用。シーズンを1年回す流れ、自動同期、ユーザー管理、バックアップ |
| [docs/RULES.md](docs/RULES.md) | ゲームのルール。スコア計算、得点予想、締切、ネタバレ防止 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 構成。ディレクトリ、画面・API一覧、データモデル、認証の仕組み |
| [docs/DATA_SOURCE.md](docs/DATA_SOURCE.md) | データ源。football-data.org の使い方、中継サーバの契約仕様 |
| [docs/DESIGN_CONTESTS.md](docs/DESIGN_CONTESTS.md) | **設計・未実装** — 種目（Contest）と締切ルールの一般化。CLノックアウト予想／決勝スコア予想／シーズン詳細画面 |

## ライセンス

[MIT](LICENSE)
