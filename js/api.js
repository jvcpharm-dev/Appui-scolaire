/*
 * Accès aux données.
 * Deux moteurs avec les mêmes fonctions :
 *   - Supabase (production) quand js/config.js est rempli ;
 *   - Démo (données fictives en mémoire) sinon.
 */
"use strict";

const CONF = window.APPUI_CONFIG || {};
CONF.SUPABASE_KEY = CONF.SUPABASE_KEY || CONF.SUPABASE_ANON_KEY || "";   // ancien nom accepté
CONF.SUPABASE_URL = String(CONF.SUPABASE_URL || "").trim().replace(/\/+$/, "");
const DOMAINE = (CONF.PROFIL_DOMAINE || "appuiscolaire.app").trim();
const profilEmail = p => String(p || "").trim().toLowerCase() + "@" + DOMAINE;
const PROFIL_RE = /^[a-z0-9._-]{3,30}$/;

/* Traduit les erreurs techniques en messages compréhensibles */
function humanError(e) {
  const m = String((e && (e.message || e.error_description || e.msg)) || e || "");
  if (/Invalid login credentials/i.test(m)) return "Profil ou mot de passe incorrect.";
  if (/already registered|already been registered|already exists/i.test(m)) return "Ce profil est déjà utilisé.";
  if (/Email not confirmed/i.test(m)) return "Compte non confirmé : dans Supabase, désactivez « Confirm email » (voir le guide d'installation).";
  if (/email.*invalid|invalid.*email/i.test(m)) return "Supabase refuse l'identifiant généré. Changez PROFIL_DOMAINE dans js/config.js (voir le guide).";
  if (/Signups not allowed/i.test(m)) return "Les inscriptions sont désactivées dans Supabase : réactivez « Allow new users to sign up » (voir le guide).";
  if (/rate limit|too many/i.test(m)) return "Trop de tentatives. Patientez quelques minutes puis réessayez.";
  if (/Failed to fetch|NetworkError|network|Load failed/i.test(m)) return "Pas de connexion au serveur. Vérifiez votre connexion internet.";
  if (/row-level security|permission denied|Accès refusé/i.test(m)) return "Accès refusé : votre compte n'a pas le droit de faire cette modification.";
  if (/Password should be at least/i.test(m)) return "Le mot de passe doit faire au moins 6 caractères.";
  if (/duplicate key.*profil/i.test(m)) return "Ce profil est déjà utilisé.";
  return m || "Une erreur est survenue.";
}

