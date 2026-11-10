/*
 * Réglages de connexion à Supabase (voir le guide d'installation, étape 4).
 *   - SUPABASE_URL : l'adresse du projet, de la forme https://xxxxxxxx.supabase.co
 *   - SUPABASE_KEY : la clé « Publishable » (elle commence par sb_publishable_)
 * Gardez les guillemets autour des valeurs.
 * Tant que ces deux valeurs sont vides, l'application tourne en MODE DÉMO
 * (données fictives, rien n'est enregistré).
 */
window.APPUI_CONFIG = {
  SUPABASE_URL: "https://gopphkiledmgugjlfivc.supabase.co/rest/v1/",
  SUPABASE_KEY: "sb_publishable_3wEesWxQfkNsSaOvaGvlNg_2Mni7Uga",

  // Les profils (ex. « aya.konan ») sont transformés en identifiants de connexion
  // de la forme aya.konan@<PROFIL_DOMAINE>. Aucun e-mail n'est jamais envoyé.
  // Ne changez cette valeur qu'AVANT de créer les premiers comptes.
  PROFIL_DOMAINE: "appuiscolaire.app"
};
