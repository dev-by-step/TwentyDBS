# MEMORY.md — Contexte projet persistant

> Lu en début de session pour reconstituer le contexte sans avoir à relire tout l'historique git.
> À mettre à jour lors d'une décision structurante, d'un piège récurrent, ou d'un changement d'état d'avancement.

---

## Projet

- **Nom :** Twenty CRM Multi-Entity (fork de `twentyhq/twenty`).
- **Repo :** `dev-by-step/TwentyDBS` (origin), `twentyhq/twenty` (upstream).
- **Stack :** voir `docs/ARCHITECTURE.md`. Monorepo Nx + Yarn 4, NestJS + GraphQL Yoga côté serveur, React 18 + Vite + Jotai + Linaria côté front.
- **Démarrage local :** `yarn dev` (script repo). Équivalent : `yarn start`.
- **Prod :** https://20.devbystep.fr (Dokku sur `vps-issa` 54.37.39.172, image `.dokku/Dockerfile`, Procfile web+worker, plugins dokku-postgres + dokku-redis + dokku-letsencrypt).
- **Déploiement :** `git push dokku 10-permissions-entites:main` (branche locale → `main` côté dokku, `deploy-branch` config = `main`). Build sur le VPS via `.dokku/Dockerfile`, 4 GB de swap ajoutés pour le build front.

## Objectif métier

Permettre à un même workspace Twenty d'héberger 4 sociétés du groupe (`WEKNOW`, `DEVBYSTEP`, `ALLSENSIA`, `ANGLE_INTELLIGENCE`) avec :
- Isolation des données CRM par entité (Carte 3 + Carte 10).
- Partage explicite : multi-appartenance Person/Company (Carte 4).
- Calendrier inter-sociétés avec anonymisation des détails (Carte 5), vue groupe (Carte 6), couleur de l'entité responsable (Carte 7).
- Audience de calendrier per-event (Carte 10).

## État d'avancement (au 2026-06-02)

| Carte | Branche | Statut |
|-------|---------|--------|
| 1 | `1-init-projet` | ✅ schéma + seed + hooks ; ⚠️ backfill CSV non vérifié sur prod |
| 2 | `2-identification-entite-source` | ✅ |
| 3 | `3-filtrage-vues-entites` | ✅ (switch binaire Ma Société / Vue Groupe) |
| 4 | `4-gestion-contacts-multi-societes` | ✅ |
| 5 | `5-anonymisation-calendrier-tiers` | ✅ |
| 6 | `6-visualisation-calendrier-groupe` | ✅ |
| 7 | `7-identification-porteur-calendrier` | ✅ |
| 10 | `10-permissions-entites` | ✅ deployé en prod sur https://20.devbystep.fr. Single-tenant + auto-activate + restriction signup + fix skip InviteTeam. |

## Décisions structurantes — déploiement et onboarding

- **Single-tenant** : `IS_MULTIWORKSPACE_ENABLED=false`. Le 1er signup crée le workspace `TwentyDBS` + auto-active (cf. `signUpOnNewWorkspace.activateWorkspace`). Les signups suivants rejoignent ce workspace via `signInUpOnExistingWorkspace`. Aucune UI de "création de workspace" n'est jamais affichée.
- **Auto-signup verrouillé au domaine du super admin** : `SignInUpService.assertEmailDomainAllowedForAutoSignUp` lookup `userRepository.findOne({ where: { canAccessFullAdminPanel: true } })`. Si un super admin existe, seul son domaine email peut s'auto-inscrire. Si aucun super admin (bootstrap), seuls `BOOTSTRAP_ADMIN_EMAILS` (`aline@weknow.dev`, `aline@devbystep.fr`) peuvent créer le 1er compte. Les invitations explicites continuent à bypass le check (via `signInUpWithPersonalInvitation`).
- **Skip InviteTeam pour non-admins** : nouvelle mutation `skipInviteTeamOnboardingStep` (NoPermissionGuard) + helper `advanceFromInviteTeamStep`. `InviteTeam.tsx` affiche un écran simplifié pour les users sans `WORKSPACE_MEMBERS` (un seul bouton Continue).
- **Bootstrap admin** : `BOOTSTRAP_ADMIN_EMAILS = ['aline@weknow.dev', 'aline@devbystep.fr']`. Aline obtient `canAccessFullAdminPanel=true` à son signup + onboarding superadmin pour configurer les InternalEntities.
- **Entrypoint Twenty** : `setup_and_migrate_db` teste désormais la présence de la table `core.keyValuePair` (créée par la 1re migration) au lieu du schema `core` (que TypeORM crée vide à la connexion). Évite que `database:init:prod` soit faussement skippé.
- **Image Docker Dokku** : `.dokku/Dockerfile` (dérivé de `packages/twenty-docker/twenty/Dockerfile`) embarque le Procfile à `/app/Procfile`. Le worker share l'image avec le web, sélectionné via Procfile + `dokku ps:scale twenty-dbs web=1 worker=1`.
- **`scripts/dokku/bootstrap-twenty.sh`** : provisionne l'app + services + storage + scaling. Fait `postgres:link --alias PG_DATABASE` et `redis:link` (indispensable, sinon DNS introuvable au boot) + `git:set deploy-branch main`.

