"use strict";
// measure.js - ミカンの大きさ(mm)測定。index.html の後に読み込む(marker.js も必要)。
// 既存の関数(analyzeFrame / showPhoto / addRecord / resetAll)を包んで、検出のあとに足す:
//   補正あり: マーカーの四隅 → 傾き補正した px/cm → ミカンの直径mm
//   補正なし: モデルが出したmarker枠(外接する四角形)の幅と高さの平均 ÷ 2.0cm → 直径mm(従来の方法)
(function () {
  const MARKER_CM = 2.0;      // 黒枠の外辺の実寸
  const MARKER_ID = 8;        // DICT_4X4_50 の 8 番
  const MAX_TILT = 55;        // これ以上傾いたマーカーは使わない(度)
  const MIN_SIDE_PX = 24;     // マーカーの一辺がこれ未満(px)なら使わない
  const MIN_FRAMES = 3;       // 動画: この回数以上映ったミカンだけ集計

  // ---------- 純粋な計算(テストしやすいよう外に出す) ----------
  const median = a => { if (!a.length) return null; const s = a.slice().sort((p, q) => p - q), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const mmOf = (d, ppc) => Math.min(d.w, d.h) / ppc * 10;          // ミカンの直径(mm)。欠けにくい短い方の辺
  const oldPpc = m => (m.w + m.h) / 2 / MARKER_CM;                  // 補正なし: 枠の幅と高さの平均
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
  const nn = a => a.filter(v => v != null);
  // 記録1件ぶんの測定結果。rows: ミカンごとの {track, n, median(補正あり), min, max, medianOld(補正なし)}
  // video の trackSizes: id -> {mm:[補正あり...], old:[補正なし...]}
  function buildMeasure(src, last, trackSizes, ppcList, ppcOldList) {
    const rows = [];
    let ppc, ppcOld, tilt = null;
    if (src === "video") {
      for (const [id, a] of trackSizes) {
        if (Math.max(a.mm.length, a.old.length) < MIN_FRAMES) continue;
        rows.push({ track: id, n: Math.max(a.mm.length, a.old.length), median: median(a.mm), min: a.mm.length ? Math.min(...a.mm) : null, max: a.mm.length ? Math.max(...a.mm) : null, medianOld: median(a.old) });
      }
      ppc = median(ppcList); ppcOld = median(ppcOldList);
    } else {
      for (const x of last.mm) rows.push({ track: x.id, n: 1, median: x.mm, min: x.mm, max: x.mm, medianOld: x.mmOld });
      ppc = last.ppc; ppcOld = last.ppcOld; tilt = last.tilt == null ? null : last.tilt;
    }
    return { rows, ppc, ppcOld, tilt, medianMm: median(nn(rows.map(r => r.median))), medianMmOld: median(nn(rows.map(r => r.medianOld))) };
  }
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  const f1 = v => v == null ? "" : v.toFixed(1), f2 = v => v == null ? "" : v.toFixed(2);
  const cm = v => v == null ? "" : (v / 10).toFixed(2);
  function sizesCsv(recs) {
    const head = "record_id,tree_id,condition,source,track_id,n_frames,mm_corrected_median,mm_corrected_min,mm_corrected_max,mm_uncorrected_median,cm_corrected,cm_uncorrected,px_per_cm_corrected,px_per_cm_uncorrected,marker_tilt_deg\n";
    const lines = [];
    for (const r of recs) {
      const m = r.measure; if (!m) continue;
      const tail = [f2(m.ppc), f2(m.ppcOld), f1(m.tilt)];
      if (!m.rows.length) { lines.push([r.id, q(r.tree), q(r.cond || ""), r.src || "camera", "", 0, "", "", "", "", "", "", ...tail].join(",")); continue; }
      for (const w of m.rows) lines.push([r.id, q(r.tree), q(r.cond || ""), r.src || "camera", w.track == null ? "" : w.track, w.n, f1(w.median), f1(w.min), f1(w.max), f1(w.medianOld), cm(w.median), cm(w.medianOld), ...tail].join(","));
    }
    return head + lines.join("\n");
  }

  if (typeof module !== "undefined") module.exports = { median, mmOf, oldPpc, pickMarker, acceptMarker, buildMeasure, sizesCsv };
  if (typeof analyzeFrame !== "function") return;     // ブラウザ以外(テスト)ではここまで

  // ---------- 画面への組み込み ----------
  const emptyLast = () => ({ ppc: null, ppcOld: null, tilt: null, mm: [] });
  let trackSizes = new Map(), ppcList = [], ppcOldList = [], last = emptyLast();

  const hud = document.getElementById("hud"), info = document.createElement("small");
  info.id = "mmInfo"; info.textContent = "測定: -"; hud.appendChild(info);
  const hr = document.querySelector("#tbl thead tr");
  for (const t of ["補正あり mm", "補正なし mm"]) { const th = document.createElement("th"); th.textContent = t; hr.appendChild(th); }

  function overlay(r, list, k) {       // 画面にマーカーの四隅と mm を重ねる(座標は元画像、k は表示の倍率)
    if (r) {
      ctx.strokeStyle = "#ff3b6b"; ctx.lineWidth = Math.max(2, cv.width / 400);
      ctx.beginPath(); r.corners.forEach((p, i) => i ? ctx.lineTo(p[0] * k, p[1] * k) : ctx.moveTo(p[0] * k, p[1] * k)); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = "#ff3b6b"; r.corners.forEach(p => ctx.fillRect(p[0] * k - 2, p[1] * k - 2, 5, 5));
    }
    const fs = Math.max(14, cv.width / 38);
    ctx.lineJoin = "round"; ctx.lineWidth = fs / 5; ctx.strokeStyle = "#000";
    for (const x of list) {
      const px = x.d.x1 * k + 3, py = x.d.y2 * k - 6;
      ctx.font = "bold " + fs + "px sans-serif";
      if (x.mm != null) { const s = "あり " + x.mm.toFixed(1); ctx.strokeText(s, px, py); ctx.fillStyle = "#ffe14d"; ctx.fillText(s, px, py); }
      const s2 = "なし " + x.mmOld.toFixed(1), y2 = py - (x.mm != null ? fs * 1.1 : 0);
      ctx.strokeText(s2, px, y2); ctx.fillStyle = "#9fd8ff"; ctx.fillText(s2, px, y2);
    }
  }
  function show(r, po) {
    info.textContent = po == null ? "測定: マーカー未検出"
      : r ? `測定: ${r.pxPerCm.toFixed(1)}px/cm(補正なし ${po.toFixed(1)})・傾き${r.tiltDeg.toFixed(0)}°`
          : `測定: 四隅が取れません(補正なし ${po.toFixed(1)}px/cm)`;
  }
  function measureFrame(src, sw, sh, all, k, isVideo) {
    const t = parseFloat($("conf").value), m = pickMarker(all, t);
    if (!m) { show(null, null); last = emptyLast(); return null; }
    const r = acceptMarker(MarkerDetect.fromSource(src, sw, sh, { cx: m.cx, cy: m.cy, w: m.w, h: m.h }, { id: MARKER_ID, cm: MARKER_CM }), m);
    const po = oldPpc(m);
    show(r, po);
    const list = all.filter(d => d.c === CLS_MIKAN && d.s >= t).map(d => ({ d, mm: r ? mmOf(d, r.pxPerCm) : null, mmOld: mmOf(d, po) }));
    last = { ppc: r ? r.pxPerCm : null, ppcOld: po, tilt: r ? r.tiltDeg : null, mm: list.map(x => ({ id: x.d.tr ? x.d.tr.id : null, mm: x.mm, mmOld: x.mmOld })) };
    if (isVideo) {
      if (r) ppcList.push(r.pxPerCm);
      ppcOldList.push(po);
      for (const x of list) if (x.d.tr) {
        const a = trackSizes.get(x.d.tr.id) || { mm: [], old: [] };
        if (x.mm != null) a.mm.push(x.mm);
        a.old.push(x.mmOld); trackSizes.set(x.d.tr.id, a);
      }
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
    r.measure = buildMeasure(r.src, last, trackSizes, ppcList, ppcOldList);
    _add(r);
    const tr = $("tbl").tBodies[0].lastChild;
    for (const v of [r.measure.medianMm, r.measure.medianMmOld]) {
      const td = document.createElement("td"); td.textContent = v == null ? "-" : v.toFixed(1); tr.appendChild(td);
    }
  };

  const _reset = resetAll;
  resetAll = function () { _reset(); trackSizes = new Map(); ppcList = []; ppcOldList = []; last = emptyLast(); };
  $("reset").onclick = resetAll;      // 元のボタンは古い関数を持っているので付け替える

  const btn = document.createElement("button");
  btn.id = "scsv"; btn.textContent = "CSV(ミカンの大きさ・補正あり/なし)";
  btn.onclick = () => download("mikan_sizes.csv", sizesCsv(records));
  $("tcsv").after(btn);
})();
