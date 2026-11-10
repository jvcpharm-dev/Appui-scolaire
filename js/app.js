/* Application : état, écrans et actions. */
"use strict";

/* ---------- État ---------- */
const S = {
  user: null, isAdmin: false, loaded: false, busy: false, booting: true,
  ens: {}, enf: {}, seances: {}, notes: {}, config: {},
  screen: "login", needsSetup: false, loginErr: "", loadErr: "",
  tab: store.get("as_tab") || "seance", me: "",
  week: curMonday(), mois: null, trim: null,
  drafts: {}, editEns: null, editEnf: null, vacDraft: null, formRole: null,
  f: { site: "", ens: "", from: null, to: null },
  sortEns: { k: "nom", d: 1 }, sortEnf: { k: "nom", d: 1 }, q: ""
};

/* ---------- Icônes (traits simples, 24 px) ---------- */
const I = p => `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON = {
  seance: I('<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18M9 15l2 2 4-4"/>'),
  notes: I('<path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/>'),
  eleves: I('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2"/><circle cx="17" cy="9" r="2.4"/><path d="M16.5 14.6c2.4.2 4 1.8 4.5 4.4"/>'),
  analyse: I('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'),
  gestion: I('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  compte: I('<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6.2 8-6.2s7.2 2.2 8 6.2"/>'),
  refresh: I('<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 4v5h-5"/>'),
  prev: I('<path d="M15 18l-6-6 6-6"/>'), next: I('<path d="M9 18l6-6-6-6"/>')
};

/* ---------- Petites notifications ---------- */
function toast(text, ok = true) {
  const t = document.createElement("div");
  t.className = "toast " + (ok ? "ok" : "err");
  t.setAttribute("role", ok ? "status" : "alert");
  t.textContent = text;
  $("#toasts").appendChild(t);
  setTimeout(() => t.classList.add("out"), ok ? 3500 : 7000);
  setTimeout(() => t.remove(), ok ? 4000 : 7500);
}

/* ---------- Chargement des données ---------- */
function applyData(d) {
  S.user = d.me; S.isAdmin = d.me.role === "admin";
  S.config = d.config || {};
  S.ens = {}; d.ens.forEach(e => S.ens[e.id] = e);
  S.enf = {}; d.enf.forEach(k => S.enf[k.id] = k);
  S.seances = {}; d.seances.forEach(s => S.seances[seanceKey(s.enseignantId, s.semaine)] = s);
  S.notes = {}; d.notes.forEach(n => S.notes[noteKey(n.enfantId, n.periode)] = n);
  if (!S.isAdmin) S.me = d.me.id;
  else if (!S.ens[S.me]) S.me = S.ens[store.get("as_me")] ? store.get("as_me") : "";
  S.loaded = true; S.loadErr = "";
}
async function reload() {
  try { applyData(await Api.load()); }
  catch (e) {
    const msg = humanError(e);
    if (!(await Api.session().catch(() => null))) { S.loaded = false; S.screen = "login"; S.loginErr = msg; }
    else S.loadErr = msg;
  }
}
/* Exécute une modification, recharge les données et prévient l'utilisateur */
async function act(fn, okText) {
  if (S.busy) return false;
  S.busy = true; render();
  let ok = true;
  try { await fn(); await reload(); if (okText) toast(okText); }
  catch (e) { ok = false; toast(humanError(e), false); }
  S.busy = false; render();
  return ok;
}

/* ---------- Année scolaire & périodes ---------- */
function cfg() {
  const t = today();
  const y = t.getUTCMonth() >= 7 ? t.getUTCFullYear() : t.getUTCFullYear() - 1;
  const c = S.config || {};
  return { debut: c.debut || (y + "-09-07"), fin: c.fin || ((y + 1) + "-06-30"), tolerance: Number.isFinite(c.tolerance) ? c.tolerance : 10, vacances: Array.isArray(c.vacances) ? c.vacances : [] };
}
function anneeScolaire() { const y = parseISO(cfg().debut).getUTCFullYear(); return y + "-" + (y + 1); }
function moisAnnee() {
  const c = cfg(); const out = [];
  let d = parseISO(c.debut); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = parseISO(c.fin);
  while (d <= end) { out.push(d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1)); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); }
  return out;
}
const moisLabel = k => { const [y, m] = k.split("-").map(Number); return MOIS[m - 1] + " " + y; };
function trimestres() { const a = anneeScolaire(); return [1, 2, 3].map(i => a + "-T" + i); }
const trimLabel = k => { const t = k.split("-T")[1]; return (t === "1" ? "1er" : t + "e") + " trimestre"; };
function periodRange(p) {
  if (p.includes("-T")) {
    const y = Number(p.slice(0, 4)), t = p.split("-T")[1];
    if (t === "1") return [y * 12 + 8, y * 12 + 11];
    if (t === "2") return [(y + 1) * 12 + 0, (y + 1) * 12 + 2];
    return [(y + 1) * 12 + 3, (y + 1) * 12 + 5];
  }
  const [y, m] = p.split("-").map(Number); const i = y * 12 + m - 1; return [i, i];
}
const periodPos = p => periodRange(p)[1];
function defaultMois() { const t = today(); const k = t.getUTCFullYear() + "-" + pad(t.getUTCMonth() + 1); const l = moisAnnee(); return l.includes(k) ? k : l[0]; }
function defaultTrim() { const m = today().getUTCMonth(); const tr = trimestres(); return m >= 8 ? tr[0] : m <= 2 ? tr[1] : tr[2]; }

/* ---------- Données dérivées ---------- */
const ensList = (all = false) => Object.values(S.ens).filter(e => e.role !== "admin" && (all || e.actif !== false)).sort((a, b) => (a.nom || "").localeCompare(b.nom || "", "fr"));
const enfOf = (ensId, all = false) => Object.values(S.enf).filter(k => k.enseignantId === ensId && (all || k.actif !== false)).sort((a, b) => (a.nom + a.prenom).localeCompare(b.nom + b.prenom, "fr"));
const sites = () => [...new Set(ensList(true).map(e => (e.site || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr"));

/* ---------- Rendu général ---------- */
function tabsFor() {
  const t = [["seance", "Semaine", "Séance de la semaine"], ["notes", "Moyennes", "Moyennes"], ["eleves", "Élèves", "Mes élèves"]];
  if (S.isAdmin) t.push(["analyse", "Analyse", "Analyse"], ["gestion", "Gestion", "Gestion"]);
  t.push(["compte", "Compte", "Mon compte"]);
  return t;
}
function render() {
  const app = $("#app");
  const signedIn = S.loaded && S.user;
  document.body.classList.toggle("signed-in", !!signedIn);
  $("#demo-banner").hidden = !(Api && Api.mode === "demo");
  if (!Api) { app.innerHTML = viewNoLib(); return; }
  if (S.booting) { app.innerHTML = `<div class="boot"><div class="spinner"></div></div>`; return; }
  if (!signedIn) { app.innerHTML = S.loadErr && !S.loaded ? viewLoadErr() : viewLogin(); $("#nav").innerHTML = ""; $("#topright").innerHTML = ""; return; }

  const tabs = tabsFor();
  if (!tabs.some(t => t[0] === S.tab)) S.tab = "seance";
  $("#nav").innerHTML = tabs.map(([k, short, long]) => `<button class="nav-item" role="tab" aria-selected="${S.tab === k}" data-act="tab" data-v="${k}">${ICON[k]}<span class="long">${long}</span><span class="short">${short}</span></button>`).join("");
  $("#year").textContent = "Année " + anneeScolaire().replace("-", "–");
  const list = ensList();
  $("#topright").innerHTML = (S.isAdmin && list.length ? `<label class="picker"><span>Saisir pour</span><select id="me-sel" data-act="me"><option value="">Choisir un enseignant</option>${list.map(e => `<option value="${esc(e.id)}" ${e.id === S.me ? "selected" : ""}>${esc(e.nom)}</option>`).join("")}</select></label>` : `<span class="hello">${esc(S.user.nom)}</span>`) + (S.isAdmin ? `<span class="chip neutral role-chip" title="Compte administrateur">Admin</span>` : "") +
    `<button class="icon-btn" data-act="refresh" title="Actualiser les données" aria-label="Actualiser les données" ${S.busy ? "disabled" : ""}>${ICON.refresh}</button>`;

  const v = { seance: viewSeance, notes: viewNotes, eleves: viewEleves, analyse: viewAnalyse, gestion: viewGestion, compte: viewCompte }[S.tab];
  app.innerHTML = (S.loadErr ? `<div class="msg err">${esc(S.loadErr)}</div>` : "") + v();
  if (S.busy) app.querySelectorAll("button.primary").forEach(b => { b.disabled = true; b.classList.add("loading"); });
  if (typeof PWA !== "undefined") PWA.afterRender();
}

/* ---------- Connexion & premier lancement ---------- */
function viewNoLib() {
  return `<section class="login-wrap"><div class="login-card"><h2>Connexion impossible</h2>
    <p class="hint">L'application n'a pas pu charger le module Supabase. Vérifiez votre connexion internet puis rechargez la page.</p>
    <button class="btn primary" onclick="location.reload()">Recharger</button></div></section>`;
}
function viewLoadErr() {
  return `<section class="login-wrap"><div class="login-card"><h2>Données inaccessibles</h2><div class="msg err">${esc(S.loadErr)}</div>
    <div class="row"><button class="btn primary" data-act="retry">Réessayer</button><button class="btn" data-act="logout">Se déconnecter</button></div></div></section>`;
}
function viewLogin() {
  const setup = S.needsSetup;
  const demo = Api.mode === "demo";
  return `<section class="login-wrap">
    <div class="login-hero" aria-hidden="true">
      <div class="hero-mark">${LOGO}</div>
      <p class="hero-title">Appui scolaire</p>
      <p class="hero-sub">Présences, horaires et moyennes des groupes de renforcement d'Abidjan.</p>
    </div>
    <div class="login-card">
      <h2>${setup ? "Premier lancement" : "Connexion"}</h2>
      <p class="hint">${setup ? "Aucun administrateur n'existe encore. Créez votre compte : il aura accès à tout et pourra créer les comptes des autres administrateurs et des enseignants." : "Entrez le profil et le mot de passe donnés par votre administrateur."}</p>
      <form data-form="${setup ? "setup" : "login"}" class="stack">
        ${setup ? `<div class="field"><label for="l-nom">Votre nom</label><input type="text" id="l-nom" name="nom" required autocomplete="name"></div>` : ""}
        <div class="field"><label for="l-profil">Profil</label><input type="text" id="l-profil" name="profil" autocomplete="username" autocapitalize="none" spellcheck="false" required placeholder="${setup ? "ex. admin" : "ex. aya.konan"}"></div>
        <div class="field"><label for="l-mdp">Mot de passe</label><input type="password" id="l-mdp" name="mdp" autocomplete="${setup ? "new-password" : "current-password"}" required ${setup ? 'minlength="6"' : ""}></div>
        ${S.loginErr ? `<div class="msg err" role="alert">${esc(S.loginErr)}</div>` : ""}
        ${S.setupErr && !setup ? `<div class="msg err" role="alert"><b>Impossible de vérifier la base de données.</b> ${esc(S.setupErr)}</div>` : ""}
        <button class="btn primary big" type="submit" ${S.busy ? "disabled" : ""}>${S.busy ? "Patientez…" : setup ? "Créer mon compte administrateur" : "Se connecter"}</button>
      </form>
      ${demo ? `<div class="demo-accounts"><p><b>Comptes de démonstration</b> · mot de passe <code>demo123</code></p>
        <div class="row">${["admin", "aya.konan", "yao.kouadio"].map(p => `<button class="chip-btn" data-act="demo-fill" data-v="${p}">${p}</button>`).join("")}</div></div>`
      : setup ? `<button class="link-btn" data-act="hide-setup">← Retour à la connexion</button>`
      : `<p class="hint small">Mot de passe oublié ? Un administrateur peut vous en donner un nouveau.</p>
         <button class="link-btn" data-act="show-setup">Première installation ? Créer le compte administrateur</button>`}
    </div>
  </section>`;
}
async function doLogin(form, setup) {
  const f = Object.fromEntries(new FormData(form));
  const profil = String(f.profil || "").trim().toLowerCase();
  S.busy = true; S.loginErr = ""; render();
  try {
    if (setup) await Api.setup(String(f.nom || "").trim(), profil, f.mdp);
    else await Api.login(profil, f.mdp);
    applyData(await Api.load());
    S.needsSetup = false;
  } catch (e) { S.loginErr = humanError(e); }
  S.busy = false; render();
}
async function logout() {
  await Api.logout().catch(() => {});
  Object.assign(S, { user: null, loaded: false, drafts: {}, loginErr: "", loadErr: "", ens: {}, enf: {}, seances: {}, notes: {} });
  render();
}

/* ---------- Écran : Séance de la semaine ---------- */
function needTeacher() {
  const list = ensList();
  if (!list.length) {
    return `<div class="card empty"><h2>Aucun enseignant enregistré</h2>${S.isAdmin
      ? `<p class="hint">Créez les comptes des étudiants-enseignants dans Gestion.</p><button class="btn primary" data-act="tab" data-v="gestion">Créer des comptes</button>`
      : `<p class="hint">Votre compte n'est relié à aucun groupe. Contactez un administrateur.</p>`}</div>`;
  }
  if (!S.ens[S.me]) {
    return `<div class="card"><h2>Pour quel enseignant saisir ?</h2><p class="hint">En tant qu'administrateur, vous pouvez saisir ou corriger les données de n'importe quel groupe.</p>
      <div class="pick-grid">${list.map(e => `<button class="pick" data-act="pick-me" data-v="${esc(e.id)}"><b>${esc(e.nom)}</b><span>${esc(e.site || "")}</span></button>`).join("")}</div></div>`;
  }
  return null;
}
function seanceDraft(ensId, w) {
  const k = "s:" + ensId + ":" + w;
  if (S.drafts[k]) return { d: S.drafts[k], dirty: true, k };
  const s = S.seances[seanceKey(ensId, w)];
  const e = S.ens[ensId] || {};
  const jour = Number.isInteger(e.jour) ? e.jour : 5;
  const base = s ? JSON.parse(JSON.stringify(s)) : { present: null, dateCours: "", arrivee: "", depart: "", motif: "", eleves: {} };
  base.eleves = base.eleves || {};
  if (!base.dateCours) base.dateCours = iso(addDays(parseISO(w), jour));
  return { d: base, dirty: false, k, saved: s };
}
function viewSeance() {
  const nt = needTeacher(); if (nt) return nt;
  const e = S.ens[S.me], w = S.week, c = cfg();
  const { d, dirty, saved } = seanceDraft(S.me, w);
  const isCur = w === curMonday(), vac = c.vacances.includes(w);
  const kids = enfOf(S.me);
  const nP = kids.filter(k => d.eleves[k.id] === "P").length, nA = kids.filter(k => d.eleves[k.id] === "A").length;
  const arr = toMin(d.arrivee), dep = toMin(d.depart);
  const dur = arr != null && dep != null && dep > arr ? dep - arr : null;
  const retard = arr != null && toMin(e.heureDebut) != null ? arr - toMin(e.heureDebut) : null;
  const weeks = weeksBetween(iso(addDays(parseISO(curMonday()), -7 * 9)), curMonday()).filter(x => x >= iso(mondayOf(parseISO(c.debut))));
  const hist = weeks.map(x => {
    const s = S.seances[seanceKey(S.me, x)], v = c.vacances.includes(x);
    const st = s ? (s.present ? "good" : "bad") : v ? "neutral" : x === curMonday() ? "ghost" : "warn";
    const txt = s ? (s.present ? "Fait" : "Absent") : v ? "Congé" : x === curMonday() ? "En cours" : "À pointer";
    return `<button class="day ${x === w ? "sel" : ""}" data-act="week-go" data-v="${x}"><span class="dot ${st}"></span><span class="d">${fmtD(x)}</span><span class="t">${txt}</span></button>`;
  }).join("");
  return `
  <div class="card week-card">
    <div class="weeknav">
      <button class="icon-btn" data-act="week" data-v="-1" aria-label="Semaine précédente">${ICON.prev}</button>
      <div class="label"><span class="eyebrow">${isCur ? "Cette semaine" : "Semaine"}</span><b>${weekLabel(w)}</b></div>
      <button class="icon-btn" data-act="week" data-v="1" aria-label="Semaine suivante" ${isCur ? "disabled" : ""}>${ICON.next}</button>
    </div>
    <div class="days" aria-label="Semaines récentes">${hist}</div>
    ${vac ? `<div class="msg info">Semaine marquée « sans cours » par l'administration. Vous pouvez quand même pointer si un cours a eu lieu.</div>` : ""}
  </div>

  <div class="card">
    <div class="card-head"><h2><span class="step">1</span>Ma présence</h2>${e.heureDebut ? `<span class="hint">Prévu : ${esc(JOURS[e.jour] || "")} ${esc(e.heureDebut)}–${esc(e.heureFin || "")}</span>` : ""}</div>
    <div class="seg big" role="group" aria-label="Présence de l'enseignant">
      <button data-act="s-present" data-v="1" class="${d.present === true ? "on-p" : ""}" aria-pressed="${d.present === true}">J'ai donné le cours</button>
      <button data-act="s-present" data-v="0" class="${d.present === false ? "on-a" : ""}" aria-pressed="${d.present === false}">Je n'ai pas pu venir</button>
    </div>
    ${d.present === true ? `
      <div class="grid3">
        <div class="field"><label for="s-date">Date du cours</label><input type="date" id="s-date" data-in="dateCours" value="${esc(d.dateCours)}" min="${w}" max="${iso(addDays(parseISO(w), 6))}"></div>
        <div class="field"><label for="s-arr">Arrivée</label><input type="time" id="s-arr" data-in="arrivee" value="${esc(d.arrivee)}"></div>
        <div class="field"><label for="s-dep">Départ</label><input type="time" id="s-dep" data-in="depart" value="${esc(d.depart)}"></div>
      </div>
      <div class="meta">Durée <b>${fmtDur(dur)}</b>${retard != null ? (retard > c.tolerance ? `<span class="chip warn">Retard de ${retard} min</span>` : `<span class="chip good">À l'heure</span>`) : ""}</div>` : ""}
    ${d.present === false ? `<div class="field"><label for="s-motif">Motif</label><textarea id="s-motif" data-in="motif" placeholder="Examens, maladie, cours remplacé…">${esc(d.motif)}</textarea></div>` : ""}
  </div>

  <div class="card">
    <div class="card-head"><h2><span class="step">2</span>Présence des élèves</h2>
      <span class="counts"><span class="chip good">${nP} présent${nP > 1 ? "s" : ""}</span><span class="chip bad">${nA} absent${nA > 1 ? "s" : ""}</span>${kids.length - nP - nA ? `<span class="chip ghost">${kids.length - nP - nA} à marquer</span>` : ""}</span></div>
    ${kids.length ? `
      <div class="row"><button class="btn small" data-act="all-p">Tous présents</button><button class="btn small ghost" data-act="all-a">Tous absents</button></div>
      <ul class="kids">${kids.map(k => `
        <li class="kid"><span class="avatar ${k.sexe === "M" ? "m" : "f"}">${esc((k.prenom || "?")[0])}</span><div class="name"><b>${esc(kidName(k))}</b><span>${esc(k.niveau || "")}${k.ecole ? " · " + esc(k.ecole) : ""}</span></div>
          <div class="seg" role="group" aria-label="${esc(kidName(k))}">
            <button data-act="kid" data-id="${esc(k.id)}" data-v="P" class="${d.eleves[k.id] === "P" ? "on-p" : ""}" aria-pressed="${d.eleves[k.id] === "P"}">Présent</button>
            <button data-act="kid" data-id="${esc(k.id)}" data-v="A" class="${d.eleves[k.id] === "A" ? "on-a" : ""}" aria-pressed="${d.eleves[k.id] === "A"}">Absent</button>
          </div></li>`).join("")}</ul>`
      : `<p class="hint">Aucun élève dans le groupe.</p><div><button class="btn" data-act="tab" data-v="eleves">Ajouter des élèves</button></div>`}
  </div>

  <div class="savebar">
    <span class="state ${dirty ? "dirty" : ""}">${dirty ? "Modifications non enregistrées" : saved ? "Enregistré le " + esc(fmtStamp(saved.majLe)) : "Rien d'enregistré pour cette semaine"}</span>
    <button class="btn primary" data-act="s-save">Enregistrer la semaine</button>
  </div>`;
}
function editSeance(fn) { const { d, k } = seanceDraft(S.me, S.week); fn(d); S.drafts[k] = d; render(); }
async function saveSeance() {
  const { d, k } = seanceDraft(S.me, S.week);
  if (d.present == null) return toast("Indiquez d'abord si le cours a été donné.", false);
  if (d.present) {
    const a = toMin(d.arrivee), b = toMin(d.depart);
    if (a == null || b == null) return toast("Renseignez l'heure d'arrivée et l'heure de départ.", false);
    if (b <= a) return toast("L'heure de départ doit être après l'heure d'arrivée.", false);
  }
  const w = S.week;
  const ok = await act(() => Api.saveSeance({ enseignantId: S.me, semaine: w, present: !!d.present, dateCours: d.dateCours, arrivee: d.arrivee, depart: d.depart, motif: d.motif, eleves: d.eleves }), "Semaine " + weekLabel(w) + " enregistrée.");
  if (ok) { delete S.drafts[k]; render(); }
}

/* ---------- Écran : Moyennes ---------- */
function viewNotes() {
  const nt = needTeacher(); if (nt) return nt;
  S.mois = S.mois || defaultMois(); S.trim = S.trim || defaultTrim();
  const kids = enfOf(S.me);
  const prim = kids.filter(k => cycleOf(k.niveau) === "primaire"), sec = kids.filter(k => cycleOf(k.niveau) === "secondaire");
  if (!kids.length) return `<div class="card empty"><h2>Aucun élève dans le groupe</h2><p class="hint">Ajoutez d'abord les élèves pour saisir leurs moyennes.</p><button class="btn" data-act="tab" data-v="eleves">Ajouter des élèves</button></div>`;
  const block = (title, sub, list, periode, opts, act, lab) => {
    if (!list.length) return "";
    const dk = "n:" + S.me + ":" + periode, dr = S.drafts[dk] || {};
    const all = opts(); const prevP = all[all.indexOf(periode) - 1];
    return `<div class="card">
      <div class="card-head"><div><h2>${title}</h2><p class="hint">${sub}</p></div>
        <div class="field compact"><label for="${act}">Période</label><select id="${act}" data-act="${act}">${all.map(p => `<option value="${p}" ${p === periode ? "selected" : ""}>${lab(p)}</option>`).join("")}</select></div></div>
      <ul class="kids">${list.map(k => {
        const saved = S.notes[noteKey(k.id, periode)], prev = prevP && S.notes[noteKey(k.id, prevP)];
        const val = dr[k.id] !== undefined ? dr[k.id] : saved ? String(saved.moyenne).replace(".", ",") : "";
        const num = parseFloat(String(val).replace(",", "."));
        const dlt = prev && !isNaN(num) ? num - prev.moyenne : null;
        return `<li class="kid note"><span class="avatar ${k.sexe === "M" ? "m" : "f"}">${esc((k.prenom || "?")[0])}</span><div class="name"><b>${esc(kidName(k))}</b><span>${esc(k.niveau)}${prev ? " · avant : " + fmtN(prev.moyenne, 2) : ""}</span></div>
          <div class="note-box"><input class="note-in" type="text" inputmode="decimal" id="n-${esc(k.id)}" aria-label="Moyenne de ${esc(kidName(k))}" data-note="${esc(k.id)}" data-per="${periode}" value="${esc(val)}" placeholder="—"><span class="bareme">/${baremeOf(k.niveau)}</span></div>
          <span class="delta ${dlt > 0 ? "up" : dlt < 0 ? "down" : ""}">${dlt == null ? "" : (dlt > 0 ? "▲ +" : dlt < 0 ? "▼ " : "= ") + fmtN(dlt, 2)}</span></li>`;
      }).join("")}</ul>
      <div class="savebar inline"><span class="state ${S.drafts[dk] ? "dirty" : ""}">${S.drafts[dk] ? "Modifications non enregistrées" : "Laissez vide si la moyenne n'est pas encore connue."}</span><button class="btn primary" data-act="n-save" data-v="${periode}">Enregistrer</button></div>
    </div>`;
  };
  return block("Primaire", "Moyenne mensuelle de composition, sur 10", prim, S.mois, moisAnnee, "mois", moisLabel) +
         block("Collège & lycée", "Moyenne du bulletin trimestriel, sur 20", sec, S.trim, trimestres, "trim", trimLabel);
}
async function saveNotes(periode) {
  const dk = "n:" + S.me + ":" + periode, dr = S.drafts[dk];
  if (!dr) return toast("Aucun changement à enregistrer.");
  const items = [], errs = [];
  for (const [kid, raw] of Object.entries(dr)) {
    const k = S.enf[kid]; if (!k) continue;
    const s = String(raw).trim().replace(",", ".");
    if (s === "") { items.push({ enfantId: kid, moyenne: null }); continue; }
    const v = Number(s), b = baremeOf(k.niveau);
    if (!isFinite(v) || v < 0 || v > b) { errs.push(kidName(k) + " : entre 0 et " + b); continue; }
    items.push({ enfantId: kid, moyenne: v });
  }
  if (errs.length) return toast("Moyenne hors barème — " + errs.join(" · "), false);
  const ok = await act(() => Api.saveNotes(periode, items), items.length + " moyenne" + (items.length > 1 ? "s enregistrées." : " enregistrée."));
  if (ok) { delete S.drafts[dk]; render(); }
}