/* ------------------------------------------------------------------ */
/*  Moteur Supabase                                                    */
/* ------------------------------------------------------------------ */
function createSupabaseApi() {
  const lib = window.supabase;
  const sb = lib.createClient(CONF.SUPABASE_URL, CONF.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, storageKey: "appui-auth" } });
  // Client secondaire, sans session mémorisée : sert à créer les comptes des enseignants
  // sans déconnecter l'administrateur.
  const creator = () => lib.createClient(CONF.SUPABASE_URL, CONF.SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: "appui-creation" } });
  const chk = ({ data, error }) => { if (error) throw error; return data; };

  async function fetchAll(table, order) {
    let out = [], from = 0;
    for (;;) {
      let q = sb.from(table).select("*");
      order.forEach(c => { q = q.order(c); });
      const data = chk(await q.range(from, from + 999));
      out = out.concat(data);
      if (data.length < 1000) return out;
      from += 1000;
    }
  }
  const mapEns = r => ({ id: r.id, userId: r.user_id, nom: r.nom, profil: r.profil, role: r.role, telephone: r.telephone || "", site: r.site || "",
    jour: r.jour ?? 5, heureDebut: hhmm(r.heure_debut), heureFin: hhmm(r.heure_fin), debut: r.debut || "", actif: r.actif !== false });

  return {
    mode: "supabase",
    async session() { const { data } = await sb.auth.getSession(); return data.session ? data.session.user.id : null; },
    async needsSetup() { return !chk(await sb.rpc("admin_existe")); },
    async login(profil, mdp) {
      chk(await sb.auth.signInWithPassword({ email: profilEmail(profil), password: mdp }));
    },
    async setup(nom, profil, mdp) {
      if (!PROFIL_RE.test(profil)) throw new Error("Profil invalide : 3 à 30 caractères, lettres sans accents, chiffres, point ou tiret.");
      const r = await sb.auth.signUp({ email: profilEmail(profil), password: mdp });
      if (r.error && !/already registered/i.test(r.error.message)) throw r.error;
      if (!r.data.session) chk(await sb.auth.signInWithPassword({ email: profilEmail(profil), password: mdp }));
      chk(await sb.rpc("devenir_admin", { p_nom: nom, p_profil: profil }));
    },
    async logout() { await sb.auth.signOut(); },
    async load() {
      const uid = await this.session();
      if (!uid) throw new Error("Session expirée. Reconnectez-vous.");
      const [ens, enf, seances, pres, notes, cfg] = await Promise.all([
        fetchAll("enseignants", ["id"]), fetchAll("eleves", ["id"]), fetchAll("seances", ["id"]),
        fetchAll("presences", ["seance_id", "eleve_id"]), fetchAll("moyennes", ["eleve_id", "periode"]),
        sb.from("config").select("*").maybeSingle().then(chk)
      ]);
      const meRow = ens.find(r => r.user_id === uid && r.actif !== false);
      if (!meRow) { await sb.auth.signOut(); throw new Error("Ce compte est désactivé ou n'est relié à aucune fiche. Contactez un administrateur."); }
      const bySeance = {};
      pres.forEach(p => { (bySeance[p.seance_id] = bySeance[p.seance_id] || {})[p.eleve_id] = p.statut; });
      const kidEns = {};
      enf.forEach(k => kidEns[k.id] = k.enseignant_id);
      return {
        me: { id: meRow.id, nom: meRow.nom, profil: meRow.profil, role: meRow.role },
        config: cfg ? { debut: cfg.debut || "", fin: cfg.fin || "", tolerance: cfg.tolerance ?? 10, vacances: cfg.vacances || [] } : {},
        ens: ens.map(mapEns),
        enf: enf.map(k => ({ id: k.id, enseignantId: k.enseignant_id, prenom: k.prenom, nom: k.nom, sexe: k.sexe, niveau: k.niveau, ecole: k.ecole || "", actif: k.actif !== false })),
        seances: seances.map(s => ({ id: s.id, enseignantId: s.enseignant_id, semaine: s.semaine, present: s.present, dateCours: s.date_cours || "",
          arrivee: hhmm(s.arrivee), depart: hhmm(s.depart), motif: s.motif || "", eleves: bySeance[s.id] || {}, majLe: s.maj_le })),
        notes: notes.map(n => ({ enfantId: n.eleve_id, enseignantId: kidEns[n.eleve_id], periode: n.periode, moyenne: Number(n.moyenne), bareme: n.bareme, majLe: n.maj_le }))
      };
    },
    async saveSeance(s) {
      chk(await sb.rpc("enregistrer_seance", { p_enseignant: s.enseignantId, p_semaine: s.semaine, p_present: s.present,
        p_date: s.present ? (s.dateCours || null) : null, p_arrivee: s.present ? s.arrivee : null, p_depart: s.present ? s.depart : null,
        p_motif: s.motif || "", p_eleves: s.eleves || {} }));
    },
    async saveNotes(periode, items) {
      chk(await sb.rpc("enregistrer_moyennes", { p_periode: periode, p_items: items.map(i => ({ eleve_id: i.enfantId, moyenne: i.moyenne })) }));
    },
    async saveEleve(k) {
      const row = { prenom: k.prenom, nom: k.nom, sexe: k.sexe, niveau: k.niveau, ecole: k.ecole || "" };
      if (k.id) chk(await sb.from("eleves").update(row).eq("id", k.id));
      else chk(await sb.from("eleves").insert({ ...row, enseignant_id: k.enseignantId }));
    },
    async setEleveActif(id, actif) { chk(await sb.from("eleves").update({ actif }).eq("id", id)); },
    async saveEns(e) {
      const row = { nom: e.nom, role: e.role === "admin" ? "admin" : "enseignant", telephone: e.telephone || "", site: e.site || "", jour: e.jour, heure_debut: e.heureDebut || null, heure_fin: e.heureFin || null, debut: e.debut || null };
      if (e.id) {
        chk(await sb.from("enseignants").update(row).eq("id", e.id));
        if (e.mdp) chk(await sb.rpc("reinitialiser_mot_de_passe", { p_enseignant: e.id, p_mdp: e.mdp }));
        return;
      }
      const taken = chk(await sb.from("enseignants").select("id").eq("profil", e.profil));
      if (taken.length) throw new Error("Le profil « " + e.profil + " » est déjà utilisé.");
      const c = creator();
      let userId;
      const r = await c.auth.signUp({ email: profilEmail(e.profil), password: e.mdp });
      if (r.error) {
        if (!/already registered/i.test(r.error.message)) throw r.error;
        // compte de connexion déjà créé lors d'un essai précédent : on le récupère
        const s = await c.auth.signInWithPassword({ email: profilEmail(e.profil), password: e.mdp });
        if (s.error) throw new Error("Un identifiant « " + e.profil + " » existe déjà dans Supabase avec un autre mot de passe. Choisissez un autre profil, ou supprimez cet utilisateur dans Supabase > Authentication.");
        userId = s.data.user.id;
      } else {
        userId = r.data.user && r.data.user.id;
      }
      if (!userId) throw new Error("La création du compte a échoué.");
      await c.auth.signOut().catch(() => {});
      chk(await sb.from("enseignants").insert({ ...row, profil: e.profil, user_id: userId }));
    },
    async setEnsActif(id, actif) { chk(await sb.from("enseignants").update({ actif }).eq("id", id)); },
    async saveConfig(c) {
      chk(await sb.from("config").update({ debut: c.debut, fin: c.fin, tolerance: c.tolerance, vacances: c.vacances }).eq("id", 1));
    },
    async changePw(profil, ancien, nouveau) {
      const r = await sb.auth.signInWithPassword({ email: profilEmail(profil), password: ancien });
      if (r.error) throw new Error("Le mot de passe actuel est incorrect.");
      chk(await sb.auth.updateUser({ password: nouveau }));
    }
  };
}

