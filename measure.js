"use strict";
// measure.js - ミカンの大きさ(mm)測定。index.html の後に読み込む(marker.js も必要)。
// 既存の関数(analyzeFrame / showPhoto / addRecord / resetAll)を包んで、
// 検出のあとに「マーカー四隅 → px/cm → ミカンの直径mm」を足す。
(function () {
  const MARKER_CM = 2.0;      // 黒枠の外辺の実寸
  const MARKER_ID = 8;        // DICT_4X4_50 の 8 番
  const MAX_TILT = 55;        // これ以上傾いたマーカーは使わない(度)
  const MIN_SIDE_PX = 24;     // マーカーの一辺がこれ未満(px)なら使わない
  const MIN_FRAMES = 3;       // 動画: この回数以上映ったミカンだけ集計

  // ---------- 純粋な計算(テストしやすいよう外に出す) ----------
  const median = a => { if (!a.length) return null; const s = a.slice().sort((p, q) => p - q), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const mmOf = (d, ppc) => Math.min(d.w, d.h) / ppc * 10;          // ミカンの直径(mm)。欠けにくい短い方の辺
  function pickMarker(all, th) {
    let b = null;
    for (const d of all) if (d.c === CLS_MARKER && d.s >= th && (!b || d.s > b.s)) b = d;
    return b;
  }
  function acceptMarker(r, m) {   // 検出結果が marker 枠と食い違う・傾きすぎ・小さすぎなら捨てる
    if (!r || r.tiltDeg > MAX_TILT || r.pxPerCm * MARKER_CM < MIN_SIDE_PX) return null;
    const cx = r.corners.reduce((a, p) => a + p[0], 0) / 4, cy = r.corners.reduce((a, p) => a + p[1], 0) / 4;
    if (Math.abs(cx - m.cx) > m.w * 0.6 || Math.abs(cy - m.cy) > m.h * 0.6) return null;
    return r;
  }
  // 記録1件ぶんの測定結果。rows: ミカンごとの {track, n, median, min, max}
  function buildMeasure(src, last, trackSizes, ppcList) {
    const rows = [];
    if (src === "video") {
      for (const [id, a] of trackSizes) if (a.length >= MIN_FRAMES)
        rows.push({ track: id, n: a.length, median: median(a), min: Math.min(...a), max: Math.max(...a) });
      return { rows, ppc: median(ppcList), tilt: null, medianMm: median(rows.map(r => r.median)) };
    }
    for (const x of last.mm) rows.push({ track: x.id, n: 1, median: x.mm, min: x.mm, max: x.mm });
    return { rows, ppc: last.ppc, tilt: last.tilt == null ? null : last.tilt, medianMm: median(rows.map(r => r.median)) };
  }
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  const f1 = v => v == null ? "" : v.toFixed(1), f2 = v => v == null ? "" : v.toFixed(2);
  function sizesCsv(recs) {
    const head = "record_id,tree_id,condition,source,track_id,n_frames,diameter_mm_median,diameter_mm_min,diameter_mm_max,px_per_cm,marker_tilt_deg\n";
    const lines = [];
    for (const r of recs) {
      const m = r.measure; if (!m) continue;
      if (!m.rows.length) { lines.push([r.id, q(r.tree), q(r.cond || ""), r.src || "camera", "", 0, "", "", "", f2(m.ppc), f1(m.tilt)].join(",")); continue; }
      for (const w of m.rows) lines.push([r.id, q(r.tree), q(r.cond || ""), r.src || "camera", w.track == null ? "" : w.track, w.n, f1(w.median), f1(w.min), f1(w.max), f2(m.ppc), f1(m.tilt)].join(","));
    }
    return head + lines.join("\n");
  }

  if (typeof module !== "undefined") module.exports = { median, mmOf, pickMarker, acceptMarker, buildMeasure, sizesCsv };
  if (typeof analyzeFrame !== "function") return;     // ブラウザ以外(テスト)ではここまで

  // ---------- 画面への組み込み ----------
  let trackSizes = new Map(), ppcList = [], last = { ppc: null, tilt: null, mm: [] };

  const hud = document.getElementById("hud"), info = document.createElement("small");
  info.id = "mmInfo"; info.textContent = "測定: -"; hud.appendChild(info);
  const hr = document.querySelector("#tbl thead tr"), th = document.createElement("th");
  th.textContent = "径mm"; hr.appendChild(th);

  function overlay(r, list, k) {       // 画面にマーカーの四隅と mm を重ねる(座標は元画像、k は表示の倍率)
    if (r) {
      ctx.strokeStyle = "#ff3b6b"; ctx.lineWidth = Math.max(2, cv.width / 400);
      ctx.beginPath(); r.corners.forEach((p, i) => i ? ctx.lineTo(p[0] * k, p[1] * k) : ctx.moveTo(p[0] * k, p[1] * k)); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = "#ff3b6b"; r.corners.forEach(p => ctx.fillRect(p[0] * k - 2, p[1] * k - 2, 5, 5));
    }
    const fs = Math.max(14, cv.width / 38); ctx.font = "bold " + fs + "px sans-serif";
    ctx.lineJoin = "round"; ctx.lineWidth = fs / 5; ctx.strokeStyle = "#000"; ctx.fillStyle = "#ffe14d";
    for (const x of list) {
      const s = x.mm.toFixed(1) + "mm", px = x.d.x1 * k + 3, py = x.d.y2 * k - 6;
      ctx.strokeText(s, px, py); ctx.fillText(s, px, py);
    }
  }
  function show(r) {
    info.textContent = r ? `測定: ${r.pxPerCm.toFixed(1)}px/cm・傾き${r.tiltDeg.toFixed(0)}°` : "測定: マーカー未検出";
  }
  function measureFrame(src, sw, sh, all, k, isVideo) {
    const t = parseFloat($("conf").value), m = pickMarker(all, t);
    const r = m ? acceptMarker(MarkerDetect.fromSource(src, sw, sh, { cx: m.cx, cy: m.cy, w: m.w, h: m.h }, { id: MARKER_ID, cm: MARKER_CM }), m) : null;
    show(r);
    if (!r) { last = { ppc: null, tilt: null, mm: [] }; return null; }
    const list = all.filter(d => d.c === CLS_MIKAN && d.s >= t).map(d => ({ d, mm: mmOf(d, r.pxPerCm) }));
    last = { ppc: r.pxPerCm, tilt: r.tiltDeg, mm: list.map(x => ({ id: x.d.tr ? x.d.tr.id : null, mm: x.mm })) };
    if (isVideo) {
      ppcList.push(r.pxPerCm);
      for (const x of list) if (x.d.tr) { const a = trackSizes.get(x.d.tr.id) || []; a.push(x.mm); trackSizes.set(x.d.tr.id, a); }
    }
    overlay(r, list, k);
    return r;
  }

  const _analyze = analyzeFrame;
  analyzeFrame = async function () {
    await _analyze();
    try { measureFrame(video, video.videoWidth, video.videoHeight, lastAll, cv.width / video.videoWidth, lastSrc === "video"); }
    catch (e) { info.textContent = "測定エラー: " + e.message; }
  };

  const _show = showPhoto;
  showPhoto = function () {
    _show();
    try {
      const p = photoState; if (!p) return;
      const w = p.img.naturalWidth, h = p.img.naturalHeight;
      measureFrame(p.img, w, h, p.all, cv.width / w, false);
    } catch (e) { info.textContent = "測定エラー: " + e.message; }
  };

  const _add = addRecord;
  addRecord = function (r) {
    r.measure = buildMeasure(r.src, last, trackSizes, ppcList);
    _add(r);
    const td = document.createElement("td");
    td.textContent = r.measure.medianMm == null ? "-" : r.measure.medianMm.toFixed(1);
    $("tbl").tBodies[0].lastChild.appendChild(td);
  };

  const _reset = resetAll;
  resetAll = function () { _reset(); trackSizes = new Map(); ppcList = []; last = { ppc: null, tilt: null, mm: [] }; };
  $("reset").onclick = resetAll;      // 元のボタンは古い関数を持っているので付け替える

  const btn = document.createElement("button");
  btn.id = "scsv"; btn.textContent = "CSV(ミカンの大きさmm)";
  btn.onclick = () => download("mikan_sizes.csv", sizesCsv(records));
  $("tcsv").after(btn);
})();