/* ---------- Écran : Élèves ---------- */
function viewEleves() {
  const nt = needTeacher(); if (nt) return nt;
  const all = enfOf(S.me, true), ed = S.editEnf ? S.enf[S.editEnf] || {} : {};
  const opt = (v, sel) => `<option ${v === sel ? "selected" : ""}>${v}</option>`;
  const nAct = all.filter(k => k.actif !== false).length;
  return `<div class="card">
    <h2>${S.editEnf ? "Modifier un élève" : "Ajouter un élève"}</h2>
    <form class="form-grid" data-form="enf">
      <div class="field"><label for="k-prenom">Prénom</label><input type="text" id="k-prenom" name="prenom" required value="${esc(ed.prenom)}"></div>
      <div class="field"><label for="k-nom">Nom</label><input type="text" id="k-nom" name="nom" required value="${esc(ed.nom)}"></div>
      <div class="field"><label for="k-sexe">Sexe</label><select id="k-sexe" name="sexe">${opt("F", ed.sexe)}${opt("M", ed.sexe)}</select></div>
      <div class="field"><label for="k-niv">Classe</label><select id="k-niv" name="niveau"><optgroup label="Primaire (/10 par mois)">${PRIMAIRE.map(v => opt(v, ed.niveau)).join("")}</optgroup><optgroup label="Secondaire (/20 par trimestre)">${SECONDAIRE.map(v => opt(v, ed.niveau)).join("")}</optgroup></select></div>
      <div class="field wide"><label for="k-ecole">École fréquentée</label><input type="text" id="k-ecole" name="ecole" value="${esc(ed.ecole)}" placeholder="EPP Abobo Gare 2"></div>
      <div class="form-actions"><button class="btn primary" type="submit">${S.editEnf ? "Enregistrer" : "Ajouter"}</button>${S.editEnf ? `<button class="btn ghost" type="button" data-act="enf-cancel">Annuler</button>` : ""}</div>
    </form>
  </div>
  <div class="card">
    <div class="card-head"><h2>Le groupe</h2><span class="chip neutral">${nAct} élève${nAct > 1 ? "s" : ""}</span></div>
    ${all.length ? `<ul class="kids">${all.map(k => `<li class="kid ${k.actif === false ? "off" : ""}"><span class="avatar ${k.sexe === "M" ? "m" : "f"}">${esc((k.prenom || "?")[0])}</span><div class="name"><b>${esc(kidName(k))}</b><span>${esc(k.niveau)}${k.ecole ? " · " + esc(k.ecole) : ""}</span></div>
      <div class="row tight">${k.actif === false ? `<span class="chip ghost">Ne vient plus</span><button class="btn small" data-act="enf-actif" data-id="${esc(k.id)}" data-v="1">Réactiver</button>` : `<button class="btn small" data-act="enf-edit" data-id="${esc(k.id)}">Modifier</button><button class="btn small ghost" data-act="enf-actif" data-id="${esc(k.id)}" data-v="0">Ne vient plus</button>`}</div>
    </li>`).join("")}</ul><p class="hint small">« Ne vient plus » retire l'élève des listes sans effacer son historique.</p>` : `<p class="hint">Aucun élève pour l'instant.</p>`}
  </div>`;
}
async function saveEnf(form) {
  const f = Object.fromEntries(new FormData(form));
  const prenom = (f.prenom || "").trim(), nom = (f.nom || "").trim();
  if (!prenom || !nom) return toast("Le prénom et le nom sont obligatoires.", false);
  const editing = S.editEnf;
  const ok = await act(() => Api.saveEleve({ id: editing || "", enseignantId: S.me, prenom, nom, sexe: f.sexe, niveau: f.niveau, ecole: (f.ecole || "").trim() }),
    prenom + " " + nom + (editing ? " a été mis à jour." : " a été ajouté au groupe."));
  if (ok) { S.editEnf = null; render(); $("#k-prenom")?.focus(); }
}

