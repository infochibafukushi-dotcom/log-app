# タイムカードシステム 完成版

## 変更内容

1. 「退勤・クラウド保存」表記を「退勤」に変更
2. 従業員ID機能追加
   - 仮ID：0000
   - 氏名：山本信勝
3. 管理画面認証はCloudflare Access前提
4. 売上連動
   - 稼働時間 × 時間単価
5. タクシー運行ログ統合
   - GPS距離
   - 距離単価
   - 総売上集計

## ファイル

- index.html
- admin.html
- worker.js
- schema.sql

## 初期設定

### 1. D1にテーブル作成

Cloudflare D1 Consoleで `schema.sql` を実行。

### 2. Workerをデプロイ

`worker.js` をCloudflare Workersへ反映。

### 3. D1 Binding

WorkerのSettings → BindingsでD1を追加。

Binding名は必ず以下。

```
DB
```

### 4. API URL修正

index.html と admin.html の以下を実際のWorker URLへ変更。

```
const API_BASE = "https://YOUR-WORKER-DOMAIN.workers.dev";
```

### 5. Cloudflare Access設定

Zero Trust → Access → Applications → Add application

対象URL例：

```
https://YOUR-WORKER-DOMAIN.workers.dev/admin
```

Google認証を設定し、自分のメールのみ許可。

## 単価設定

index.html

```
const SETTINGS = { hourlyRate: 3000, distanceRatePerKm: 500 };
```

worker.js

/report に以下指定可能。

```
/report?month=2026-05&hourly_rate=3000&km_rate=500
```

## 注意

- GPS許可必須
- 退勤時にまとめて送信
- 送信失敗時は端末内にログ保持
- 管理画面は必ずCloudflare Accessで保護
