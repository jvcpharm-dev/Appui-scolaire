-- =====================================================================
--  APPUI SCOLAIRE — base de données Supabase
--  À coller en entier dans Supabase > SQL Editor > New query > Run.
--  Le script peut être relancé sans risque (il ne supprime aucune donnée).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

-- Comptes : administrateurs (supervision) et étudiants-enseignants
create table if not exists public.enseignants (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid unique references auth.users(id) on delete set null,
  nom          text not null,
  profil       text not null unique check (profil ~ '^[a-z0-9._-]{3,30}$'),
  role         text not null default 'enseignant' check (role in ('enseignant', 'admin')),
  telephone    text not null default '',
  site         text not null default '',
  jour         smallint not null default 5 check (jour between 0 and 6),   -- 0 = lundi … 6 = dimanche
  heure_debut  time,
  heure_fin    time,
  debut        date,                                                     -- début de sa mission
  actif        boolean not null default true,
  cree_le      timestamptz not null default now()
);

-- Mise à niveau d'une installation précédente : l'ancien rôle « superviseur » devient « admin »
do $$ begin
  alter table public.enseignants drop constraint if exists enseignants_role_check;
  update public.enseignants set role = 'admin' where role = 'superviseur';
  alter table public.enseignants add constraint enseignants_role_check check (role in ('enseignant', 'admin'));
end $$;

create table if not exists public.eleves (
  id             uuid primary key default gen_random_uuid(),
  enseignant_id  uuid not null references public.enseignants(id) on delete cascade,
  prenom         text not null,
  nom            text not null,
  sexe           text not null default 'F' check (sexe in ('F', 'M')),
  niveau         text not null check (niveau in ('CP1','CP2','CE1','CE2','CM1','CM2','6e','5e','4e','3e','2nde','1ère','Tle')),
  ecole          text not null default '',
  actif          boolean not null default true,
  cree_le        timestamptz not null default now()
);
create index if not exists eleves_enseignant_idx on public.eleves(enseignant_id);

-- Une séance = la semaine d'un enseignant (présence, horaires)
create table if not exists public.seances (
  id             uuid primary key default gen_random_uuid(),
  enseignant_id  uuid not null references public.enseignants(id) on delete cascade,
  semaine        date not null check (extract(isodow from semaine) = 1),  -- lundi de la semaine
  present        boolean not null,
  date_cours     date,
  arrivee        time,
  depart         time,
  motif          text not null default '',
  saisi_par      uuid default auth.uid(),
  maj_le         timestamptz not null default now(),
  unique (enseignant_id, semaine),
  check (not present or (arrivee is not null and depart is not null and depart > arrivee))
);

-- Présence de chaque élève à une séance
create table if not exists public.presences (
  seance_id  uuid not null references public.seances(id) on delete cascade,
  eleve_id   uuid not null references public.eleves(id) on delete cascade,
  statut     char(1) not null check (statut in ('P', 'A')),
  primary key (seance_id, eleve_id)
);
create index if not exists presences_eleve_idx on public.presences(eleve_id);

-- Moyennes scolaires : mensuelles (primaire, /10) ou trimestrielles (secondaire, /20)
create table if not exists public.moyennes (
  eleve_id   uuid not null references public.eleves(id) on delete cascade,
  periode    text not null check (periode ~ '^\d{4}-\d{2}$' or periode ~ '^\d{4}-\d{4}-T[123]$'),
  moyenne    numeric(5,2) not null,
  bareme     smallint not null check (bareme in (10, 20)),
  saisi_par  uuid default auth.uid(),
  maj_le     timestamptz not null default now(),
  primary key (eleve_id, periode),
  check (moyenne >= 0 and moyenne <= bareme)
);

-- Réglages de l'année (une seule ligne)
create table if not exists public.config (
  id         smallint primary key default 1 check (id = 1),
  debut      date,
  fin        date,
  tolerance  smallint not null default 10 check (tolerance between 0 and 120),
  vacances   date[] not null default '{}'
);
insert into public.config (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Fonctions d'aide aux règles d'accès
-- ---------------------------------------------------------------------

create or replace function public.mon_enseignant_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.enseignants where user_id = auth.uid() and actif limit 1
$$;

create or replace function public.est_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.enseignants where user_id = auth.uid() and actif and role = 'admin')
$$;