/* ---------- Écran : Mon compte ---------- */
function viewCompte() {
  return `<div class="card narrow">
    <div class="profile"><span class="avatar big">${esc((S.user.nom || "?")[0])}</span><div><h2>${esc(S.user.nom)}</h2><p class="hint">Profil <b>${esc(S.user.profil)}</b>${S.isAdmin ? " · Administrateur" : " · Enseignant"}</p></div></div>
  </div>
  <div class="card narrow" id="install-card" hidden></div>
  <div class="card narrow">
    <h2>Changer mon mot de passe</h2>
    <form data-form="pw" class="stack">
      <div class="field"><label for="p-old">Mot de passe actuel</label><input type="password" id="p-old" name="ancien" autocomplete="current-password" required></div>
      <div class="field"><label for="p-new">Nouveau mot de passe (6 caractères minimum)</label><input type="password" id="p-new" name="nouveau" autocomplete="new-password" minlength="6" required></div>
      <div class="field"><label for="p-new2">Confirmer</label><input type="password" id="p-new2" name="nouveau2" autocomplete="new-password" minlength="6" required></div>
      <div><button class="btn primary" type="submit">Changer le mot de passe</button></div>
    </form>
  </div>
  <div class="card narrow"><button class="btn danger-ghost" data-act="logout">Se déconnecter</button></div>`;
}

