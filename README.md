# ミカン カウンター

スマホのブラウザだけで、摘果前のミカンをカメラでリアルタイムにカウントするアプリ。
推論は onnxruntime-web(WASM)で端末内完結。初回表示後はオフラインで動作。

- モデル: YOLO11s(int8量子化) / クラス: marker, mikan / 入力 640x640
- 記録: 木ごとにCSV保存(最大数・累計・marker数・平均FPS・解像度・計測秒数)

## 公開手順
1. このフォルダの中身をGitHubリポジトリ(Public)に push
2. Settings → Pages → Source を「GitHub Actions」にする
3. Actions タブでデプロイ完了を待ち、表示されたURLをスマホで開く(初回はオンライン)

## ローカル確認
onnxruntime-web の dist から ort.min.js / ort-wasm-simd-threaded.{wasm,mjs} を lib/ に置き、
`python3 -m http.server` で http://localhost:8000 を開く。

## ライセンス
モデルは Ultralytics(AGPL-3.0)で学習。公開する場合は AGPL-3.0 に従うこと。
