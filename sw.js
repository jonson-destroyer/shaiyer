// 初回オンライン時にキャッシュ。以降はオフラインで動作。モデルやコードを変えたらCACHEの数字を上げる
const CACHE = "mikan-v3";
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
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok && new URL(e.request.url).origin === location.origin)
      caches.open(CACHE).then(c => c.put(e.request, res.clone()));
    return res;
  })));
});