/* ---------- Écran : Gestion (administrateurs) ---------- */
const td = (label, html, cls = "") => `<td class="${cls}" data-label="${label}">${html}</td>`;
const adminList = () => Object.values(S.ens).filter(e => e.role === "admin").sort((a, b) => (a.nom || "").localeCompare(b.nom || "", "fr"));
function viewGestion() {
  const c = cfg(), ed = S.editEns ? S.ens[S.editEns] || {} : {};
  const self = S.editEns && S.editEns === S.user.id;
  const role = S.formRole || ed.role || "enseignant";
  const list = ensList(true), admins = adminList();
  const weeks = weeksBetween(c.debut, c.fin);
  if (!S.vacDraft) S.vacDraft = new Set(c.vacances);
  const actions = (e, isSelf) => e.actif === false
    ? `<span class="chip ghost">Désactivé</span> <button class="btn small" data-act="ens-actif" data-id="${esc(e.id)}" data-v="1">Réactiver</button>`
    : `<button class="btn small" data-act="ens-edit" data-id="${esc(e.id)}">Modifier</button>${isSelf ? ` <span class="chip neutral">Vous</span>` : ` <button class="btn small ghost" data-act="ens-actif" data-id="${esc(e.id)}" data-v="0">Désactiver</button>`}`;
  return `<div class="card" id="compte-form">
    <div class="card-head"><h2>${S.editEns ? "Modifier le compte de " + esc(ed.nom) : "Créer un compte"}</h2>${S.editEns ? `<span class="chip ${ed.role === "admin" ? "neutral" : "good"}">${ed.role === "admin" ? "Administrateur" : "Enseignant"}</span>` : ""}</div>
    <form class="form-grid" data-form="ens">
      <div class="field"><label for="e-role">Type de compte</label><select id="e-role" name="role" data-act="role" ${self ? "disabled" : ""}>
        <option value="enseignant" ${role !== "admin" ? "selected" : ""}>Enseignant (étudiant)</option>
        <option value="admin" ${role === "admin" ? "selected" : ""}>Administrateur</option></select></div>
      <div class="field"><label for="e-nom">Nom complet</label><input type="text" id="e-nom" name="nom" required value="${esc(ed.nom)}"></div>
      <div class="field"><label for="e-profil">Profil de connexion</label><input type="text" id="e-profil" name="profil" ${S.editEns ? "readonly" : "required"} autocapitalize="none" spellcheck="false" pattern="[a-z0-9._\\-]{3,30}" value="${esc(ed.profil)}" placeholder="aya.konan"></div>
      <div class="field"><label for="e-mdp">${S.editEns ? "Nouveau mot de passe (facultatif)" : "Mot de passe de départ"}</label><input type="text" id="e-mdp" name="mdp" autocomplete="off" ${S.editEns ? "" : "required"} minlength="6" placeholder="6 caractères minimum"></div>
      <div class="field"><label for="e-tel">Téléphone</label><input type="tel" id="e-tel" name="telephone" value="${esc(ed.telephone)}" placeholder="07 00 00 00 00"></div>
      <div class="teach-fields" ${role === "admin" ? "hidden" : ""}>
        <div class="field"><label for="e-site">Quartier / site</label><input type="text" id="e-site" name="site" list="sites-dl" value="${esc(ed.site)}" placeholder="Abobo Avocatier"><datalist id="sites-dl">${sites().map(s => `<option value="${esc(s)}">`).join("")}</datalist></div>
        <div class="field"><label for="e-jour">Jour du cours</label><select id="e-jour" name="jour">${JOURS.map((j, i) => `<option value="${i}" ${(Number.isInteger(ed.jour) ? ed.jour : 5) === i ? "selected" : ""}>${j}</option>`).join("")}</select></div>
        <div class="field"><label for="e-hd">Début prévu</label><input type="time" id="e-hd" name="heureDebut" value="${esc(ed.heureDebut || "09:00")}"></div>
        <div class="field"><label for="e-hf">Fin prévue</label><input type="time" id="e-hf" name="heureFin" value="${esc(ed.heureFin || "11:00")}"></div>
        <div class="field"><label for="e-deb">Début de sa mission</label><input type="date" id="e-deb" name="debut" value="${esc(ed.debut || c.debut)}"></div>
      </div>
      <div class="form-actions"><button class="btn primary" type="submit">${S.editEns ? "Enregistrer" : "Créer le compte"}</button>${S.editEns ? `<button class="btn ghost" type="button" data-act="ens-cancel">Annuler</button>` : ""}</div>
    </form>
    <p class="hint small"><span class="role-help">${role === "admin"
      ? "Un administrateur voit tous les groupes, l'analyse, et gère les comptes et le calendrier. Il n'a pas de groupe d'élèves."
      : "Un enseignant ne voit que son groupe : son pointage, ses élèves et leurs moyennes."}</span> Profil : minuscules sans accents, chiffres, point ou tiret.</p>
  </div>

  <div class="card">
    <div class="card-head"><h2>Enseignants</h2><span class="chip good">${list.filter(e => e.actif !== false).length} actifs</span></div>
    ${list.length ? `<div class="tablewrap"><table class="resp"><thead><tr><th>Nom</th><th>Profil</th><th>Site</th><th>Cours</th><th class="n">Élèves</th><th></th></tr></thead><tbody>
      ${list.map(e => `<tr class="${e.actif === false ? "off" : ""}">
        ${td("Nom", `<b>${esc(e.nom)}</b>${e.telephone ? `<br><span class="hint small">${esc(e.telephone)}</span>` : ""}`, "primary-cell")}${td("Profil", `<code>${esc(e.profil)}</code>`)}${td("Site", esc(e.site || "–"))}
        ${td("Cours", `${esc(JOURS[e.jour] || "")} ${esc(e.heureDebut || "")}–${esc(e.heureFin || "")}`)}${td("Élèves", enfOf(e.id).length, "n")}
        ${td("", actions(e, false), "actions")}</tr>`).join("")}
    </tbody></table></div><p class="hint small">Un compte désactivé ne peut plus se connecter ; son historique reste dans l'analyse.</p>` : `<p class="hint">Aucun enseignant. Créez un premier compte ci-dessus.</p>`}
  </div>

  <div class="card">
    <div class="card-head"><h2>Administrateurs</h2><span class="chip neutral">${admins.filter(e => e.actif !== false).length} actif${admins.filter(e => e.actif !== false).length > 1 ? "s" : ""}</span></div>
    <div class="tablewrap"><table class="resp"><thead><tr><th>Nom</th><th>Profil</th><th>Téléphone</th><th></th></tr></thead><tbody>
      ${admins.map(e => `<tr class="${e.actif === false ? "off" : ""}">${td("Nom", `<b>${esc(e.nom)}</b>`, "primary-cell")}${td("Profil", `<code>${esc(e.profil)}</code>`)}${td("Téléphone", esc(e.telephone || "–"))}${td("", actions(e, e.id === S.user.id), "actions")}</tr>`).join("")}
    </tbody></table></div>
    <p class="hint small">Il reste toujours au moins un administrateur actif : le dernier ne peut être ni désactivé ni changé en enseignant.</p>
  </div>

  <div class="card">
    <h2>Calendrier de l'année</h2>
    <form data-form="cfg" class="stack">
      <div class="grid3">
        <div class="field"><label for="c-deb">Début de l'année</label><input type="date" id="c-deb" name="debut" value="${c.debut}"></div>
        <div class="field"><label for="c-fin">Fin de l'année</label><input type="date" id="c-fin" name="fin" value="${c.fin}"></div>
        <div class="field"><label for="c-tol">Retard toléré (min)</label><input type="number" id="c-tol" name="tolerance" min="0" max="120" value="${c.tolerance}"></div>
      </div>
      <div><h3>Semaines sans cours</h3><p class="hint small">Vacances, examens… Elles ne compteront pas comme « non pointées ».</p></div>
      <div class="vac">${weeks.map(x => `<label class="${S.vacDraft.has(x) ? "on" : ""}"><input type="checkbox" data-act="vac" data-v="${x}" ${S.vacDraft.has(x) ? "checked" : ""}> ${fmtD(x)}</label>`).join("")}</div>
      <div><button class="btn primary" type="submit">Enregistrer le calendrier</button></div>
    </form>
  </div>`;
}
async function saveEns(form) {
  const f = Object.fromEntries(new FormData(form));
  const editing = S.editEns, ed = editing ? S.ens[editing] : null;
  const role = f.role || (ed && ed.role) || "enseignant";
  const nom = (f.nom || "").trim(), profil = (f.profil || "").trim().toLowerCase(), mdp = f.mdp || "";
  if (!nom) return toast("Le nom est obligatoire.", false);
  if (!editing && !/^[a-z0-9._-]{3,30}$/.test(profil)) return toast("Profil invalide : 3 à 30 caractères, lettres minuscules sans accents, chiffres, point ou tiret (ex. aya.konan).", false);
  if ((!editing || mdp) && mdp.length < 6) return toast("Le mot de passe doit faire au moins 6 caractères.", false);
  const label = role === "admin" ? "administrateur" : "enseignant";
  const ok = await act(() => Api.saveEns({ id: editing || "", role, nom, profil, mdp, telephone: f.telephone, site: (f.site || "").trim(), jour: Number(f.jour ?? 5), heureDebut: f.heureDebut, heureFin: f.heureFin, debut: f.debut }),
    editing ? nom + " a été mis à jour." + (mdp ? " Nouveau mot de passe actif." : "") : "Compte " + label + " créé : profil « " + profil + " ».");
  if (ok) { S.editEns = null; S.formRole = null; render(); }
}

/* ---------- Écran : Analyse (administrateurs) ---------- */
function computeStats() {
  const c = cfg(), cur = curMonday();
  const from = S.f.from || iso(mondayOf(parseISO(c.debut)));
  const to = S.f.to || cur;
  const ensF = ensList(true).filter(e => (!S.f.site || e.site === S.f.site) && (!S.f.ens || e.id === S.f.ens));
  const ensIds = new Set(ensF.map(e => e.id));
  const weeks = weeksBetween(from, to < cur ? to : cur);
  const vac = new Set(c.vacances);
  const fromM = parseISO(from), toM = parseISO(to);
  const mFrom = fromM.getUTCFullYear() * 12 + fromM.getUTCMonth(), mTo = toM.getUTCFullYear() * 12 + toM.getUTCMonth();
  const w0 = weeks[0] || from, w1 = weeks[weeks.length - 1] || to;
  const seancesF = Object.values(S.seances).filter(s => ensIds.has(s.enseignantId) && s.semaine >= w0 && s.semaine <= w1);
  const notesF = Object.values(S.notes).filter(n => { const k = S.enf[n.enfantId]; if (!k || !ensIds.has(k.enseignantId)) return false; const [a, b] = periodRange(n.periode); return b >= mFrom && a <= mTo; });
  const tol = c.tolerance;
  const kids = Object.values(S.enf).filter(k => ensIds.has(k.enseignantId));
  const kidStats = kids.map(k => {
    let P = 0, A = 0; const seq = [];
    seancesF.filter(s => s.enseignantId === k.enseignantId).sort((a, b) => a.semaine.localeCompare(b.semaine)).forEach(s => { const v = s.eleves && s.eleves[k.id]; if (v === "P") P++; if (v === "A") A++; if (v) seq.push(v); });
    const ns = notesF.filter(n => n.enfantId === k.id).sort((a, b) => periodPos(a.periode) - periodPos(b.periode)).map(n => ({ p: n.periode, v: n.moyenne * 20 / (n.bareme || baremeOf(k.niveau)), raw: n.moyenne, b: n.bareme }));
    const first = ns[0], last = ns[ns.length - 1];
    return { k, P, A, ass: pct(P, P + A), first: first ? first.v : null, last: last ? last.v : null, prog: ns.length >= 2 ? last.v - first.v : null, nNotes: ns.length, notes: ns, abs3: seq.length >= 3 && seq.slice(-3).every(v => v === "A") };
  });
  const ensStats = ensF.map(e => {
    const startW = iso(mondayOf(parseISO(e.debut || c.debut)));
    const exp = weeks.filter(w => w >= startW && !vac.has(w) && (w < cur || S.seances[seanceKey(e.id, w)]));
    const ss = exp.map(w => S.seances[seanceKey(e.id, w)]).filter(Boolean);
    const pres = ss.filter(s => s.present);
    const hd = toMin(e.heureDebut);
    const late = pres.filter(s => hd != null && toMin(s.arrivee) != null && toMin(s.arrivee) - hd > tol);
    const durs = pres.map(s => toMin(s.depart) - toMin(s.arrivee)).filter(x => x > 0);
    const myKids = kidStats.filter(x => x.k.enseignantId === e.id && x.k.actif !== false);
    const P = myKids.reduce((s, x) => s + x.P, 0), A = myKids.reduce((s, x) => s + x.A, 0);
    const lasts = myKids.map(x => x.last).filter(v => v != null), progs = myKids.map(x => x.prog).filter(v => v != null);
    const missing = exp.filter(w => !S.seances[seanceKey(e.id, w)] && w < cur);
    return { e, attendues: exp.length, pointees: ss.length, presentes: pres.length, retards: late.length, pointage: pct(ss.length, exp.length), presence: pct(pres.length, ss.length), ponct: pct(pres.length - late.length, pres.length), duree: avg(durs), nKids: myKids.length, ass: pct(P, P + A), moy: avg(lasts), prog: avg(progs), missing };
  });
  const weekly = weeks.filter(w => !vac.has(w)).map(w => {
    let P = 0, A = 0, held = 0, pointed = 0;
    ensF.forEach(e => { const s = S.seances[seanceKey(e.id, w)]; if (!s) return; pointed++; if (s.present) held++; Object.values(s.eleves || {}).forEach(v => { if (v === "P") P++; if (v === "A") A++; }); });
    return { w, P, A, v: pct(P, P + A), held, pointed };
  });
  const byPer = {};
  notesF.forEach(n => { const k = S.enf[n.enfantId]; const cyc = cycleOf(k.niveau); const key = cyc + "|" + n.periode; (byPer[key] = byPer[key] || { cyc, p: n.periode, vals: [] }).vals.push(n.moyenne * 20 / (n.bareme || baremeOf(k.niveau))); });
  const moySeries = { primaire: [], secondaire: [] };
  Object.values(byPer).forEach(o => moySeries[o.cyc].push({ p: o.p, pos: periodPos(o.p), v: avg(o.vals), n: o.vals.length }));
  Object.values(moySeries).forEach(a => a.sort((x, y) => x.pos - y.pos));
  const allPres = seancesF.filter(s => s.present);
  const totExp = ensStats.reduce((s, x) => s + x.attendues, 0), totPt = ensStats.reduce((s, x) => s + x.pointees, 0), totPr = ensStats.reduce((s, x) => s + x.presentes, 0), totLate = ensStats.reduce((s, x) => s + x.retards, 0);
  const activeKids = kidStats.filter(x => x.k.actif !== false);
  const kP = activeKids.reduce((s, x) => s + x.P, 0), kA = activeKids.reduce((s, x) => s + x.A, 0);
  const progs = activeKids.map(x => x.prog).filter(v => v != null);
  return {
    from, to, weeks, ensStats, kidStats, weekly, moySeries, mFrom, mTo,
    kpi: { pointage: pct(totPt, totExp), totPt, totExp, presence: pct(totPr, totPt), totPr, ponct: pct(totPr - totLate, totPr), totLate,
      duree: avg(allPres.map(s => toMin(s.depart) - toMin(s.arrivee)).filter(x => x > 0)),
      ass: pct(kP, kP + kA), kP, kA, nKids: activeKids.length, prog: avg(progs), nProg: progs.length, nUp: progs.filter(v => v > 0).length }
  };
}
function statusChip(v, good, warn) {
  if (v == null) return `<span class="chip ghost">–</span>`;
  const cls = v >= good ? "good" : v >= warn ? "warn" : "bad";
  const ic = cls === "good" ? "✓" : cls === "warn" ? "!" : "✕";
  return `<span class="chip ${cls}"><span aria-hidden="true">${ic}</span> ${v} %</span>`;
}
const progHtml = v => v == null ? "–" : `<span class="${v > 0 ? "up" : v < 0 ? "down" : ""}">${v > 0 ? "▲ +" : v < 0 ? "▼ " : "= "}${fmtN(v)}</span>`;
function viewAnalyse() {
  if (!ensList(true).length) return needTeacher() || "";
  const st = computeStats(), K = st.kpi, c = cfg();
  const weekOpts = weeksBetween(c.debut, c.fin);
  const filt = `<div class="card filters">
    <div class="field"><label for="f-site">Site</label><select id="f-site" data-flt="site"><option value="">Tous les sites</option>${sites().map(s => `<option ${s === S.f.site ? "selected" : ""}>${esc(s)}</option>`).join("")}</select></div>
    <div class="field"><label for="f-ens">Enseignant</label><select id="f-ens" data-flt="ens"><option value="">Tous</option>${ensList(true).filter(e => !S.f.site || e.site === S.f.site).map(e => `<option value="${esc(e.id)}" ${e.id === S.f.ens ? "selected" : ""}>${esc(e.nom)}</option>`).join("")}</select></div>
    <div class="field"><label for="f-from">Du</label><select id="f-from" data-flt="from">${weekOpts.map(w => `<option value="${w}" ${w === st.from ? "selected" : ""}>semaine du ${fmtD(w)}</option>`).join("")}</select></div>
    <div class="field"><label for="f-to">Au</label><select id="f-to" data-flt="to">${weekOpts.map(w => `<option value="${w}" ${w === iso(mondayOf(parseISO(st.to))) ? "selected" : ""}>semaine du ${fmtD(w)}</option>`).join("")}</select></div>
  </div>`;
  const kpi = (k, v, s) => `<div class="kpi"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
  const kpis = `<div class="kpis">
    ${kpi("Semaines pointées", fmtPct(K.pointage), `${K.totPt} sur ${K.totExp} attendues`)}
    ${kpi("Cours donnés", fmtPct(K.presence), `${K.totPr} séances sur ${K.totPt} pointées`)}
    ${kpi("Arrivées à l'heure", fmtPct(K.ponct), `${K.totLate} retard${K.totLate > 1 ? "s" : ""} de plus de ${c.tolerance} min`)}
    ${kpi("Durée moyenne", fmtDur(K.duree), "départ − arrivée")}
    ${kpi("Assiduité des élèves", fmtPct(K.ass), `${K.kP} présences sur ${K.kP + K.kA} · ${K.nKids} élèves`)}
    ${kpi("Progression moyenne", K.prog == null ? "–" : (K.prog > 0 ? "+" : "") + fmtN(K.prog), K.nProg ? `points /20 · ${K.nUp} élève${K.nUp > 1 ? "s" : ""} sur ${K.nProg} en hausse` : "2 moyennes par élève nécessaires")}
  </div>`;
  const al = [];
  st.ensStats.filter(x => x.e.actif !== false && x.missing.length).forEach(x => al.push(`<li><span class="chip warn">! À relancer</span><span><b>${esc(x.e.nom)}</b> n'a pas pointé ${x.missing.length} semaine${x.missing.length > 1 ? "s" : ""} (${x.missing.slice(-4).map(fmtD).join(", ")}${x.missing.length > 4 ? "…" : ""})</span></li>`));
  st.kidStats.filter(x => x.k.actif !== false && x.abs3).forEach(x => al.push(`<li><span class="chip bad">✕ Absences</span><span><b>${esc(kidName(x.k))}</b> (groupe de ${esc(S.ens[x.k.enseignantId]?.nom || "?")}) absent aux 3 dernières séances</span></li>`));
  st.kidStats.filter(x => x.k.actif !== false && x.prog != null && x.prog <= -2).forEach(x => al.push(`<li><span class="chip bad">▼ En baisse</span><span><b>${esc(kidName(x.k))}</b> a perdu ${fmtN(-x.prog)} points sur 20 (${fmtN(x.first)} → ${fmtN(x.last)})</span></li>`));
  const alerts = `<div class="card"><h2>À surveiller</h2>${al.length ? `<ul class="alerts">${al.slice(0, 14).join("")}</ul>${al.length > 14 ? `<p class="hint">et ${al.length - 14} autres…</p>` : ""}` : `<p class="hint">Rien à signaler sur la période.</p>`}</div>`;
  const charts = `<div class="grid2">
    <div class="card chart"><h3>Assiduité des élèves par semaine</h3>${barChart(st.weekly)}</div>
    <div class="card chart"><h3>Moyenne à l'école (ramenée sur 20)</h3>
      <div class="legend"><span><i style="background:var(--series-1)"></i>Primaire, par mois</span><span><i style="background:var(--series-2)"></i>Collège & lycée, par trimestre</span></div>
      ${lineChart(st.moySeries, st.mFrom, st.mTo)}</div>
  </div>
  <div class="card chart"><h3>Les élèves les plus assidus progressent-ils davantage ?</h3><div class="chart-narrow">${scatter(st.kidStats.filter(x => x.ass != null && x.prog != null))}</div></div>`;
  const sortRows = (rows, s, get) => rows.slice().sort((a, b) => { const x = get(a, s.k), y = get(b, s.k); if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (typeof x === "string" ? x.localeCompare(y, "fr") : x - y) * s.d; });
  const th = (tbl, k, l, n) => { const s = tbl === "ens" ? S.sortEns : S.sortEnf; return `<th class="${n ? "n" : ""} sortable" data-sort="${tbl}" data-k="${k}" aria-sort="${s.k === k ? (s.d > 0 ? "ascending" : "descending") : "none"}">${l}${s.k === k ? (s.d > 0 ? " ↑" : " ↓") : ""}</th>`; };
  const getE = (x, k) => k === "nom" ? x.e.nom : k === "site" ? (x.e.site || "") : x[k];
  const ensRows = sortRows(st.ensStats, S.sortEns, getE).map(x => `<tr>
    ${td("Enseignant", `<b>${esc(x.e.nom)}</b>${x.e.actif === false ? ` <span class="chip ghost">désactivé</span>` : ""}`, "primary-cell")}${td("Site", esc(x.e.site || "–"))}${td("Élèves", x.nKids, "n")}
    ${td("Semaines pointées", `${x.pointees}/${x.attendues}`, "n")}${td("Pointage", statusChip(x.pointage, 90, 70), "n")}${td("Cours donnés", statusChip(x.presence, 90, 75), "n")}
    ${td("À l'heure", statusChip(x.ponct, 85, 65), "n")}${td("Durée moyenne", fmtDur(x.duree), "n")}${td("Assiduité élèves", statusChip(x.ass, 80, 60), "n")}
    ${td("Moyenne /20", fmtN(x.moy), "n")}${td("Progression", progHtml(x.prog), "n")}</tr>`).join("");
  const msort = (tbl, opts) => { const st2 = tbl === "ens" ? S.sortEns : S.sortEnf; return `<label class="mobile-sort">Trier par <select data-sortsel="${tbl}">${opts.map(([k, l]) => `<option value="${k}" ${st2.k === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>`; };
  const ensTable = `<div class="card"><h2>Par enseignant</h2>${msort("ens", [["nom", "Nom"], ["pointage", "Pointage"], ["presence", "Cours donnés"], ["ponct", "Ponctualité"], ["ass", "Assiduité des élèves"], ["moy", "Moyenne"], ["prog", "Progression"]])}<div class="tablewrap"><table class="resp"><thead><tr>
    ${th("ens", "nom", "Enseignant")}${th("ens", "site", "Site")}${th("ens", "nKids", "Élèves", 1)}${th("ens", "pointees", "Pointées", 1)}${th("ens", "pointage", "Pointage", 1)}${th("ens", "presence", "Cours donnés", 1)}${th("ens", "ponct", "À l'heure", 1)}${th("ens", "duree", "Durée moy.", 1)}${th("ens", "ass", "Assiduité élèves", 1)}${th("ens", "moy", "Moy. /20", 1)}${th("ens", "prog", "Progression", 1)}
    </tr></thead><tbody>${ensRows || `<tr><td colspan="11" class="hint">Aucun enseignant pour ces filtres.</td></tr>`}</tbody></table></div>
    <p class="hint small">Pointage : semaines saisies sur semaines attendues (hors semaines sans cours). Moyenne : dernière moyenne connue de chaque élève, ramenée sur 20.</p></div>`;
  const q = S.q.trim().toLowerCase();
  const getK = (x, k) => k === "nom" ? kidName(x.k) : k === "niveau" ? PRIMAIRE.concat(SECONDAIRE).indexOf(x.k.niveau) : k === "ens" ? (S.ens[x.k.enseignantId]?.nom || "") : x[k];
  const kidRows = sortRows(st.kidStats.filter(x => x.k.actif !== false && (!q || kidName(x.k).toLowerCase().includes(q) || (x.k.ecole || "").toLowerCase().includes(q))), S.sortEnf, getK).map(x => `<tr>
    ${td("Élève", `<b>${esc(kidName(x.k))}</b>`, "primary-cell")}${td("Classe", esc(x.k.niveau))}${td("École", esc(x.k.ecole || "–"))}${td("Enseignant", esc(S.ens[x.k.enseignantId]?.nom || "–"))}
    ${td("Assiduité", statusChip(x.ass, 80, 60), "n")}${td("Présences", `${x.P}/${x.P + x.A}`, "n")}
    ${td("Moyennes", (x.notes.map(n => `<span title="${esc(n.p.includes("-T") ? trimLabel(n.p) : moisLabel(n.p))}">${fmtN(n.raw, 2)}</span>`).join(" → ") || "–") + (x.notes.length ? ` <span class="hint">/${x.notes[0].b}</span>` : ""), "n")}
    ${td("Dernière /20", fmtN(x.last), "n")}${td("Progression", progHtml(x.prog), "n")}</tr>`).join("");
  const kidTable = `<div class="card"><div class="card-head"><h2>Par élève</h2><div class="field compact search"><label for="q">Rechercher</label><input type="search" id="q" data-q value="${esc(S.q)}" placeholder="Élève ou école"></div></div>
    ${msort("enf", [["nom", "Nom"], ["ass", "Assiduité"], ["last", "Dernière moyenne"], ["prog", "Progression"]])}
    <div class="tablewrap"><table class="resp"><thead><tr>
    ${th("enf", "nom", "Élève")}${th("enf", "niveau", "Classe")}<th>École</th>${th("enf", "ens", "Enseignant")}${th("enf", "ass", "Assiduité", 1)}<th class="n">Présences</th><th class="n">Moyennes successives</th>${th("enf", "last", "Dernière /20", 1)}${th("enf", "prog", "Progression", 1)}
    </tr></thead><tbody>${kidRows || `<tr><td colspan="9" class="hint">Aucun élève.</td></tr>`}</tbody></table></div></div>`;
  return filt + kpis + alerts + charts + ensTable + kidTable;
}

/* ---------- Événements ---------- */
document.addEventListener("click", async e => {
  const sortTh = e.target.closest("[data-sort]");
  if (sortTh) { const s = sortTh.dataset.sort === "ens" ? S.sortEns : S.sortEnf; const k = sortTh.dataset.k; if (s.k === k) s.d *= -1; else { s.k = k; s.d = ["nom", "site", "ens"].includes(k) ? 1 : -1; } return render(); }
  const b = e.target.closest("[data-act]"); if (!b || b.tagName === "SELECT" || b.tagName === "INPUT") return;
  const a = b.dataset.act, v = b.dataset.v, id = b.dataset.id;
  if (a === "tab") { S.tab = v; store.set("as_tab", v); window.scrollTo(0, 0); return render(); }
  if (a === "refresh") { if (S.busy) return; S.busy = true; render(); await reload(); S.busy = false; render(); return toast("Données à jour."); }
  if (a === "retry") { S.busy = true; render(); await reload(); S.busy = false; return render(); }
  if (a === "logout") return logout();
  if (a === "show-setup") { S.needsSetup = true; S.loginErr = ""; return render(); }
  if (a === "hide-setup") { S.needsSetup = false; S.loginErr = ""; return render(); }
  if (a === "demo-fill") { $("#l-profil").value = v; $("#l-mdp").value = "demo123"; return; }
  if (a === "pick-me") { S.me = v; store.set("as_me", v); return render(); }
  if (a === "week") { const n = iso(addDays(parseISO(S.week), 7 * Number(v))); if (n <= curMonday()) S.week = n; return render(); }
  if (a === "week-go") { S.week = v; return render(); }
  if (a === "s-present") return editSeance(d => { d.present = v === "1"; });
  if (a === "kid") return editSeance(d => { if (d.eleves[id] === v) delete d.eleves[id]; else d.eleves[id] = v; });
  if (a === "all-p" || a === "all-a") return editSeance(d => enfOf(S.me).forEach(k => d.eleves[k.id] = a === "all-p" ? "P" : "A"));
  if (a === "s-save") return saveSeance();
  if (a === "n-save") return saveNotes(v);
  if (a === "enf-edit") { S.editEnf = id; render(); window.scrollTo(0, 0); $("#k-prenom")?.focus(); return; }
  if (a === "enf-cancel") { S.editEnf = null; return render(); }
  if (a === "enf-actif") return act(() => Api.setEleveActif(id, v === "1"), v === "1" ? "Élève réactivé." : "Élève retiré des listes.");
  if (a === "ens-edit") { S.editEns = id; S.formRole = null; render(); window.scrollTo(0, 0); $("#e-nom")?.focus(); return; }
  if (a === "ens-cancel") { S.editEns = null; S.formRole = null; return render(); }
  if (a === "ens-actif") { if (v !== "1" && id === S.user.id) return toast("Vous ne pouvez pas désactiver votre propre compte.", false); return act(() => Api.setEnsActif(id, v === "1"), v === "1" ? "Compte réactivé." : "Compte désactivé : il ne peut plus se connecter."); }
});
document.addEventListener("change", e => {
  const t = e.target;
  if (t.dataset.act === "me") { S.me = t.value; store.set("as_me", t.value); return render(); }
  if (t.dataset.act === "role") {
    S.formRole = t.value;
    const box = $(".teach-fields"); if (box) box.hidden = t.value === "admin";
    const help = $(".role-help"); if (help) help.textContent = t.value === "admin"
      ? "Un administrateur voit tous les groupes, l'analyse, et gère les comptes et le calendrier. Il n'a pas de groupe d'élèves."
      : "Un enseignant ne voit que son groupe : son pointage, ses élèves et leurs moyennes.";
    return;
  }
  if (t.dataset.act === "mois") { S.mois = t.value; return render(); }
  if (t.dataset.act === "trim") { S.trim = t.value; return render(); }
  if (t.dataset.act === "vac") { t.checked ? S.vacDraft.add(t.dataset.v) : S.vacDraft.delete(t.dataset.v); t.parentElement.classList.toggle("on", t.checked); return; }
  if (t.dataset.sortsel) { const st2 = t.dataset.sortsel === "ens" ? S.sortEns : S.sortEnf; st2.k = t.value; st2.d = ["nom", "site", "ens"].includes(t.value) ? 1 : -1; return render(); }
  if (t.dataset.flt) {
    const k = t.dataset.flt;
    S.f[k] = t.value; if (k === "site") S.f.ens = "";
    if (k === "to") S.f.to = iso(addDays(parseISO(t.value), 6));
    return render();
  }
});
document.addEventListener("input", e => {
  const t = e.target;
  const markDirty = scope => { const st = (scope || document).querySelector(".savebar .state"); if (st) { st.textContent = "Modifications non enregistrées"; st.classList.add("dirty"); } };
  if (t.dataset.in) { const { d, k } = seanceDraft(S.me, S.week); d[t.dataset.in] = t.value; S.drafts[k] = d; return markDirty(); }
  if (t.dataset.note) { const dk = "n:" + S.me + ":" + t.dataset.per; (S.drafts[dk] = S.drafts[dk] || {})[t.dataset.note] = t.value; return markDirty(t.closest(".card")); }
  if (t.hasAttribute("data-q")) { S.q = t.value; clearTimeout(S.qT); S.qT = setTimeout(() => { const pos = t.selectionStart; render(); const q = $("#q"); if (q) { q.focus(); q.setSelectionRange(pos, pos); } }, 250); }
});
// La durée et le retard se recalculent quand on quitte un champ d'heure
document.addEventListener("focusout", e => {
  if (e.target.dataset && e.target.dataset.in && S.tab === "seance")
    setTimeout(() => { const a = document.activeElement; if (!a || !$("#app").contains(a) || !/INPUT|TEXTAREA/.test(a.tagName)) render(); }, 0);
});
document.addEventListener("submit", e => {
  e.preventDefault();
  const f = e.target.dataset.form;
  if (f === "login") return doLogin(e.target, false);
  if (f === "setup") return doLogin(e.target, true);
  if (f === "enf") return saveEnf(e.target);
  if (f === "ens") return saveEns(e.target);
  if (f === "pw") {
    const d = Object.fromEntries(new FormData(e.target));
    if (d.nouveau !== d.nouveau2) return toast("Les deux nouveaux mots de passe ne sont pas identiques.", false);
    return act(() => Api.changePw(S.user.profil, d.ancien, d.nouveau), "Mot de passe changé.").then(ok => { if (ok) e.target.reset(); });
  }
  if (f === "cfg") {
    const d = Object.fromEntries(new FormData(e.target));
    if (d.fin <= d.debut) return toast("La fin de l'année doit être après le début.", false);
    return act(() => Api.saveConfig({ debut: d.debut, fin: d.fin, tolerance: Number(d.tolerance) || 0, vacances: [...S.vacDraft].sort() }), "Calendrier enregistré.").then(ok => { if (ok) { S.vacDraft = null; render(); } });
  }
});

/* ---------- Démarrage ---------- */
const LOGO = `<svg viewBox="0 0 48 48" width="48" height="48" aria-hidden="true"><rect x="4" y="8" width="40" height="32" rx="6" fill="currentColor" opacity=".18"/><path d="M24 14c-4-3-10-3-14-1v22c4-2 10-2 14 1 4-3 10-3 14-1V13c-4-2-10-2-14 1z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M24 14v22" stroke="currentColor" stroke-width="2.4"/></svg>`;
(async function boot() {
  $("#brand-logo").innerHTML = LOGO;
  render();
  if (!Api) { S.booting = false; return render(); }
  try {
    if (await Api.session()) { S.booting = false; S.busy = true; render(); await reload(); S.busy = false; }
    else if (Api.mode === "supabase") S.needsSetup = await Api.needsSetup().catch(e => { S.setupErr = humanError(e); return false; });
  } catch (e) { S.loginErr = humanError(e); }
  S.booting = false; render();
})();
