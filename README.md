# タイムカードシステム フル再生成版

## 内容

- `index.html`：従業員ID入力・出勤・休憩・再開・退勤・GPS・距離・売上概算
- `admin.html`：月別集計・従業員別集計・給与計算・シフト管理・CSV出力・ログ一覧
- `worker.js`：Cloudflare Workers API
- `schema.sql`：Cloudflare D1用テーブル

---

## 管理画面URL

### 推奨

Cloudflare Accessで保護した以下を使う。

```text
https://YOUR-WORKER-DOMAIN.workers.dev/admin
```

### GitHub Pages直接URL

```text
https://YOUR-GITHUB-USER.github.io/YOUR-REPO/admin.html
```

ただし、事業利用では直接URLではなく、Cloudflare Access経由を推奨。

---

## 必ず変更する場所

### index.html

```js
const API_BASE = "https://YOUR-WORKER-DOMAIN.workers.dev";
```

### admin.html

```js
const API_BASE = "https://YOUR-WORKER-DOMAIN.workers.dev";
const ADMIN_ACCESS_URL = "https://YOUR-WORKER-DOMAIN.workers.dev/admin";
```

### worker.js

```js
https://YOUR-GITHUB-USER.github.io/YOUR-REPO/admin.html
```

または、Cloudflare Workersの環境変数で設定。

```text
ADMIN_UI_URL=https://YOUR-GITHUB-USER.github.io/YOUR-REPO/admin.html
```

---

## D1 Bindings

WorkerのD1 Binding名は必ず以下にする。

```text
DB
```

---

## DB作成

Cloudflare D1で `schema.sql` を実行する。

---

## 現在の仮従業員

```text
ID：0000
名前：山本信勝
時給単価：3,000円
歩合率：60%
```

---

## API一覧

```text
POST /logs
GET /logs?month=YYYY-MM
GET /report?month=YYYY-MM
GET /report-by-user?month=YYYY-MM
POST /shifts
GET /shifts?month=YYYY-MM
DELETE /shifts/:id
GET /admin
```

---

## 管理画面でできること

- 月別集計
- 日別集計
- 従業員別集計
- 売上集計
- 歩合給与計算
- シフト登録
- シフト削除
- ログ一覧
- CSV出力

---

## 注意

- Google Maps埋め込みは使わず、GPS取得状態表示にしています。
- 実地図表示を入れる場合はGoogle Maps APIキー設定が必要です。
- Cloudflare Accessは `/admin` に設定してください。
- GitHub Pagesの `admin.html` を直接公開したくない場合は、Pages側ではなくWorker配下に置く構成へ変更してください。
