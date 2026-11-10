/* Outils communs : dates, formats, constantes. */
"use strict";

const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const pad = n => String(n).padStart(2, "0");

/* Dates : on travaille en UTC pour éviter tout décalage d'un jour. */
const iso = d => d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
const parseISO = s => { const [y, m, d] = String(s).split("-").map(Number); return new Date(Date.UTC(y, (m || 1) - 1, d || 1)); };
const addDays = (d, n) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x; };
const mondayOf = d => { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); return addDays(x, -((x.getUTCDay() + 6) % 7)); };
const today = () => { const n = new Date(); return new Date(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate())); };
const curMonday = () => iso(mondayOf(today()));
const weeksBetween = (a, b) => { const out = []; let d = mondayOf(parseISO(a)); const end = parseISO(b); while (d <= end) { out.push(iso(d)); d = addDays(d, 7); } return out; };

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MOIS_C = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const fmtD = s => { const d = parseISO(s); return d.getUTCDate() + " " + MOIS_C[d.getUTCMonth()]; };
const weekLabel = mon => {
  const a = parseISO(mon), b = addDays(a, 6);
  return "du " + a.getUTCDate() + (a.getUTCMonth() !== b.getUTCMonth() ? " " + MOIS_C[a.getUTCMonth()] : "") + " au " + b.getUTCDate() + " " + MOIS_C[b.getUTCMonth()] + " " + b.getUTCFullYear();
};
const fmtStamp = t => { if (!t) return ""; const d = new Date(t); if (isNaN(d)) return String(t); return d.getDate() + " " + MOIS_C[d.getMonth()] + " à " + pad(d.getHours()) + ":" + pad(d.getMinutes()); };

/* Heures « HH:MM » */
const toMin = t => { if (!t || !/^\d{1,2}:\d{2}/.test(t)) return null; const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const hhmm = t => t ? String(t).slice(0, 5) : "";
const fmtDur = m => m == null ? "–" : Math.floor(m / 60) + " h " + pad(Math.round(m % 60));

/* Nombres */
const pct = (a, b) => b ? Math.round(100 * a / b) : null;
const fmtPct = v => v == null ? "–" : v + " %";
const fmtN = (v, d = 1) => v == null || isNaN(v) ? "–" : Number(v).toFixed(d).replace(".", ",");
const avg = arr => arr.length ? arr.reduce((s, x) => s + x, 0) / arr.length : null;

/* Stockage local (préférences de l'appareil uniquement) */
const store = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { v == null || v === "" ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch (e) {} }
};

/* Classes et barèmes (système ivoirien) */
const PRIMAIRE = ["CP1", "CP2", "CE1", "CE2", "CM1", "CM2"];
const SECONDAIRE = ["6e", "5e", "4e", "3e", "2nde", "1ère", "Tle"];
const cycleOf = niv => PRIMAIRE.includes(niv) ? "primaire" : "secondaire";
const baremeOf = niv => cycleOf(niv) === "primaire" ? 10 : 20;

const kidName = k => ((k.prenom || "") + " " + (k.nom || "")).trim() || "Sans nom";
const seanceKey = (ens, w) => ens + "__" + w;
const noteKey = (kid, p) => kid + "__" + p;