/* ------------------------------------------------------------------ */
/*  Moteur Démo : données fictives en mémoire                          */
/* ------------------------------------------------------------------ */
function createDemoApi() {
  const uid = () => "d" + Math.random().toString(36).slice(2, 10);
  const D = { users: {}, ens: [], enf: [], seances: [], notes: [], config: {}, session: store.get("appui-demo-session") };
  const wait = (ms = 250) => new Promise(r => setTimeout(r, ms));

  (function seed() {
    const t = today();
    const y = t.getUTCMonth() >= 7 ? t.getUTCFullYear() : t.getUTCFullYear() - 1;
    D.config = { debut: y + "-09-07", fin: (y + 1) + "-06-30", tolerance: 10, vacances: [] };
    let s = 11; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    const add = (profil, row) => { const id = uid(); D.users[profil] = { pw: "demo123", ensId: id }; D.ens.push({ id, profil, actif: true, telephone: "", site: "", jour: 5, heureDebut: "", heureFin: "", debut: D.config.debut, ...row }); return id; };
    add("admin", { nom: "Administrateur (démo)", role: "admin", telephone: "07 00 00 00 00" });
    add("coordination", { nom: "Coordination Abobo", role: "admin" });
    const T = [
      { profil: "aya.konan", nom: "Aya Konan", site: "Abobo Avocatier", jour: 5, heureDebut: "09:00", heureFin: "11:00", telephone: "07 00 00 00 01", rel: .95, ponct: .85 },
      { profil: "yao.kouadio", nom: "Yao Kouadio", site: "Yopougon Wassakara", jour: 2, heureDebut: "15:00", heureFin: "17:00", telephone: "05 00 00 00 02", rel: .8, ponct: .55 },
      { profil: "mariam.traore", nom: "Mariam Traoré", site: "Koumassi Remblais", jour: 5, heureDebut: "14:00", heureFin: "16:00", telephone: "01 00 00 00 03", rel: .9, ponct: .9 }
    ];
    const PR = ["Awa", "Koffi", "Fatou", "Ibrahim", "Adjoua", "Moussa", "Akissi", "Junior", "Salimata", "Brou", "Aminata", "Kouamé", "Grâce", "Seydou", "Affoué", "Lassina", "Prisca", "Drissa"];
    const NO = ["Bamba", "N'Guessan", "Coulibaly", "Kouassi", "Ouattara", "Diallo", "Koné", "Yapi", "Touré", "Gnagne", "Sangaré", "Aka", "Kra", "Diaby", "Ehui", "Soro", "Assi", "Dosso"];
    const NIV = ["CE1", "CE2", "CM1", "CM2", "CM2", "6e"];
    const weeks = weeksBetween(D.config.debut, iso(addDays(parseISO(curMonday()), -7)));
    const curM = t.getUTCFullYear() * 12 + t.getUTCMonth();
    let ki = 0;
    T.forEach(tt => {
      const ensId = add(tt.profil, { nom: tt.nom, role: "enseignant", site: tt.site, jour: tt.jour, heureDebut: tt.heureDebut, heureFin: tt.heureFin, telephone: tt.telephone });
      const kids = NIV.map((niveau, i) => {
        const k = { id: uid(), enseignantId: ensId, prenom: PR[ki], nom: NO[ki], sexe: ki++ % 2 ? "M" : "F", niveau,
          ecole: niveau === "6e" ? "Collège moderne " + tt.site.split(" ")[0] : "EPP " + tt.site, actif: true };
        D.enf.push(k); return { ...k, assid: .5 + rnd() * .5, base: 3.5 + rnd() * 4 };
      });
      weeks.forEach(w => {
        if (rnd() > tt.rel + .03) return;
        const present = rnd() < tt.rel;
        const hd = toMin(tt.heureDebut), late = rnd() > tt.ponct ? 12 + Math.round(rnd() * 25) : Math.round(rnd() * 8) - 3;
        const hm = m => pad(Math.floor(m / 60)) + ":" + pad(m % 60);
        const eleves = {}; if (present) kids.forEach(k => eleves[k.id] = rnd() < k.assid ? "P" : "A");
        D.seances.push({ id: uid(), enseignantId: ensId, semaine: w, present, dateCours: present ? iso(addDays(parseISO(w), tt.jour)) : "",
          arrivee: present ? hm(hd + late) : "", depart: present ? hm(toMin(tt.heureFin) + Math.round(rnd() * 15) - 10) : "",
          motif: present ? "" : "Examens à l'université", eleves, majLe: new Date().toISOString() });
      });
      kids.forEach(k => {
        if (cycleOf(k.niveau) === "primaire") {
          let v = k.base;
          let d = parseISO(D.config.debut); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
          while (d.getUTCFullYear() * 12 + d.getUTCMonth() < curM) {
            v = Math.max(1, Math.min(9.8, v + (k.assid - .7) * 1.6 + (rnd() - .5) * .8));
            D.notes.push({ enfantId: k.id, enseignantId: ensId, periode: d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1), moyenne: Math.round(v * 100) / 100, bareme: 10 });
            d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
          }
        } else {
          D.notes.push({ enfantId: k.id, enseignantId: ensId, periode: y + "-" + (y + 1) + "-T1", moyenne: Math.round((k.base * 2 + (rnd() - .3) * 3) * 100) / 100, bareme: 20 });
        }
      });
    });
  })();

  const me = () => { const u = Object.entries(D.users).find(([p]) => p === D.session); if (!u) return null; return D.ens.find(e => e.id === u[1].ensId && e.actif); };
  const isSup = () => me() && me().role === "admin";
  const lastAdmin = id => !D.ens.some(r => r.role === "admin" && r.actif && r.id !== id);
  const canManage = ensId => isSup() || (me() && me().id === ensId);
  const clone = x => JSON.parse(JSON.stringify(x));

  return {
    mode: "demo",
    async session() { return me() ? D.session : null; },
    async needsSetup() { return false; },
    async login(profil, mdp) {
      await wait();
      const p = String(profil).trim().toLowerCase(), u = D.users[p];
      if (!u || u.pw !== mdp) throw new Error("Profil ou mot de passe incorrect.");
      const e = D.ens.find(x => x.id === u.ensId);
      if (!e.actif) throw new Error("Ce compte est désactivé. Contactez un administrateur.");
      D.session = p; store.set("appui-demo-session", p);
    },
    async setup() { throw new Error("Indisponible en mode démo."); },
    async logout() { D.session = null; store.set("appui-demo-session", ""); },
    async load() {
      await wait(150);
      const m = me(); if (!m) throw new Error("Session expirée. Reconnectez-vous.");
      const sup = m.role === "admin";
      const own = id => sup || id === m.id;
      return clone({
        me: { id: m.id, nom: m.nom, profil: m.profil, role: m.role }, config: D.config,
        ens: D.ens.filter(e => sup || e.id === m.id), enf: D.enf.filter(k => own(k.enseignantId)),
        seances: D.seances.filter(s => own(s.enseignantId)), notes: D.notes.filter(n => own(n.enseignantId))
      });
    },
    async saveSeance(s) {
      await wait(); if (!canManage(s.enseignantId)) throw new Error("Accès refusé.");
      const kids = new Set(D.enf.filter(k => k.enseignantId === s.enseignantId).map(k => k.id));
      const eleves = {}; Object.entries(s.eleves || {}).forEach(([k, v]) => { if (kids.has(k) && (v === "P" || v === "A")) eleves[k] = v; });
      const row = { enseignantId: s.enseignantId, semaine: s.semaine, present: s.present, dateCours: s.present ? s.dateCours : "", arrivee: s.present ? s.arrivee : "",
        depart: s.present ? s.depart : "", motif: s.present ? "" : (s.motif || ""), eleves, majLe: new Date().toISOString() };
      const i = D.seances.findIndex(x => x.enseignantId === s.enseignantId && x.semaine === s.semaine);
      if (i >= 0) D.seances[i] = { ...D.seances[i], ...row }; else D.seances.push({ id: uid(), ...row });
    },
    async saveNotes(periode, items) {
      await wait();
      items.forEach(it => {
        const k = D.enf.find(x => x.id === it.enfantId); if (!k || !canManage(k.enseignantId)) return;
        const i = D.notes.findIndex(n => n.enfantId === k.id && n.periode === periode);
        if (it.moyenne == null) { if (i >= 0) D.notes.splice(i, 1); return; }
        const row = { enfantId: k.id, enseignantId: k.enseignantId, periode, moyenne: Math.round(it.moyenne * 100) / 100, bareme: baremeOf(k.niveau), majLe: new Date().toISOString() };
        if (i >= 0) D.notes[i] = row; else D.notes.push(row);
      });
    },
    async saveEleve(k) {
      await wait();
      if (k.id) { const x = D.enf.find(e => e.id === k.id); if (!x || !canManage(x.enseignantId)) throw new Error("Accès refusé."); Object.assign(x, { prenom: k.prenom, nom: k.nom, sexe: k.sexe, niveau: k.niveau, ecole: k.ecole }); }
      else { if (!canManage(k.enseignantId)) throw new Error("Accès refusé."); D.enf.push({ id: uid(), enseignantId: k.enseignantId, prenom: k.prenom, nom: k.nom, sexe: k.sexe, niveau: k.niveau, ecole: k.ecole || "", actif: true }); }
    },
    async setEleveActif(id, actif) { await wait(); const x = D.enf.find(e => e.id === id); if (x && canManage(x.enseignantId)) x.actif = actif; },
    async saveEns(e) {
      await wait(); if (!isSup()) throw new Error("Réservé aux administrateurs.");
      const fields = { nom: e.nom, role: e.role === "admin" ? "admin" : "enseignant", telephone: e.telephone, site: e.site, jour: e.jour, heureDebut: e.heureDebut, heureFin: e.heureFin, debut: e.debut };
      if (e.id) {
        const x = D.ens.find(r => r.id === e.id);
        if (x.role === "admin" && fields.role !== "admin" && x.actif && lastAdmin(x.id)) throw new Error("Il faut garder au moins un administrateur actif.");
        Object.assign(x, fields); if (e.mdp) D.users[x.profil].pw = e.mdp; return;
      }
      if (D.users[e.profil]) throw new Error("Le profil « " + e.profil + " » est déjà utilisé.");
      const id = uid(); D.users[e.profil] = { pw: e.mdp, ensId: id };
      D.ens.push({ id, profil: e.profil, actif: true, ...fields });
    },
    async setEnsActif(id, actif) {
      await wait(); if (!isSup()) throw new Error("Réservé aux administrateurs.");
      const x = D.ens.find(r => r.id === id);
      if (!actif && x.role === "admin" && lastAdmin(id)) throw new Error("Il faut garder au moins un administrateur actif.");
      x.actif = actif;
    },
    async saveConfig(c) { await wait(); if (!isSup()) throw new Error("Réservé aux administrateurs."); D.config = { ...c }; },
    async changePw(profil, ancien, nouveau) { await wait(); const u = D.users[profil]; if (!u || u.pw !== ancien) throw new Error("Le mot de passe actuel est incorrect."); u.pw = nouveau; }
  };
}

// Supabase configuré mais bibliothèque non chargée (hors ligne au premier lancement) : Api = null, l'écran l'explique.
const Api = (CONF.SUPABASE_URL && CONF.SUPABASE_KEY) ? (window.supabase ? createSupabaseApi() : null) : createDemoApi();