## Décisions structurantes — multi-entité

- **Pas d'import CSV backend custom** : la mutation `importFromCsv` dédiée aux opportunités a été supprimée. Le frontend Twenty a déjà un dialog d'import générique (`useOpenObjectRecordsSpreadsheetImportDialog`) qui :
  - fonctionne pour **n'importe quel objet** (pas seulement `opportunity`)
  - parse le CSV côté client
  - **auto-match les colonnes aux champs** via Fuse.js (fuzzy search sur les labels, threshold 0.3)
  - gère **tous les types de champs** (currency → amountMicros, relations → connect, composites, selects, etc.)
  - utilise l'**upsert** pour éviter les doublons
  - définit `createdBy` automatiquement avec `source: 'IMPORT'` + `workspaceMemberId`
  - a un MatchColumns step pour vérification manuelle si l'auto-match est insuffisant
- **relation-nested-queries.ts fix conservé** : si un `connect` cible un ID inexistant (length === 0), la relation est mise à `null` au lieu de crasher. Protège l'import standard contre les UUIDs de relation invalides dans le CSV.
- **Bouton "Import CSV" générique** : présent dans le menu Options (DefaultView + CustomView) pour **tous les objets**, pas seulement `opportunity`. Ouvre le dialog d'import standard.
- **Pas d'objet TypeORM custom pour `InternalEntity`** : tout passe par le Metadata Engine de Twenty (`ObjectMetadataService`, `FieldMetadataService`). Conséquence : `init-internal-entities` est la commande maîtresse pour recréer le schéma après toute évolution.
- **M2M Twenty = ONE_TO_MANY + junction object** : `Person ↔ InternalEntity` passe par `personEntityMembership` ; idem pour Company, WorkspaceMember, CalendarEvent (audience). Le filtre natif `<field>Id: { in: [...] }` n'est valide **que si** `junctionTargetFieldId` est positionné sur le champ ONE_TO_MANY.
- **Audience calendrier (Carte 10)** : choix `M2M dédiée` (`calendarEventEntityAudience`) plutôt que champ JSON, pour bénéficier du picker auto-généré et des filtres GQL natifs. Tradeoff accepté : nécessite de relancer `init-internal-entities` après pull.
- **Header HTTP `ACTIVE_INTERNAL_ENTITY_ID`** : la Vue Groupe = header absent → l'access policy n'applique aucun filtre en lecture. La Vue Société = header peuplé → filtre par entité active.
- **Pas de fallback par créateur dans le backfill historique** : si une `Opportunity` n'a pas de `Société` dans le CSV, elle reste sans `internalEntityId` et est signalée.
- **Aline / `ANGLE_INTELLIGENCE`** : seedée comme InternalEntity mais absente du CSV (zéro opportunité). Ne pas l'utiliser comme fallback implicite.

## Session récente : Import CSV générique

- **Problème initial** : l'import UI standard ne remplit que name + amount + createdBy (les colonnes custom du CSV ignorées). `createdBy` = "System".
- **Approche abandonnée** (1ère tentative) : mutation `importOpportunitiesFromCsv` dédiée avec `ImportCsvService` en SQL raw + `ImportCsvOpportunitiesResolver`. Trop spécifique, duplique la logique existante.
- **Solution finale** : utiliser le dialog d'import standard `useOpenObjectRecordsSpreadsheetImportDialog` qui est déjà générique. Le fix `relation-nested-queries.ts` (skip connect si ID inexistant) protège contre les UUIDs de relation invalides.
- **Changements** :
  - `relation-nested-queries.ts` : `length !== 1` → `> 1` + si `length === 0`, set `null` au lieu de crasher.
  - `ObjectOptionsDropdownDefaultView.tsx` / `ObjectOptionsDropdownCustomView.tsx` : bouton "Import CSV" pour **tous les objets**, ouvre le dialog standard.
