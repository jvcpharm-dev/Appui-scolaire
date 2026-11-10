/*
 * Installation sur l'écran d'accueil (application web progressive).
 *  - Android / ordinateur (Chrome, Edge…) : bouton « Installer » natif.
 *  - iPhone / iPad (Safari) : consignes « Partager → Sur l'écran d'accueil ».
 * L'invitation apparaît quelques secondes après l'ouverture ; « Plus tard »
 * la masque 7 jours. Elle reste disponible dans l'onglet « Compte ».
 */
"use strict";

const PWA = (() => {
  let deferred = null;
  const ua = navigator.userAgent;
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isIOSSafari = isIOS && /safari/i.test(ua) && !/crios|fxios|edgios|fbav|instagram|line\//i.test(ua);
  const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const snoozed = () => Number(store.get("pwa-snooze") || 0) > Date.now();
  const canOffer = () => !standalone() && (!!deferred || isIOSSafari);
  const SHARE = `<svg class="ios-share" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="Partager"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>`;

  // Service worker : ouverture rapide et hors ligne de l'application
  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }

  addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferred = e;
    afterRender();
    if (!snoozed()) setTimeout(() => showBanner(), 2500);
  });
  addEventListener("appinstalled", () => {
    deferred = null; hideBanner(); afterRender();
    if (typeof toast === "function") toast("Application installée sur cet appareil.");
  });
  if (isIOSSafari && !standalone() && !snoozed()) setTimeout(() => showBanner(), 4000);

  function body(compact) {
    if (deferred) {
      return `<img src="icons/icon-192.png" alt=""><p><b>Installer Appui scolaire</b>Ouvrez-la d'un geste depuis l'écran d'accueil, comme une vraie application.</p>
        <div class="row">${compact ? "" : `<button class="btn small ghost" data-pwa="later">Plus tard</button>`}<button class="btn small primary" data-pwa="install">Installer</button></div>`;
    }
    return `<img src="icons/icon-192.png" alt=""><div><b>Ajouter à l'écran d'accueil</b>
        <ol class="ios-steps"><li>Touchez ${SHARE} <b style="display:inline">Partager</b> en bas de Safari</li><li>Choisissez « Sur l'écran d'accueil »</li><li>Touchez « Ajouter »</li></ol></div>
        ${compact ? "" : `<div class="row"><button class="btn small ghost" data-pwa="later">Compris</button></div>`}`;
  }
  function showBanner() {
    if (!canOffer()) return;
    const el = $("#install");
    el.innerHTML = body(false);
    el.hidden = false;
  }
  function hideBanner() { const el = $("#install"); if (el) el.hidden = true; }

  // Carte « Installer » dans l'onglet Compte
  function afterRender() {
    const card = $("#install-card");
    if (!card) return;
    if (!canOffer()) { card.hidden = true; return; }
    card.hidden = false;
    card.innerHTML = `<h2>Installer l'application</h2><div class="install-inline" style="display:grid;grid-template-columns:auto 1fr;gap:12px;align-items:center">${body(true)}</div>`;
  }

  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-pwa]");
    if (!b) return;
    if (b.dataset.pwa === "later") { store.set("pwa-snooze", String(Date.now() + 7 * 864e5)); return hideBanner(); }
    if (b.dataset.pwa === "install" && deferred) {
      deferred.prompt();
      await deferred.userChoice.catch(() => null);
      deferred = null; hideBanner(); afterRender();
    }
  });

  return { afterRender, showBanner };
})();
