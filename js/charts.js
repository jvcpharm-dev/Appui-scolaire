/* Graphiques SVG faits main (aucune bibliothèque). */
"use strict";
const W = 520, H = 250, ML = 44, MR = 12, MT = 14, MB = 30;
function barChart(rows) {
  const data = rows.filter(r => r.v != null);
  if (!data.length) return `<p class="hint">Pas encore de présences d'élèves saisies sur la période.</p>`;
  const iw = W - ML - MR, ih = H - MT - MB, n = rows.length, bw = iw / n;
  const y = v => MT + ih - ih * v / 100;
  let g = "";
  [0, 25, 50, 75, 100].forEach(t => { g += `<line x1="${ML}" x2="${W - MR}" y1="${y(t)}" y2="${y(t)}" stroke="var(${t === 0 ? "--axis" : "--grid"})" stroke-width="1"/><text x="${ML - 6}" y="${y(t) + 4}" text-anchor="end">${t} %</text>`; });
  const every = Math.ceil(n / 6);
  rows.forEach((r, i) => {
    const x = ML + i * bw, w = Math.max(2, Math.min(28, bw - 4)), cx = x + bw / 2;
    if (r.v != null) {
      const top = y(r.v), h = MT + ih - top, rad = Math.min(4, w / 2, h);
      g += `<path d="M${cx - w / 2},${MT + ih} V${top + rad} Q${cx - w / 2},${top} ${cx - w / 2 + rad},${top} H${cx + w / 2 - rad} Q${cx + w / 2},${top} ${cx + w / 2},${top + rad} V${MT + ih} Z" fill="var(--series-1)"/>`;
    }
    g += `<rect x="${x}" y="${MT}" width="${bw}" height="${ih}" fill="transparent" data-tip="Semaine du ${fmtD(r.w)}\n${r.v == null ? "Aucune présence saisie" : r.v + " % de présence (" + r.P + " sur " + (r.P + r.A) + ")"}\n${r.held} cours donné${r.held > 1 ? "s" : ""}, ${r.pointed} pointé${r.pointed > 1 ? "s" : ""}"/>`;
    if (i % every === 0) g += `<text x="${cx}" y="${H - 10}" text-anchor="middle">${fmtD(r.w)}</text>`;
  });
  const last = [...rows].reverse().find(r => r.v != null);
  if (last) { const i = rows.indexOf(last); g += `<text class="lbl" x="${ML + i * bw + bw / 2}" y="${y(last.v) - 6}" text-anchor="middle">${last.v} %</text>`; }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Taux de présence des élèves par semaine">${g}</svg>`;
}
function lineChart(series, mFrom, mTo) {
  const pts = [...series.primaire, ...series.secondaire];
  if (!pts.length) return `<p class="hint">Pas encore de moyennes saisies sur la période.</p>`;
  const minP = Math.min(mFrom, ...pts.map(p => p.pos)), maxP = Math.max(mTo, ...pts.map(p => p.pos));
  const iw = W - ML - MR, ih = H - MT - MB;
  const x = p => ML + (maxP === minP ? iw / 2 : iw * (p - minP) / (maxP - minP));
  const y = v => MT + ih - ih * v / 20;
  let g = "";
  [0, 5, 10, 15, 20].forEach(t => { g += `<line x1="${ML}" x2="${W - MR}" y1="${y(t)}" y2="${y(t)}" stroke="var(${t === 0 ? "--axis" : "--grid"})" stroke-width="1" ${t === 10 ? 'stroke-dasharray="4 3"' : ""}/><text x="${ML - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`; });
  g += `<text x="${ML + 6}" y="${y(10) + 15}">moyenne 10/20</text>`;
  for (let p = minP; p <= maxP; p++) { if ((maxP - minP) > 8 && (p - minP) % 2) continue; g += `<text x="${x(p)}" y="${H - 10}" text-anchor="middle">${MOIS_C[p % 12]}</text>`; }
  [["primaire", "--series-1"], ["secondaire", "--series-2"]].forEach(([k, col]) => {
    const s = series[k]; if (!s.length) return;
    if (s.length > 1) g += `<polyline fill="none" stroke="var(${col})" stroke-width="2" stroke-linejoin="round" points="${s.map(p => x(p.pos) + "," + y(p.v)).join(" ")}"/>`;
    s.forEach(p => { g += `<circle cx="${x(p.pos)}" cy="${y(p.v)}" r="4.5" fill="var(${col})" stroke="var(--card)" stroke-width="2"/><circle cx="${x(p.pos)}" cy="${y(p.v)}" r="14" fill="transparent" data-tip="${k === "primaire" ? "Primaire · " + moisLabel(p.p) : "Secondaire · " + trimLabel(p.p)}\nMoyenne ${fmtN(p.v, 2)} / 20\n${p.n} élève${p.n > 1 ? "s" : ""}"/>`; });
    const l = s[s.length - 1]; g += `<text class="lbl" x="${x(l.pos) + 8}" y="${y(l.v) + (k === "primaire" ? -8 : 14)}" text-anchor="${x(l.pos) > W - 60 ? "end" : "start"}">${fmtN(l.v)}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution de la moyenne des élèves sur 20">${g}</svg>`;
}
function scatter(rows) {
  if (rows.length < 2) return `<p class="hint">Ce graphique apparaît dès que des élèves ont au moins deux moyennes et des présences saisies.</p>`;
  const iw = W - ML - MR, ih = H - MT - MB - 6;
  const ext = Math.max(2, Math.ceil(Math.max(...rows.map(r => Math.abs(r.prog)))));
  const x = v => ML + iw * v / 100, y = v => MT + ih / 2 - (ih / 2) * v / ext;
  let g = "";
  [0, 25, 50, 75, 100].forEach(t => { g += `<line x1="${x(t)}" x2="${x(t)}" y1="${MT}" y2="${MT + ih}" stroke="var(--grid)"/><text x="${x(t)}" y="${MT + ih + 16}" text-anchor="middle">${t} %</text>`; });
  [-ext, 0, ext].forEach(t => { g += `<line x1="${ML}" x2="${W - MR}" y1="${y(t)}" y2="${y(t)}" stroke="var(${t === 0 ? "--axis" : "--grid"})"/><text x="${ML - 6}" y="${y(t) + 4}" text-anchor="end">${t > 0 ? "+" : ""}${t}</text>`; });
  g += `<text x="${ML + 4}" y="${MT + 12}">progression (points /20)</text>`;
  rows.forEach(r => { g += `<circle cx="${x(r.ass)}" cy="${y(r.prog)}" r="5" fill="var(--series-1)" fill-opacity=".8" stroke="var(--card)" stroke-width="2"/><circle cx="${x(r.ass)}" cy="${y(r.prog)}" r="12" fill="transparent" data-tip="${esc(kidName(r.k))} (${esc(r.k.niveau)})\nAssiduité ${r.ass} %\nProgression ${r.prog > 0 ? "+" : ""}${fmtN(r.prog)} pts : ${fmtN(r.first)} → ${fmtN(r.last)}"/>`; });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Nuage de points assiduité et progression">${g}</svg><p class="hint">Axe horizontal : assiduité aux cours de renforcement. Chaque point est un élève ; en haut à droite, les élèves assidus et en progrès.</p>`;
}
const tip = $("#tip");
document.addEventListener("pointerover", e => { const t = e.target.closest && e.target.closest("[data-tip]"); if (!t) { tip.style.display = "none"; return; } tip.textContent = t.getAttribute("data-tip"); tip.style.display = "block"; moveTip(e); });
document.addEventListener("pointermove", e => { if (tip.style.display === "block") moveTip(e); });
function moveTip(e) { const r = tip.getBoundingClientRect(); let x = e.clientX + 14, y = e.clientY + 14; if (x + r.width > innerWidth - 8) x = e.clientX - r.width - 14; if (y + r.height > innerHeight - 8) y = e.clientY - r.height - 14; tip.style.left = x + "px"; tip.style.top = y + "px"; }