- **Fichiers supprimés** : `import-csv.service.ts`, `import-csv-opportunities.resolver.ts`, `import-csv-input.ts`, `import-csv-result.dto.ts`.
- **Fichiers modifiés** : `relation-nested-queries.ts`, `internal-entity.module.ts`, `ObjectOptionsDropdownDefaultView.tsx`, `ObjectOptionsDropdownCustomView.tsx`, `import-csv-opportunities-parser.service.ts` (revert).

## Pièges connus — production

- **Premier deploy** : `dokku enter twenty-dbs web -- yarn database:init:prod` n'est plus nécessaire (entrypoint corrigé pour détecter la DB vide via la table `core.keyValuePair`). Si on reset la DB en prod, le redeploy lance désormais l'init automatiquement.
- **Bootstrap d'une nouvelle instance Dokku** : `scripts/dokku/bootstrap-twenty.sh` doit pouvoir `dokku postgres:link` et `redis:link`. Si on l'a déjà lancé avant l'ajout des links (cas du VPS actuel), il faut les ajouter manuellement.
- **Init multi-entités après onboarding d'Aline** : actuellement à lancer à la main via `dokku enter twenty-dbs web -- yarn command:prod init-internal-entities`. À automatiser dans `activateWorkspace` ou via la complétion du superadmin setup.
- **GHA build GHCR (`cd-dokku-build.yaml`)** : push automatique sur GHCR mais Dokku build sur le VPS (pas de pull depuis registry). L'image GHCR sert de backup et de CI sanity check uniquement.

## Pièges connus — code

- **`Invalid filter : … doesn't have any "internalEntitiesId" field"`** : la métadonnée du workspace est incomplète (`junctionTargetFieldId` non posé). Relancer `init-internal-entities`. L'`InternalEntityAccessPolicyService` skippe désormais le filtre quand la metadata n'est pas prête, donc ça ne devrait plus planter — mais le filtrage par entité ne sera effectif qu'après init.
- **`ObjectMetadataItemNotFoundError: calendarEventEntityAudience cannot be found"`** : même cause, côté front. Le modal `GroupCalendarCreateEventModal` gate désormais l'audience picker via `useObjectMetadataItems` ; les autres composants qui consomment cet objet doivent suivre la même règle.
- **EMFILE chez chokidar** : NestJS dev mode (`nest start --watch`) crashe quand trop de fichiers sont surveillés. Symptôme : le serveur compilé tourne encore mais ne hot-reload plus. Solution : relancer `yarn dev`, ou augmenter `ulimit -n`.
- **TypeScript dev mode** : si `tsgo -p tsconfig.json` échoue (typecheck), `nest start --watch` peut continuer à servir un vieux build. Toujours lancer `npx nx typecheck twenty-server` avant de blâmer le runtime.
- **Apollo cache stale après migration metadata** : régénérer les types via `npx nx run twenty-front:graphql:generate` et hard refresh navigateur (`Cmd+Shift+R`).
- **`junctionTargetFieldId` à recâbler** : tout nouveau M2M ajouté à `init-internal-entities` doit (1) appeler `ensureRelationField` sur les deux côtés, (2) appeler `updateOneField` pour poser `junctionTargetFieldId`. Sinon les filtres GQL planteront.

## Données réelles

- **CSV source :** `docs/opportunity.csv` (10 opportunités, **gitignoré**).
- **Mapping `Société` → InternalEntity :**
  - `WEKNOW` (8 lignes, 112 520 EUR)
  - `DEVBYSTEP` (1 ligne, 11 400 EUR)
  - `ALLSENSIA` (1 ligne, 1 500 EUR)
  - `ANGLE_INTELLIGENCE` (0 ligne ; seedée, jamais utilisée comme fallback)
- Validation locale **non concluante** sur seed Apple : aucun des 10 UUID du CSV n'existe dans ce seed, donc `init-internal-entities` reporte `50 opportunité(s) sans internalEntityId`. Validation finale se fera sur l'instance cible.

## Références

- Architecture technique : `docs/ARCHITECTURE.md`
- Roadmap + DoD par carte : `docs/ROADMAP.md`
- Conventions de code : `docs/CONVENTIONS.md`
- Workflow dev (commandes) : `docs/WORKFLOW.md`
- Checklist review : `docs/REVIEW.md`
- Règles non-négociables : `RULES.md`

---

> **Mainteneur :** mettre à jour la section "État d'avancement" à chaque merge de carte, et la section "Pièges connus" dès qu'un nouveau symptôme + remède est identifié.
