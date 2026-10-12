// モデルやコードを変えたらCACHEの数字を上げる
const CACHE = "mikan-v4";
const FILES = ["./", "./index.html", "./manifest.json",
  "./model/best_quantized.onnx",
  "./lib/ort.wasm.min.js", "./lib/ort-wasm-simd-threaded.wasm", "./lib/ort-wasm-simd-threaded.mjs"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(FILES.map(f => c.add(f)))));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  const u = new URL(e.request.url);
  const light = u.origin === location.origin && (u.pathname.endsWith("/") || /\.(html|js|json)$/.test(u.pathname));
  const save = res => { if (res.ok && u.origin === location.origin) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(e.request, cp)); } return res; };
  if (light) {   // 軽いファイル: ネット優先、圏外ならキャッシュ
    e.respondWith(fetch(e.request).then(save).catch(() => caches.match(e.request)));
  } else {       // モデル・wasm: キャッシュ優先
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(save)));
  }
});
