# Appui scolaire

Application web installable pour suivre les cours de renforcement :
pointage hebdomadaire des étudiants-enseignants (présence, arrivée, départ),
présence des élèves, moyennes scolaires (mensuelles au primaire, trimestrielles
au secondaire) et tableau d'analyse pour les administrateurs.

Les données sont stockées dans **Supabase**. Les étudiants se connectent avec
un **profil** et un **mot de passe**, sans adresse e-mail.

```
index.html               page unique
css/styles.css           styles
js/config.js             ← vos clés Supabase (à remplir)
js/utils.js              dates, formats, constantes
js/api.js                accès aux données (Supabase + mode démo)
js/charts.js             graphiques
js/pwa.js                installation sur l'écran d'accueil
js/app.js                écrans et actions
sw.js                    fonctionnement hors ligne de l'application
manifest.webmanifest     nom, icônes, couleurs de l'application installée
icons/                   icônes
supabase/schema.sql      base de données et règles d'accès
```

Sans clés Supabase, l'application s'ouvre en **mode démo** (données fictives) :
pratique pour la découvrir. Comptes démo : `admin` (administrateur), `aya.konan` et
`yao.kouadio` (enseignants), mot de passe `demo123`.

## Deux types de comptes

| | Enseignant (étudiant) | Administrateur |
|---|---|---|
| Pointer sa semaine, marquer la présence de ses élèves | oui, pour son groupe | oui, pour n'importe quel groupe |
| Saisir les moyennes de ses élèves | oui, son groupe | oui, tous les groupes |
| Voir les autres groupes | non | oui |
| Analyse (indicateurs, graphiques, alertes) | non | oui |
| Créer / désactiver des comptes, redonner un mot de passe | non | oui |
| Régler le calendrier (vacances, retard toléré) | non | oui |

Il peut y avoir plusieurs administrateurs. La base empêche de désactiver
ou de rétrograder le dernier administrateur actif, pour ne jamais perdre l'accès.

---

## Installation (environ 20 minutes)

### 1. Créer la base Supabase
1. Créez un compte sur <https://supabase.com>, puis **New project**.
   Choisissez une région proche (par exemple *West EU (Paris)*) et notez le mot de passe de la base.
2. Menu **SQL Editor** → **New query** : collez tout le contenu de `supabase/schema.sql`, puis **Run**.
   Le message « Success. No rows returned » confirme l'installation.

### 2. Régler la connexion par profil
Menu **Authentication** → **Sign In / Providers** → **Email** :
- désactivez **Confirm email** (les profils n'ont pas de vraie adresse e-mail) ;
- laissez **Allow new users to sign up** activé (c'est ainsi que les administrateurs créent les comptes).

Enregistrez.

### 3. Relier l'application
Menu **Project Settings** → **API** (ou **Data API**) :
copiez **Project URL** et la clé **anon public** dans `js/config.js` :

```js
SUPABASE_URL: "https://xxxxxxxx.supabase.co",
SUPABASE_ANON_KEY: "eyJhbGciOi...",
```

La clé *anon* est faite pour être publique : ce sont les règles de `schema.sql`
qui protègent les données. Ne mettez **jamais** la clé *service_role* dans l'application.

### 4. Mettre l'application en ligne
L'installation sur téléphone exige une adresse en **https**. Le plus simple :
1. Ouvrez <https://app.netlify.com/drop>.
2. Glissez-déposez le dossier `appui-scolaire` entier.
3. Netlify donne une adresse du type `https://nom-au-hasard.netlify.app`
   (renommable dans *Site configuration*).

GitHub Pages, Vercel ou Cloudflare Pages conviennent aussi.

### 5. Premier lancement
1. Ouvrez l'adresse : l'écran **Premier lancement** apparaît.
2. Créez votre compte administrateur (nom, profil, mot de passe).
   Cet écran disparaît dès qu'un administrateur existe.
3. Onglet **Gestion** :
   - réglez le calendrier (début et fin d'année, semaines sans cours) ;
   - créez les autres comptes : choisissez le **type** (Enseignant ou Administrateur), puis nom, **profil** (ex. `aya.konan`) et mot de passe de départ ; pour un enseignant, ajoutez son site, son jour et son horaire de cours.
4. Envoyez à chaque personne l'adresse, son profil et son mot de passe.
   Il pourra changer son mot de passe dans l'onglet **Compte**.

### 6. Installer sur le téléphone
- **Android (Chrome)** : une invitation « Installer » apparaît en bas de l'écran.
  Sinon : menu ⋮ → *Installer l'application*.
- **iPhone (Safari)** : bouton *Partager* → *Sur l'écran d'accueil* → *Ajouter*.
  L'application affiche ces consignes automatiquement.
- L'invitation reste disponible dans l'onglet **Compte**.

---

## Au quotidien
- **Mot de passe oublié** : Gestion → *Modifier* l'enseignant → saisir un nouveau mot de passe.
- **Étudiant ou administrateur qui quitte le programme** : *Désactiver*. Il ne peut plus se connecter ; son historique reste dans l'analyse.
- **Élève qui ne vient plus** : *Ne vient plus* dans « Élèves » (rien n'est effacé).
- **Vos propres analyses** : Supabase → *Table Editor* affiche toutes les tables ;
  chaque table s'exporte en CSV (bouton *Export*).
- **Mise à jour des fichiers** : après une modification, augmentez `VERSION` dans `sw.js`
  (ex. `appui-v3`) puis redéployez, pour que les téléphones prennent la nouvelle version.

## Qui voit quoi
Voir le tableau « Deux types de comptes » plus haut. Ces règles sont appliquées par la base elle-même (Row Level Security),
pas seulement par l'interface.

## Mise à niveau d'une installation existante
Si vous aviez déjà installé la version précédente (rôle « superviseur »),
relancez simplement `supabase/schema.sql` dans le SQL Editor : le superviseur
devient administrateur, sans perte de données.

## En cas de problème
| Message | Solution |
|---|---|
| « Compte non confirmé » | Étape 2 : désactivez *Confirm email*. |
| « Les inscriptions sont désactivées » | Étape 2 : activez *Allow new users to sign up*. |
| « Supabase refuse l'identifiant généré » | Changez `PROFIL_DOMAINE` dans `js/config.js` (par exemple `profils-appui.org`) **avant** de créer les comptes. |
| « Pas de connexion au serveur » | Vérifiez la connexion internet, puis `SUPABASE_URL`. |
| Le changement de mot de passe par un administrateur échoue | Désactivez l'ancien compte et créez-en un nouveau avec un autre profil. |
| Trop de comptes créés d'un coup (« Trop de tentatives ») | Supabase limite les créations par heure ; patientez puis continuez. |
