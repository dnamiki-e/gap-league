# セットアップ

最短手順は [README](../README.md) にある。ここは詰まったとき用の詳細版。

---

## 必要なもの

| | 条件 | 備考 |
|---|---|---|
| Node.js | 20 以上（推奨 22） | |
| PostgreSQL | 14 以上 | 同梱の `docker-compose.yml` でも可 |
| API キー | [football-data.org](https://www.football-data.org/client/register) | 無料プランで足りる |

---

## 1. データベースを用意する

### Docker を使う場合

```bash
docker compose up -d
```

`postgres:18-alpine` が 5432 で立つ。接続文字列は次のとおり。

```bash
DATABASE_URL=postgresql://gap:gap@localhost:5432/gap_league
```

**このユーザー名とパスワードは開発用の既定値**（`docker-compose.yml` にべた書き）。
外部からつながる環境に置くなら必ず変更すること。

### 既存の PostgreSQL を使う場合

データベースとユーザーを作り、その接続文字列を `DATABASE_URL` に入れる。

```sql
CREATE DATABASE gap_league;
CREATE USER gap WITH PASSWORD '任意のパスワード';
GRANT ALL PRIVILEGES ON DATABASE gap_league TO gap;
```

---

## 2. 環境変数

`cp .env.example .env` してから編集する。`.env` は git 管理外。

### 必ず設定するもの

| 変数 | 説明 |
|---|---|
| `NEXTAUTH_URL` | 公開URL（末尾スラッシュなし）。招待リンクの生成にも使う |
| `NEXTAUTH_SECRET` | セッション暗号鍵。`openssl rand -base64 32` で生成 |
| `DATABASE_URL` | PostgreSQL の接続文字列 |
| `FOOTBALL_DATA_API_KEY` | football-data.org のキー |
| `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD` | `npm run seed` で作る初期管理者 |

> `NEXTAUTH_SECRET` は Google クライアントシークレットの暗号鍵の導出にも使う。
> **後から変えると、管理画面に保存した Google シークレットが復号できなくなり
> 「未設定」に戻る**（画面から入れ直せば直る）。

### 任意

| 変数 | 既定 | 説明 |
|---|---|---|
| `NEXT_PUBLIC_BASE_PATH` | 空 | サブパス配信するとき（例 `/gap`）。**変更したら再ビルドが必要** |
| `NEXT_PUBLIC_AUTH_MODE` | `password` | `password` / `google` / `both`。管理画面から上書きできる |
| `NEXT_PUBLIC_ALLOW_SIGNUP` | `false` | `false` = 招待制。管理画面から上書きできる |
| `ALLOWED_EMAIL_DOMAIN` | 空 | Google ログインを許すドメイン。**空 = 制限なし** |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | 空 | Google を使うときだけ。管理画面から入れてもよい |
| `ADMIN_EMAILS` | 空 | Google ログインで自動的に管理者にするアドレス（カンマ区切り） |
| `CRON_SECRET` | 空 | 自動同期の合言葉。未設定だと `/api/cron/sync` は 503 |
| `SOCCER_CRAWLER_BASE_URL` / `SOCCER_CRAWLER_API_KEY` | 空 | 中継サーバ経由で取る場合のみ（[docs/DATA_SOURCE.md](DATA_SOURCE.md)） |
| `NEXT_PUBLIC_FOOTBALL_INFO_URL` | 空 | 日程・順位表を持つ別サイトへのリンク先。未設定なら出ない |

### 管理者を作る変数が2つある理由

**役割が違う。混同しやすいので注意。**

| 変数 | いつ効くか | 何をするか |
|---|---|---|
| `ADMIN_EMAIL`（単数） | `npm run seed` 実行時 | メール+パスワードの管理者を1件作る |
| `ADMIN_EMAILS`（複数） | Google ログインのたび | そのアドレスで入ってきたら管理者に昇格させる。招待制でも招待なしで入れる |

パスワード運用なら前者、Google 運用なら後者。両方使ってもよい。
`ADMIN_EMAILS` は「User 行が1件も無い状態から最初の管理者を作る」ための入口なので、
初期構築が済んだら空にしてよい。

### 開発ツール用（配布先では不要）

`scripts/layout-check.mjs`（画面のガタつき検査）だけが使う。

`GAP_BASE` / `GAP_QA_EMAIL` / `GAP_QA_PASSWORD` / `GAP_ONLY` / `GAP_EXTRA_USER_ID` / `PLAYWRIGHT_MODULE`

使い方はスクリプト先頭のコメントにある。

---

## 3. スキーマ適用と初期管理者

```bash
npm install
npx prisma migrate deploy   # テーブル作成
npm run seed                # 初期管理者 + サイト設定を投入
```

`npm run seed` は冪等。同じメールで再実行するとパスワードと権限を上書きする
（パスワードを忘れたときの復旧手段にもなる）。

---

## 4. 起動

```bash
npm run dev                    # 開発 http://localhost:3020
npm run build && npm start     # 本番
```

ポートは `package.json` の scripts で 3020 に固定してある。変えるならそこを編集する。

---

## 5. Google ログインを使う場合

1. [Google Cloud Console](https://console.cloud.google.com/) で OAuth クライアント（ウェブアプリケーション）を作る。
2. **承認済みのリダイレクト URI** に次を登録する。

   ```
   {NEXTAUTH_URL}{NEXT_PUBLIC_BASE_PATH}/api/auth/callback/google
   ```

   正確な値は管理画面「管理 > 認証設定」にコピー用として表示される。そちらを使うのが確実。
3. クライアントID / シークレットを `.env` か管理画面に入れる。
4. 認証モードを `google` か `both` にする。

特定組織に限定するなら `ALLOWED_EMAIL_DOMAIN` を設定する。
**空のままだと任意の Google アカウントでログインできる**ので注意。

---

## 6. サブパスで配信する場合

`https://example.com/gap/` のように配る場合。

```bash
NEXT_PUBLIC_BASE_PATH=/gap
NEXTAUTH_URL=https://example.com/gap
```

`NEXT_PUBLIC_BASE_PATH` はビルド時に埋め込まれるので、**変更したら必ず再ビルド**する。

リバースプロキシ側（Apache の例）:

```apache
ProxyPass        /gap/ http://localhost:3020/gap/
ProxyPassReverse /gap/ http://localhost:3020/gap/
```

パスを付け替えず、そのまま素通しすること
（アプリ側が `/gap` 付きの URL を生成するため）。

---

## 困ったとき

| 症状 | 原因と対処 |
|---|---|
| ログイン後すぐログアウトされる | `NEXTAUTH_SECRET` 未設定、または `NEXTAUTH_URL` が実際のURLと違う |
| Google ログインで `redirect_uri_mismatch` | Cloud Console のリダイレクト URI が違う。管理画面の表示値と1文字ずつ突き合わせる |
| 管理画面に入れない | `isAdmin` が付いていない。`npm run seed` を実行するか `ADMIN_EMAILS` を設定して Google で入り直す |
| 同期すると 403 が出る | 無料プランの対象外の競技会・シーズン。[docs/DATA_SOURCE.md](DATA_SOURCE.md) 参照 |
| 同期すると 429 が出る | レート制限。しばらく待つ。手動同期を連打しない |
| シーズンを作っても「データがありません」 | 上流にまだそのシーズンが無い（`SeasonUnavailableError`）。開幕が近づくと取れる |
| 招待リンクが `localhost` になる | `NEXTAUTH_URL` が本番URLになっていない |
| Google シークレットが「未設定」に戻った | `NEXTAUTH_SECRET` を変えた。管理画面から入れ直す |