create or replace function public.peut_gerer(p_enseignant uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.est_admin() or p_enseignant = public.mon_enseignant_id()
$$;

-- ---------------------------------------------------------------------
-- Règles d'accès (Row Level Security)
--   • un enseignant ne voit et ne modifie que son groupe
--   • un administrateur voit et modifie tout
--   • un compte sans fiche enseignant active ne voit rien
-- ---------------------------------------------------------------------

alter table public.enseignants enable row level security;
alter table public.eleves      enable row level security;
alter table public.seances     enable row level security;
alter table public.presences   enable row level security;
alter table public.moyennes    enable row level security;
alter table public.config      enable row level security;

drop policy if exists ens_lecture on public.enseignants;
create policy ens_lecture on public.enseignants for select to authenticated
  using (public.est_admin() or user_id = auth.uid());
drop policy if exists ens_ecriture on public.enseignants;
create policy ens_ecriture on public.enseignants for all to authenticated
  using (public.est_admin()) with check (public.est_admin());

drop policy if exists eleves_acces on public.eleves;
create policy eleves_acces on public.eleves for all to authenticated
  using (public.peut_gerer(enseignant_id)) with check (public.peut_gerer(enseignant_id));

drop policy if exists seances_acces on public.seances;
create policy seances_acces on public.seances for all to authenticated
  using (public.peut_gerer(enseignant_id)) with check (public.peut_gerer(enseignant_id));

drop policy if exists presences_acces on public.presences;
create policy presences_acces on public.presences for all to authenticated
  using (exists (select 1 from public.seances s where s.id = seance_id and public.peut_gerer(s.enseignant_id)))
  with check (exists (select 1 from public.seances s join public.eleves e on e.enseignant_id = s.enseignant_id
                      where s.id = seance_id and e.id = eleve_id and public.peut_gerer(s.enseignant_id)));

drop policy if exists moyennes_acces on public.moyennes;
create policy moyennes_acces on public.moyennes for all to authenticated
  using (exists (select 1 from public.eleves e where e.id = eleve_id and public.peut_gerer(e.enseignant_id)))
  with check (exists (select 1 from public.eleves e where e.id = eleve_id and public.peut_gerer(e.enseignant_id)));

drop policy if exists config_lecture on public.config;
create policy config_lecture on public.config for select to authenticated
  using (public.mon_enseignant_id() is not null);
drop policy if exists config_ecriture on public.config;
create policy config_ecriture on public.config for update to authenticated
  using (public.est_admin()) with check (public.est_admin());

-- ---------------------------------------------------------------------
-- Actions appelées par l'application
-- ---------------------------------------------------------------------

-- Enregistre la semaine d'un enseignant et la présence de ses élèves, en une fois
create or replace function public.enregistrer_seance(
  p_enseignant uuid, p_semaine date, p_present boolean, p_date date,
  p_arrivee time, p_depart time, p_motif text, p_eleves jsonb
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  if p_enseignant is null or not coalesce(public.peut_gerer(p_enseignant), false) then
    raise exception 'Accès refusé pour cet enseignant.';
  end if;
  insert into public.seances (enseignant_id, semaine, present, date_cours, arrivee, depart, motif, saisi_par, maj_le)
  values (p_enseignant, p_semaine, p_present,
          case when p_present then p_date end,
          case when p_present then p_arrivee end,
          case when p_present then p_depart end,
          case when p_present then '' else left(coalesce(p_motif, ''), 500) end,
          auth.uid(), now())
  on conflict (enseignant_id, semaine) do update
    set present = excluded.present, date_cours = excluded.date_cours, arrivee = excluded.arrivee,
        depart = excluded.depart, motif = excluded.motif, saisi_par = excluded.saisi_par, maj_le = now()
  returning id into v_id;

  delete from public.presences where seance_id = v_id;
  insert into public.presences (seance_id, eleve_id, statut)
  select v_id, el.id, j.value
  from jsonb_each_text(coalesce(p_eleves, '{}'::jsonb)) j
  join public.eleves el on el.id::text = j.key and el.enseignant_id = p_enseignant
  where j.value in ('P', 'A');
  return v_id;
end $$;

-- Enregistre les moyennes d'une période : [{ "eleve_id": "...", "moyenne": 12.5 | null }]
create or replace function public.enregistrer_moyennes(p_periode text, p_items jsonb) returns integer
language plpgsql security invoker set search_path = public as $$
declare it jsonb; v_niv text; v_bar smallint; v_id uuid; v_val numeric; n integer := 0;
begin
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_id := (it ->> 'eleve_id')::uuid;
    select niveau into v_niv from public.eleves where id = v_id;   -- invisible si ce n'est pas votre élève
    if not found then continue; end if;
    v_bar := case when v_niv in ('CP1','CP2','CE1','CE2','CM1','CM2') then 10 else 20 end;
    if jsonb_typeof(it -> 'moyenne') is distinct from 'number' then
      delete from public.moyennes where eleve_id = v_id and periode = p_periode;
    else
      v_val := (it ->> 'moyenne')::numeric;
      if v_val < 0 or v_val > v_bar then
        raise exception 'La moyenne doit être comprise entre 0 et %.', v_bar;
      end if;
      insert into public.moyennes (eleve_id, periode, moyenne, bareme, saisi_par, maj_le)
      values (v_id, p_periode, round(v_val, 2), v_bar, auth.uid(), now())
      on conflict (eleve_id, periode) do update
        set moyenne = excluded.moyenne, bareme = excluded.bareme, saisi_par = excluded.saisi_par, maj_le = now();
    end if;
    n := n + 1;
  end loop;
  return n;
end $$;

-- Premier lancement : le premier compte créé devient administrateur (une seule fois)
create or replace function public.devenir_admin(p_nom text, p_profil text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Connexion requise.'; end if;
  if exists (select 1 from public.enseignants where role = 'admin') then
    raise exception 'Un administrateur existe déjà. Demandez-lui de créer votre compte.';
  end if;
  insert into public.enseignants (user_id, nom, profil, role)
  values (auth.uid(), p_nom, lower(p_profil), 'admin')
  returning id into v_id;
  return v_id;
end $$;

-- Indique si l'installation initiale a déjà été faite (utilisé par l'écran de connexion)
create or replace function public.admin_existe() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.enseignants where role = 'admin')
$$;

-- Garde-fou : impossible de désactiver ou de rétrograder le dernier administrateur actif
create or replace function public.garder_un_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and old.actif and (new.role <> 'admin' or not new.actif) then
    if not exists (select 1 from public.enseignants where role = 'admin' and actif and id <> old.id) then
      raise exception 'Il faut garder au moins un administrateur actif.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists garder_un_admin on public.enseignants;
create trigger garder_un_admin before update on public.enseignants
  for each row execute function public.garder_un_admin();

-- Un administrateur donne un nouveau mot de passe à un compte (mot de passe oublié)
create or replace function public.reinitialiser_mot_de_passe(p_enseignant uuid, p_mdp text) returns void
language plpgsql security definer set search_path = public, extensions as $$
declare v_user uuid;
begin
  if not public.est_admin() then raise exception 'Réservé aux administrateurs.'; end if;
  if length(coalesce(p_mdp, '')) < 6 then raise exception 'Le mot de passe doit faire au moins 6 caractères.'; end if;
  select user_id into v_user from public.enseignants where id = p_enseignant;
  if v_user is null then raise exception 'Ce compte n''a pas d''identifiant de connexion.'; end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_mdp, extensions.gen_salt('bf')), updated_at = now()
   where id = v_user;
end $$;

-- ---------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------
revoke all on function public.devenir_admin(text, text)            from public, anon;
revoke all on function public.reinitialiser_mot_de_passe(uuid, text)     from public, anon;
revoke all on function public.enregistrer_seance(uuid, date, boolean, date, time, time, text, jsonb) from public, anon;
revoke all on function public.enregistrer_moyennes(text, jsonb)          from public, anon;
grant execute on function public.devenir_admin(text, text)         to authenticated;
grant execute on function public.reinitialiser_mot_de_passe(uuid, text)  to authenticated;
grant execute on function public.enregistrer_seance(uuid, date, boolean, date, time, time, text, jsonb) to authenticated;
grant execute on function public.enregistrer_moyennes(text, jsonb)       to authenticated;
grant execute on function public.admin_existe()                    to anon, authenticated;
grant select, insert, update, delete on public.enseignants, public.eleves, public.seances, public.presences, public.moyennes to authenticated;
grant select, update on public.config to authenticated;

-- Nettoyage des anciennes fonctions (installation précédente)
drop function if exists public.est_superviseur();
drop function if exists public.devenir_superviseur(text, text);
drop function if exists public.superviseur_existe();
