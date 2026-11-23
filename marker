"use strict";
// marker.js - ミカン計測用: ArUco DICT_4X4_50 の8番(黒枠の外辺 2.0cm)を、
// モデルが出した marker 枠の周りだけ切り出して検出し、傾き補正した px/cm を返す。
// ライブラリ不要。 使い方:
//   const r = MarkerDetect.fromSource(videoOrImg, srcW, srcH, {cx,cy,w,h});   // ブラウザ
//   if (r) mm = mikanPx / r.pxPerCm * 10;
(function (root) {
  const MARKER_ID_PATTERN = {   // 6x6 (1=白)。OpenCV DICT_4X4_50 の 8 番(黒枠込み)
    8: [[0,0,0,0,0,0],[0,1,1,1,1,0],[0,1,1,1,0,0],[0,1,1,0,1,0],[0,1,0,1,0,0],[0,0,0,0,0,0]]
  };
  const MAX_SIDE = 420;     // 切り出しの長辺の上限(これより大きければ縮小して処理)
  const PAD = 0.9;          // 枠の幅に対する切り出しの余裕(片側)

  // ---------- 幾何 ----------
  function solve(A, b) {      // ガウス消去
    const n = b.length;
    for (let i = 0; i < n; i++) {
      let p = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      if (Math.abs(A[p][i]) < 1e-12) return null;
      [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
      for (let r = i + 1; r < n; r++) {
        const f = A[r][i] / A[i][i];
        for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
        b[r] -= f * b[i];
      }
    }
    const x = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = b[i];
      for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c];
      x[i] = s / A[i][i];
    }
    return x;
  }
  // src(4点) → dst(4点) のホモグラフィ(3x3, h22=1)
  function homography(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    const h = solve(A, b);
    return h ? [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1] : null;
  }
  function applyH(H, x, y) {
    const w = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
  }
  const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
  const meanSide = c => (dist(c[0], c[1]) + dist(c[1], c[2]) + dist(c[2], c[3]) + dist(c[3], c[0])) / 4;

  // 四隅 → 1cm あたりの画素数(傾き補正済み)。Python版 px_per_cm_from_corners と同じ。
  function pxPerCm(corners, cm) {
    const s = cm;
    const H = homography([[0, 0], [s, 0], [s, s], [0, s]], corners);
    if (!H) return null;
    const x = s / 2, y = s / 2;
    const w = H[6] * x + H[7] * y + H[8];
    const u = H[0] * x + H[1] * y + H[2], v = H[3] * x + H[4] * y + H[5];
    const J = [
      (H[0] * w - u * H[6]) / (w * w), (H[1] * w - u * H[7]) / (w * w),
      (H[3] * w - v * H[6]) / (w * w), (H[4] * w - v * H[7]) / (w * w)];
    // J^T J の固有値 → 特異値
    const a = J[0] * J[0] + J[2] * J[2], b = J[0] * J[1] + J[2] * J[3], c = J[1] * J[1] + J[3] * J[3];
    const m = (a + c) / 2, d = Math.sqrt(((a - c) / 2) ** 2 + b * b);
    const s1 = Math.sqrt(m + d), s2 = Math.sqrt(Math.max(0, m - d));
    return { pxPerCm: s1, pxPerCmMean: meanSide(corners) / cm, tiltDeg: Math.acos(Math.min(1, s2 / s1)) * 180 / Math.PI };
  }

  // ---------- 画像処理 ----------
  function toGray(img, W, H) {        // RGBA -> Float32 gray
    const g = new Float32Array(W * H), d = img.data;
    for (let i = 0; i < W * H; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    return g;
  }
  function shrink(g, W, H, k) {       // 面積平均で 1/k に縮小
    if (k <= 1) return { g, W, H };
    const w = Math.max(1, Math.floor(W / k)), h = Math.max(1, Math.floor(H / k)), o = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * W / w), x1 = Math.max(x0 + 1, Math.floor((x + 1) * W / w));
      const y0 = Math.floor(y * H / h), y1 = Math.max(y0 + 1, Math.floor((y + 1) * H / h));
      let s = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { s += g[yy * W + xx]; n++; }
      o[y * w + x] = s / n;
    }
    return { g: o, W: w, H: h };
  }
  function adaptiveDark(g, W, H, win, C) {   // 局所平均より C 以上暗い画素 = 1
    const I = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) { row += g[y * W + x]; I[(y + 1) * (W + 1) + x + 1] = I[y * (W + 1) + x + 1] + row; }
    }
    const out = new Uint8Array(W * H), r = win >> 1;
    for (let y = 0; y < H; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(H, y + r + 1);
      for (let x = 0; x < W; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(W, x + r + 1);
        const s = I[y1 * (W + 1) + x1] - I[y0 * (W + 1) + x1] - I[y1 * (W + 1) + x0] + I[y0 * (W + 1) + x0];
        const m = s / ((x1 - x0) * (y1 - y0));
        out[y * W + x] = g[y * W + x] < m - C ? 1 : 0;
      }
    }
    return out;
  }
  // 連結成分(4近傍)。各成分の面積・bbox・境界画素を返す
  function components(bin, W, H) {
    const lab = new Int32Array(W * H), comps = [], stack = [];
    let id = 0;
    for (let s = 0; s < W * H; s++) {
      if (!bin[s] || lab[s]) continue;
      id++;
      const c = { id, area: 0, x0: W, y0: H, x1: 0, y1: 0, pts: [] };
      lab[s] = id; stack.push(s);
      while (stack.length) {
        const p = stack.pop(), x = p % W, y = (p - x) / W;
        c.area++;
        if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
        let edge = false;
        const nb = [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1];
        for (const q of nb) {
          if (q < 0) { edge = true; continue; }
          if (!bin[q]) edge = true;
          else if (!lab[q]) { lab[q] = id; stack.push(q); }
        }
        if (edge) c.pts.push([x, y]);
      }
      comps.push(c);
    }
    return comps;
  }
  function hull(pts) {    // Andrew の単調連鎖
    const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], up = [];
    for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    lo.pop(); up.pop();
    return lo.concat(up);
  }
  function dp(pts, i, j, eps, out) {   // Douglas-Peucker (開区間 i..j)
    let best = -1, bi = -1;
    const a = pts[i % pts.length], b = pts[j % pts.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    for (let k = i + 1; k < j; k++) {
      const p = pts[k % pts.length], d = Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L;
      if (d > best) { best = d; bi = k; }
    }
    if (best > eps) { dp(pts, i, bi, eps, out); out.push(pts[bi % pts.length]); dp(pts, bi, j, eps, out); }
  }
  function polyApprox(h, eps) {      // 凸包を多角形近似
    if (h.length < 4) return h;
    let a = 0, b = 0, md = -1;       // 最遠の2点で分割
    for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++) {
      const d = dist(h[i], h[j]); if (d > md) { md = d; a = i; b = j; }
    }
    const rot = h.slice(a).concat(h.slice(0, a)), bb = b - a;
    const out = [rot[0]];
    dp(rot, 0, bb, eps, out); out.push(rot[bb]);
    dp(rot, bb, rot.length, eps, out);
    return out;
  }
  const area2 = q => { let s = 0; for (let i = 0; i < q.length; i++) { const p = q[i], r = q[(i + 1) % q.length]; s += p[0] * r[1] - r[0] * p[1]; } return s; };

  // 境界画素から辺ごとに直線を当てはめ、交点を四隅とする(サブピクセル)
  function refineCorners(q, pts, shift) {
    const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
    const lines = [];
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      const ux = dx / L, uy = dy / L, tol = Math.max(1.5, L * 0.03);
      const sel = [];
      for (const p of pts) {
        const t = ((p[0] - a[0]) * ux + (p[1] - a[1]) * uy) / L;
        const d = (p[0] - a[0]) * uy - (p[1] - a[1]) * ux;
        if (t > 0.12 && t < 0.88 && Math.abs(d) < tol) sel.push(p);
      }
      if (sel.length < 6) return null;
      let mx = 0, my = 0; for (const p of sel) { mx += p[0]; my += p[1]; }
      mx /= sel.length; my /= sel.length;
      let sxx = 0, sxy = 0, syy = 0;
      for (const p of sel) { const x = p[0] - mx, y = p[1] - my; sxx += x * x; sxy += x * y; syy += y * y; }
      const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), vx = Math.cos(th), vy = Math.sin(th);
      let nx = -vy, ny = vx;
      if ((cx - mx) * nx + (cy - my) * ny > 0) { nx = -nx; ny = -ny; }   // 外向きの法線
      lines.push({ px: mx + nx * shift, py: my + ny * shift, vx, vy });   // 画素の中心→画素の外縁へ shift だけ外へ
    }
    const out = [];
    for (let i = 0; i < 4; i++) {
      const A = lines[(i + 3) % 4], B = lines[i];
      const den = A.vx * B.vy - A.vy * B.vx;
      if (Math.abs(den) < 1e-6) return null;
      const t = ((B.px - A.px) * B.vy - (B.py - A.py) * B.vx) / den;
      out.push([A.px + t * A.vx, A.py + t * A.vy]);
    }
    return out;
  }


  // 辺ごとに、枠の内側(暗)→外側(明)の濃淡の境目をサブピクセルで探して直線を当てはめ直す
  function bil(g, W, H, x, y) {
    if (x < 0 || y < 0 || x > W - 1 || y > H - 1) return NaN;
    const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(W - 1, x0 + 1), y1 = Math.min(H - 1, y0 + 1), fx = x - x0, fy = y - y0;
    return (g[y0 * W + x0] * (1 - fx) + g[y0 * W + x1] * fx) * (1 - fy) + (g[y1 * W + x0] * (1 - fx) + g[y1 * W + x1] * fx) * fy;
  }
  function edgeRefine(g, W, H, q) {
    const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4;
    const lines = [];
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      const ux = dx / L, uy = dy / L;
      let nx = uy, ny = -ux;
      if (((a[0] + b[0]) / 2 - cx) * nx + ((a[1] + b[1]) / 2 - cy) * ny < 0) { nx = -nx; ny = -ny; }
      const r = Math.max(3, L * 0.06), step = 0.25, pts = [];
      for (let k = 0; k < 25; k++) {
        const t = 0.1 + 0.8 * k / 24, px = a[0] + dx * t, py = a[1] + dy * t;
        let bestG = 0, bestD = null;
        const prof = [];
        for (let d = -r; d <= r + 1e-9; d += step) prof.push([d, bil(g, W, H, px + nx * d, py + ny * d)]);
        const w = 4;      // 1px 離れた2点の差(内側が暗く外側が明るいほど大きい)
        for (let j = w; j < prof.length - w; j++) {
          const o = prof[j + w][1], inn = prof[j - w][1];
          if (isNaN(o) || isNaN(inn)) continue;
          const gr = o - inn;
          if (gr > bestG) { bestG = gr; bestD = prof[j][0]; }
        }
        if (bestD !== null && bestG > 12) pts.push([px + nx * bestD, py + ny * bestD]);
      }
      if (pts.length < 8) return null;
      let line = null;
      for (let it = 0; it < 3; it++) {
        let mx = 0, my = 0; for (const p of pts) { mx += p[0]; my += p[1]; } mx /= pts.length; my /= pts.length;
        let sxx = 0, sxy = 0, syy = 0;
        for (const p of pts) { const x = p[0] - mx, y = p[1] - my; sxx += x * x; sxy += x * y; syy += y * y; }
        const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), vx = Math.cos(th), vy = Math.sin(th);
        line = { px: mx, py: my, vx, vy };
        const res = pts.map(p => Math.abs((p[0] - mx) * vy - (p[1] - my) * vx));
        const sorted = res.slice().sort((p, q2) => p - q2), lim = Math.max(0.7, sorted[sorted.length >> 1] * 2.5);
        const keep = pts.filter((p, j) => res[j] <= lim);
        if (keep.length < 8 || keep.length === pts.length) break;
        pts.length = 0; keep.forEach(p => pts.push(p));
      }
      lines.push(line);
    }
    const out = [];
    for (let i = 0; i < 4; i++) {
      const A = lines[(i + 3) % 4], B = lines[i];
      const den = A.vx * B.vy - A.vy * B.vx;
      if (Math.abs(den) < 1e-6) return null;
      const t = ((B.px - A.px) * B.vy - (B.py - A.py) * B.vx) / den;
      out.push([A.px + t * A.vx, A.py + t * A.vy]);
    }
    return out;
  }

  // 4つの四隅候補から、パターンを読んで本物か確かめる。戻り値: {corners(TL,TR,BR,BL), hamming} か null
  function readMarker(g, W, H, q, pattern, maxHam) {
    // q は時計回り。マス中心を3x3でサンプルし、大津の方法で白黒に分ける
    let best = null;
    for (let rot = 0; rot < 4; rot++) {
      const c = [q[rot], q[(rot + 1) % 4], q[(rot + 2) % 4], q[(rot + 3) % 4]];
      const Hm = homography([[0, 0], [6, 0], [6, 6], [0, 6]], c);
      if (!Hm) continue;
      const v = [];
      for (let r = 0; r < 6; r++) for (let k = 0; k < 6; k++) {
        let s = 0, n = 0;
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
          const [x, y] = applyH(Hm, k + 0.25 + a * 0.25, r + 0.25 + b * 0.25);
          const xi = Math.round(x), yi = Math.round(y);
          if (xi < 0 || yi < 0 || xi >= W || yi >= H) return null;
          s += g[yi * W + xi]; n++;
        }
        v.push(s / n);
      }
      let lo = Math.min(...v), hi = Math.max(...v);
      if (hi - lo < 25) continue;
      let th = (lo + hi) / 2;              // 大津(2クラス平均を数回繰り返す)
      for (let it = 0; it < 8; it++) {
        let s0 = 0, n0 = 0, s1 = 0, n1 = 0;
        for (const x of v) { if (x < th) { s0 += x; n0++; } else { s1 += x; n1++; } }
        if (!n0 || !n1) break; th = (s0 / n0 + s1 / n1) / 2;
      }
      let ham = 0, borderBad = 0;
      for (let r = 0; r < 6; r++) for (let k = 0; k < 6; k++) {
        const bit = v[r * 6 + k] >= th ? 1 : 0;
        if (bit !== pattern[r][k]) { ham++; if (r === 0 || r === 5 || k === 0 || k === 5) borderBad++; }
      }
      if (borderBad > 1) continue;
      if (!best || ham < best.hamming) best = { corners: c, hamming: ham, rot };
    }
    return best && best.hamming <= maxHam ? best : null;
  }

  // ---------- 本体 ----------
  // img: 切り出した画像 {data:RGBA, width, height}、(ox,oy): 元画像での切り出しの左上
  function detectInCrop(img, ox, oy, opts) {
    const id = opts.id, cm = opts.cm, pattern = MARKER_ID_PATTERN[id];
    if (!pattern) throw new Error("未対応のマーカー番号: " + id);
    const maxHam = opts.maxHamming == null ? 2 : opts.maxHamming;
    const W0 = img.width, H0 = img.height;
    const k = Math.max(1, Math.max(W0, H0) / MAX_SIDE);
    const g0 = toGray(img, W0, H0);
    const s = shrink(g0, W0, H0, k), g = s.g, W = s.W, H = s.H, kx = W0 / W, ky = H0 / H;
    const minA = (Math.min(W, H) * 0.12) ** 2, maxA = (W * H) * 0.95;
    let best = null;
    for (const win of [Math.max(9, (Math.round(Math.min(W, H) / 4) | 1)), Math.max(7, (Math.round(Math.min(W, H) / 8) | 1)), Math.max(15, (Math.round(Math.min(W, H) / 2) | 1))]) {
      for (const C of [8, 14, 22]) {
        const bin = adaptiveDark(g, W, H, win, C);
        for (const c of components(bin, W, H)) {
          if (c.area < 40 || c.pts.length < 16) continue;
          const bw = c.x1 - c.x0 + 1, bh = c.y1 - c.y0 + 1;
          if (bw * bh < minA || bw * bh > maxA) continue;
          const h = hull(c.pts); if (h.length < 4) continue;
          const per = h.reduce((a, p, i) => a + dist(p, h[(i + 1) % h.length]), 0);
          let quad = null;
          for (const e of [0.025, 0.04, 0.06, 0.09]) {
            const ap = polyApprox(h, per * e);
            if (ap.length === 4) { quad = ap; break; }
          }
          if (!quad) continue;
          if (area2(quad) < 0) quad = quad.slice().reverse();          // 時計回りにそろえる(画像座標)
          const qa = area2(quad) / 2;
          if (qa < minA * 0.6) continue;
          const sides = quad.map((p, i) => dist(p, quad[(i + 1) % 4])), sMin = Math.min(...sides), sMax = Math.max(...sides);
          if (sMin < sMax * 0.4) continue;                              // 細長いものは除く
          if (c.area / qa < 0.35) continue;                             // 枠(中は白抜き)でも面積は四角形の4割以上ある
          let ref = refineCorners(quad, c.pts, 0.5) || quad;
          for (let it = 0; it < 2; it++) { const e = edgeRefine(g, W, H, ref); if (e) ref = e; }
          const rd = readMarker(g, W, H, ref, pattern, maxHam);
          if (!rd) continue;
          const score = rd.hamming * 1000 - qa;                          // 読み違いが少なく、大きいものを優先
          if (!best || score < best.score) best = { score, rd };
        }
      }
      if (best && best.rd.hamming === 0) break;
    }
    if (!best) return null;
    const corners = best.rd.corners.map(p => [ox + p[0] * kx, oy + p[1] * ky]);
    const m = pxPerCm(corners, cm);
    if (!m) return null;
    return { id, corners, hamming: best.rd.hamming, pxPerCm: m.pxPerCm, pxPerCmMean: m.pxPerCmMean, tiltDeg: m.tiltDeg };
  }

  // 全体の画像データ(RGBA配列)から bbox の周りを切り出して検出(テスト用・写真用)
  function detect(full, bbox, opts) {
    opts = Object.assign({ id: 8, cm: 2.0 }, opts || {});
    const W = full.width, H = full.height, half = Math.max(bbox.w, bbox.h) / 2 * (1 + PAD);
    const x0 = Math.max(0, Math.floor(bbox.cx - half)), y0 = Math.max(0, Math.floor(bbox.cy - half));
    const x1 = Math.min(W, Math.ceil(bbox.cx + half)), y1 = Math.min(H, Math.ceil(bbox.cy + half));
    const w = x1 - x0, h = y1 - y0;
    if (w < 24 || h < 24) return null;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) data.set(full.data.subarray(((y0 + y) * W + x0) * 4, ((y0 + y) * W + x1) * 4), y * w * 4);
    return detectInCrop({ data, width: w, height: h }, x0, y0, opts);
  }

  // ブラウザ: video / img / canvas から、bbox の周りだけ描いて getImageData する(全画面の読み出しを避ける)
  let _cc = null, _cx = null;
  function fromSource(src, sw, sh, bbox, opts) {
    opts = Object.assign({ id: 8, cm: 2.0 }, opts || {});
    const half = Math.max(bbox.w, bbox.h) / 2 * (1 + PAD);
    const x0 = Math.max(0, Math.floor(bbox.cx - half)), y0 = Math.max(0, Math.floor(bbox.cy - half));
    const x1 = Math.min(sw, Math.ceil(bbox.cx + half)), y1 = Math.min(sh, Math.ceil(bbox.cy + half));
    const w = x1 - x0, h = y1 - y0;
    if (w < 24 || h < 24) return null;
    if (!_cc) { _cc = document.createElement("canvas"); _cx = _cc.getContext("2d", { willReadFrequently: true }); }
    _cc.width = w; _cc.height = h;
    _cx.drawImage(src, x0, y0, w, h, 0, 0, w, h);
    return detectInCrop(_cx.getImageData(0, 0, w, h), x0, y0, opts);
  }

  root.MarkerDetect = { detect, detectInCrop, fromSource, pxPerCm };
  if (typeof module !== "undefined") module.exports = root.MarkerDetect;
})(typeof window !== "undefined" ? window : globalThis);
