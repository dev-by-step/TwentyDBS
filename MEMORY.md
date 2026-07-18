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

### Variables d'environnement prod (Dokku app `twenty-dbs`)

Deux variables **env-only** (déclarées dans `ConfigVariables`, `ADVANCED_SETTINGS`) pilotent des contrats d'exploitation. Sans elles, le code utilise un fallback codé en dur identique → aucun changement de comportement, mais le grant/seed ne sont pas rejouables proprement.

- **`BOOTSTRAP_ADMIN_EMAILS`** — liste (séparée par virgules) des e-mails qui reçoivent `canAccessFullAdminPanel` + `canImpersonate` + rôle **Admin** à chaque connexion. **Doit correspondre exactement à l'e-mail de connexion** du compte, sinon le grant ne s'applique pas. Superadmin unique = **aline**. ⚠️ **Deux e-mails distincts selon l'environnement** : en **prod**, son vrai mail est **`aline@devbystep.fr`** ; `aline@weknow.dev` n'est **que le compte de test du dev-seeder local** (`database:reset`). Donc en prod on met `aline@devbystep.fr`. Sans la variable : aline garde ses droits (persistés en base) mais ils ne sont pas ré-appliqués sur nouvelle connexion / re-seed. Avant de poser la valeur, vérifier l'e-mail réel du compte : `SELECT email FROM core."user" WHERE "canAccessFullAdminPanel"=true;`.

  ```bash
  # PROD (vrai mail d'aline)
  dokku config:set twenty-dbs BOOTSTRAP_ADMIN_EMAILS=aline@devbystep.fr
  # LOCAL dev : le compte seedé est aline@weknow.dev (fallback codé en dur, rien à poser)
  ```

- **`INTERNAL_ENTITY_SEEDS`** — JSON des 4 sociétés (tableau OU `{ "entities": [...] }`), lu par `InternalEntityConfigurationService` → `init-internal-entities`. Chaque entité exige `id` (uuid), `name`, `color` (`#RRGGBB`), `aliases` optionnel. **Reprendre les IDs canoniques existants** (ci-dessous) pour éviter tout dédoublonnage/fusion. Guillemets simples obligatoires (les couleurs `#` seraient sinon des commentaires shell).
  ```bash
  dokku config:set twenty-dbs INTERNAL_ENTITY_SEEDS='[{"id":"550e8400-e29b-41d4-a716-446655440001","name":"WEKNOW","color":"#2563EB"},{"id":"550e8400-e29b-41d4-a716-446655440002","name":"DEVBYSTEP","color":"#16A34A"},{"id":"550e8400-e29b-41d4-a716-446655440003","name":"ALLSENSIA","color":"#D97706"},{"id":"550e8400-e29b-41d4-a716-446655440004","name":"ANGLE_INTELLIGENCE","color":"#7C3AED"}]'
  ```

`dokku config:set` **redémarre l'app** (l'entrypoint relance `init-internal-entities` au boot). Les deux peuvent être posées en un seul `config:set` (un seul redémarrage). Vérif : `dokku config:get twenty-dbs <VAR>`.

## Objectif métier

Permettre à un même workspace Twenty d'héberger 4 sociétés du groupe (`WEKNOW`, `DEVBYSTEP`, `ALLSENSIA`, `ANGLE_INTELLIGENCE`) avec :

- Isolation des données CRM par entité (Carte 3 + Carte 10).
- Partage explicite : multi-appartenance Person/Company (Carte 4).
- Calendrier inter-sociétés avec anonymisation des détails (Carte 5), vue groupe (Carte 6), couleur de l'entité responsable (Carte 7).
- Audience de calendrier per-event (Carte 10).

## État d'avancement (au 2026-06-02)

| Carte | Branche                               | Statut                                                                                                                    |
| ----- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 1     | `1-init-projet`                       | ✅ schéma + seed + hooks ; ⚠️ backfill CSV non vérifié sur prod                                                           |
| 2     | `2-identification-entite-source`      | ✅                                                                                                                        |
| 3     | `3-filtrage-vues-entites`             | ✅ (switch binaire Ma Société / Vue Groupe)                                                                               |
| 4     | `4-gestion-contacts-multi-societes`   | ✅                                                                                                                        |
| 5     | `5-anonymisation-calendrier-tiers`    | ✅                                                                                                                        |
| 6     | `6-visualisation-calendrier-groupe`   | ✅                                                                                                                        |
| 7     | `7-identification-porteur-calendrier` | ✅                                                                                                                        |
| 10    | `10-permissions-entites`              | ✅ deployé en prod sur https://20.devbystep.fr. Single-tenant + auto-activate + restriction signup + fix skip InviteTeam. |

## Décisions structurantes — déploiement et onboarding

- **Single-tenant** : `IS_MULTIWORKSPACE_ENABLED=false`. Le 1er signup crée le workspace `TwentyDBS` + auto-active (cf. `signUpOnNewWorkspace.activateWorkspace`). Les signups suivants rejoignent ce workspace via `signInUpOnExistingWorkspace`. Aucune UI de "création de workspace" n'est jamais affichée.
- **Auto-signup verrouillé au domaine du super admin** : `SignInUpService.assertEmailDomainAllowedForAutoSignUp` lookup `userRepository.findOne({ where: { canAccessFullAdminPanel: true } })`. Si un super admin existe, seul son domaine email peut s'auto-inscrire. Si aucun super admin (bootstrap), seul `BOOTSTRAP_ADMIN_EMAILS` (superadmin unique aline : `aline@devbystep.fr` en prod, `aline@weknow.dev` en dev-seed local) peut créer le 1er compte. Les invitations explicites continuent à bypass le check (via `signInUpWithPersonalInvitation`).
- **Skip InviteTeam pour non-admins** : nouvelle mutation `skipInviteTeamOnboardingStep` (NoPermissionGuard) + helper `advanceFromInviteTeamStep`. `InviteTeam.tsx` affiche un écran simplifié pour les users sans `WORKSPACE_MEMBERS` (un seul bouton Continue).
- **Bootstrap admin** : **superadmin unique = aline**. Décision produit (2026-07-18) : un seul superadmin, son mail officiel. **Prod = `aline@devbystep.fr`** (vrai mail) ; `aline@weknow.dev` = compte de test dev-seeder local uniquement. Donc `BOOTSTRAP_ADMIN_EMAILS=aline@devbystep.fr` en prod (voir « Variables d'environnement prod » ci-dessus). Aline obtient `canAccessFullAdminPanel=true` + `canImpersonate=true` + rôle Admin à son signup + onboarding superadmin pour configurer les InternalEntities. _(Ancien réglage à 2 e-mails abandonné.)_
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
- **relation-nested-queries.ts fix (réimplémenté et stabilisé le 2026-07-15)** : si un `connect` cible un ID inexistant (length === 0), la relation est mise à `null` au lieu de crasher ; length > 1 continue de lever `CONNECT_RECORD_NOT_FOUND`. Le fix est désormais effectif en runtime (`relation-nested-queries.ts:228-236`) et couvert par `relation-nested-queries.spec.ts`. Protège l'import standard contre les UUIDs de relation invalides dans le CSV.
- **Bouton "Import CSV" générique** : présent dans le menu Options (DefaultView + CustomView) pour **tous les objets**, pas seulement `opportunity`. Ouvre le dialog d'import standard.
- **Pas d'objet TypeORM custom pour `InternalEntity`** : tout passe par le Metadata Engine de Twenty (`ObjectMetadataService`, `FieldMetadataService`). Conséquence : `init-internal-entities` est la commande maîtresse pour recréer le schéma après toute évolution.
- **M2M Twenty = ONE_TO_MANY + junction object** : `Person ↔ InternalEntity` passe par `personEntityMembership` ; idem pour Company, WorkspaceMember, CalendarEvent (audience). Le filtre natif `<field>Id: { in: [...] }` n'est valide **que si** `junctionTargetFieldId` est positionné sur le champ ONE_TO_MANY.
- **Audience calendrier (Carte 10)** : choix `M2M dédiée` (`calendarEventEntityAudience`) plutôt que champ JSON, pour bénéficier du picker auto-généré et des filtres GQL natifs. Tradeoff accepté : nécessite de relancer `init-internal-entities` après pull.
- **Header HTTP `ACTIVE_INTERNAL_ENTITY_ID`** : la Vue Groupe = header absent → l'access policy n'applique aucun filtre en lecture. La Vue Société = header peuplé → filtre par entité active.
- **Pas de fallback par créateur dans le backfill historique** : si une `Opportunity` n'a pas de `Société` dans le CSV, elle reste sans `internalEntityId` et est signalée. Cela ne concerne que le backfill ; les permissions de mutation CRM courantes conservent un **fallback par créateur** (un user peut modifier ses propres enregistrements dans son entité même sans rôle entity manager, cf. `InternalEntityAccessPolicyService`).
- **Aline / `ANGLE_INTELLIGENCE`** : seedée comme InternalEntity mais absente du CSV (zéro opportunité). Ne pas l'utiliser comme fallback implicite.

## Session récente : Import CSV générique

- **Problème initial** : l'import UI standard ne remplit que name + amount + createdBy (les colonnes custom du CSV ignorées). `createdBy` = "System".
- **Approche abandonnée** (1ère tentative) : mutation `importOpportunitiesFromCsv` dédiée avec `ImportCsvService` en SQL raw + `ImportCsvOpportunitiesResolver`. Trop spécifique, duplique la logique existante.
- **Solution finale** : utiliser le dialog d'import standard `useOpenObjectRecordsSpreadsheetImportDialog` qui est déjà générique. Le fix `relation-nested-queries.ts` (skip connect si ID inexistant) protège contre les UUIDs de relation invalides.
- **Changements** :
  - `relation-nested-queries.ts` : `length !== 1` → `> 1` + si `length === 0`, set `null` au lieu de crasher.
  - `ObjectOptionsDropdownDefaultView.tsx` / `ObjectOptionsDropdownCustomView.tsx` : bouton "Import CSV" pour **tous les objets**, ouvre le dialog standard.
- **Fichiers supprimés** : `import-csv.service.ts`, `import-csv-opportunities.resolver.ts`, `import-csv-input.ts`, `import-csv-result.dto.ts`.
- **Fichiers modifiés** : `relation-nested-queries.ts`, `internal-entity.module.ts`, `ObjectOptionsDropdownDefaultView.tsx`, `ObjectOptionsDropdownCustomView.tsx`.

## Session récente : Refactoring du parsing CSV multi-entités (2026-07-15)

- **Problème** : `ImportCsvOpportunitiesParserService` mélangeait le parsing du backfill (`id`, `name`, `entityName`) avec des champs réservés à l'import complet (`amount`, `currency`, `companyId`, `personId`, `stage`). De plus, une `Société` en texte brut était silencieusement ignorée.
- **Solution** : séparation des responsabilités.
  - `ImportCsvOpportunitiesParserService` devient minimal : `CsvOpportunityRow = { id, name, entityName }`. Seules les colonnes `Id`, `Nom`, `Société` sont requises. `Société` doit être un tableau JSON non vide de chaînes ; tout autre format lève une erreur explicite.
  - `ImportCsvCommand` reprend son propre parsing complet (`FullCsvOpportunityRow`) et n'utilise plus le parser backfill. Il valide `Société` avec la même règle stricte.
- **Fichiers modifiés** : `import-csv-opportunities-parser.service.ts`, `import-csv.command.ts`, leurs specs, et les factories `csv-opportunity-row`, `opportunity-csv-fixture`, `internal-entity-test`.

## Pièges connus — production

- **Premier deploy** : `dokku enter twenty-dbs web -- yarn database:init:prod` n'est plus nécessaire (entrypoint corrigé pour détecter la DB vide via la table `core.keyValuePair`). Si on reset la DB en prod, le redeploy lance désormais l'init automatiquement.
- **Bootstrap d'une nouvelle instance Dokku** : `scripts/dokku/bootstrap-twenty.sh` doit pouvoir `dokku postgres:link` et `redis:link`. Si on l'a déjà lancé avant l'ajout des links (cas du VPS actuel), il faut les ajouter manuellement.
- **Init multi-entités après onboarding d'Aline** : actuellement à lancer à la main via `dokku enter twenty-dbs web -- yarn command:prod init-internal-entities`. À automatiser dans `activateWorkspace` ou via la complétion du superadmin setup.
- **GHA build GHCR (`cd-dokku-build.yaml`)** : push automatique sur GHCR mais Dokku build sur le VPS (pas de pull depuis registry). L'image GHCR sert de backup et de CI sanity check uniquement.

## Pièges connus — code

- **`Invalid filter : … doesn't have any "internalEntitiesId" field"`** : la métadonnée du workspace est incomplète (`junctionTargetFieldId` non posé). Relancer `init-internal-entities`. L'`InternalEntityAccessPolicyService` skippe désormais le filtre quand la metadata n'est pas prête, donc ça ne devrait plus planter — mais le filtrage par entité ne sera effectif qu'après init. Depuis le 2026-07-15, les résultats négatifs du cache de disponibilité expirent après 30 s (`NEGATIVE_AVAILABILITY_RECHECK_DELAY_MS`) : un `init-internal-entities` lancé contre un serveur vivant (ex. `dokku enter`) active le filtrage sans redémarrage.
- **`ObjectMetadataItemNotFoundError: calendarEventEntityAudience cannot be found"`** : même cause, côté front. Le modal `GroupCalendarCreateEventModal` gate désormais l'audience picker via `useObjectMetadataItems` ; les autres composants qui consomment cet objet doivent suivre la même règle.
- **EMFILE chez chokidar** : NestJS dev mode (`nest start --watch`) crashe quand trop de fichiers sont surveillés. Symptôme : le serveur compilé tourne encore mais ne hot-reload plus. Solution : relancer `yarn dev`, ou augmenter `ulimit -n`.
- **TypeScript dev mode** : si `tsgo -p tsconfig.json` échoue (typecheck), `nest start --watch` peut continuer à servir un vieux build. Toujours lancer `npx nx typecheck twenty-server` avant de blâmer le runtime.
- **Apollo cache stale après migration metadata** : régénérer les types via `npx nx run twenty-front:graphql:generate` et hard refresh navigateur (`Cmd+Shift+R`).
- **`junctionTargetFieldId` à recâbler** : tout nouveau M2M ajouté à `init-internal-entities` doit (1) appeler `ensureRelationField` sur les deux côtés, (2) appeler `updateOneField` pour poser `junctionTargetFieldId`. Sinon les filtres GQL planteront.
- **Header `x-spreadsheet-import-bypass-source-tagging` restreint (2026-07-15)** : le bypass du source tagging n'est honoré que pour les contextes serveur (API key, application) et pour les users platform admin / entity manager (`canBypassInternalEntitySourceTagging` dans `internal-entity-source-tagging.service.ts`). Le bypass s'applique symétriquement à `person`, `company` **et** `opportunity` ; pour un user standard le header est ignoré et le tagging normal s'applique.
- **Assignation explicite d'`internalEntityId` sur une Opportunity validée (2026-07-15)** : un user standard ne peut plus créer une opportunité avec `internalEntityId` (ou `internalEntity: { connect: { where: { id } } }`) pointant vers une entité qu'il n'a pas — `assertExplicitInternalEntityAssignmentsAllowed` dans `internal-entity-source-tagging.service.ts` compare la valeur explicite à `entityIds` (multi-appartenance). Platform admins et entity managers restent libres d'assigner n'importe quelle entité. Au passage, `extractRelationTargetId` a été extrait dans un util partagé (`query-hooks/utils/extract-relation-target-id.util.ts`) qui reconnaît désormais aussi la forme `connect.where.id` (le vrai format généré par GraphQL) — l'ancienne implémentation dans `InternalEntityAccessPolicyService` ne gérait que `connect.id`, jamais atteint en pratique côté membership (dead code, `isPlatformAdmin` court-circuite avant).
- **Dédoublonnage `InternalEntity` non destructif (2026-07-15)** : `seedInternalEntities` dans `init-internal-entities.command.ts` repointe désormais TOUTES les références (opportunity.internalEntityId, personEntityMembership, companyEntityMembership, workspaceMemberEntityMembership, calendarEventEntityAudience, core.calendarChannel.visibleInternalEntityIds) vers l'entité seed canonique avant de supprimer une InternalEntity dupliquée (même nom, ID différent — cas du superadmin qui crée une entité via l'onboarding avant que le seed tourne). Avant ce fix, seule `workspaceMemberEntityMembership` était repointée ; tout le reste perdait silencieusement son rattachement à chaque redeploy (l'entrypoint relance `init-internal-entities` à chaque boot).
- **Memberships soft-deleted non ressuscités (2026-07-15)** : `buildMembershipInsertQuery` (`internal-entity-source-tagging-sql.util.ts`) ne filtre plus `deletedAt IS NULL` dans son check `WHERE NOT EXISTS` — une ligne soft-deleted (détachement manuel par un admin) bloque désormais la ré-insertion, au lieu d'être recréée à chaque run de `init-internal-entities` ou de source tagging.
- **⚠️ Le filtrage en lecture par entité n'a fonctionné qu'à partir du 2026-07-15 (FIX-26)** : `isEntityScopeFieldAvailable` cherchait un champ `internalEntitiesId` (ou `internalEntityId`) comme entrée SÉPARÉE dans `objectMetadata.fields` — ce champ n'existe JAMAIS ainsi (c'est une clé de filtre virtuelle générée par le schéma GraphQL, pas une ligne de métadonnée). Le check échouait systématiquement pour `company`, ce qui rendait `isEntityScopeBootstrapAvailable` (et donc TOUT le filtrage en lecture, y compris opportunity) en panne permanente depuis l'origine de la fonctionnalité. **Conséquence : la vue « Ma Société » (header `x-active-internal-entity-id`) n'a jamais filtré quoi que ce soit en lecture — seules les écritures étaient réellement isolées.** Corrigé : la disponibilité repose désormais uniquement sur l'existence du champ relation (+ `junctionTargetFieldId` pour les M2M), sans lookup du filterField fantôme. Si un audit futur constate que la vue groupe et la vue société renvoient les mêmes résultats, vérifier D'ABORD que ce fix est toujours présent avant de chercher ailleurs.
- **Admins/entity managers bloqués en écriture cross-entité jusqu'au 2026-07-15 (FIX-27)** : dans `assertSingleMutationAllowed`, le check de correspondance d'entité s'exécutait avant le bypass `canManageEntityScopedRecords`, donc jamais atteint pour un admin voulant modifier un enregistrement hors de son entité active. Corrigé : le bypass est calculé et vérifié en premier pour les objets CRM scopés.
- **`database:reset` cassé par le dev-seeder jusqu'au 2026-07-15 (FIX-28)** : `seedChatThreads` (`seed-agents.util.ts`) insérait `userWorkspaceId: ''` dans une colonne `uuid NOT NULL` → tout reset de DB fraîche échouait avant même la création du schéma workspace, bloquant toute la suite d'intégration. Corrigé (utilise `USER_WORKSPACE_DATA_SEED_IDS.JONY`). Si `nx database:reset` échoue à nouveau sur ce point précis, vérifier que ce fix n'a pas été perdu lors d'une synchro upstream.
- **Suite d'intégration bout-en-bout pour l'isolation par entité (IMP-17, 2026-07-15)** : `packages/twenty-server/test/integration/graphql/suites/internal-entity-isolation.integration-spec.ts` — 16 tests contre une vraie DB Postgres, sans mocks. C'est cette suite qui a découvert FIX-26/27/28. Pour la relancer : `NODE_ENV=test npx nx jest twenty-server --config=./jest-integration.config.ts --testPathPatterns="internal-entity-isolation"` (nécessite un `nx database:reset` préalable et un `nx build twenty-server` à jour, car `runInitInternalEntities()` shell-out sur `dist/command/command.js` — `InitInternalEntitiesCommand` vit dans le module CLI, pas dans l'AppModule HTTP du serveur de test, donc `global.app.get()` ne le trouve pas).
- **Migration du nommage hérité `entiteInterne` (FIX-30, 2026-07-16)** : les workspaces provisionnés par une ancienne version du fork portent des champs de relation nommés `entiteInterne` (label français camelCasé) au lieu d'`internalEntity` — `init-internal-entities` échouait en `Champ introuvable` avant tout seed. Corrigé : `renameLegacyInternalEntityRelationFields` (migration SQL idempotente via `internal-entity-legacy-field-migration.util.ts`) tourne en tête de `runSeedForWorkspace`, avant `ensureMetadataSchema`. Le `joinColumnName` de ces champs est déjà `internalEntityId` → renommage purement metadata, pas de migration physique. **Prod** : le prochain déploiement (entrypoint relançant `init`) migrera automatiquement 20.devbystep.fr si elle porte l'ancien nommage. Si un autre alias historique apparaît, l'ajouter à `LEGACY_INTERNAL_ENTITY_RELATION_FIELD_NAMES`.
- **Wizard superadmin idempotent (FIX-29, 2026-07-16)** : la soumission de `SuperadminWorkspaceSetup.tsx` récupère désormais les erreurs duplicate — `createInternalEntity` réutilise le `conflictingRecordId` renvoyé par le serveur (`handleDuplicateKeyError` attache `conflictingRecordId`/`conflictingObjectNameSingular` aux violations d'unicité, y compris les index SQL) et la création de membership ignore les duplicates (index unique IMP-06). Pattern réutilisable : `getRecoverableDuplicateRecordId.ts` (module onboarding front). Pour re-déclencher le wizard en test local : supprimer le userVar `ONBOARDING_SUPERADMIN_WORKSPACE_SETUP_STATE` en base (le calcul serveur du statut d'onboarding ne regarde QUE l'absence de STATE, pas le flag PENDING). Mot de passe des users dev seedés : voir `.claude/dev-credentials.local.md` (gitignoré).
- **Index/contraintes de jonction complétés (IMP-06, 2026-07-15)** : `internal-entity-membership-integrity-sql.util.ts` couvre maintenant les 4 jonctions InternalEntity (`companyEntityMembership`, `personEntityMembership`, `workspaceMemberEntityMembership`, `calendarEventEntityAudience`) — dédup + index unique partiel composite `(source, internalEntityId)` + nouvel index simple `internalEntityId` seul (indispensable pour les filtres `{internalEntityId: {in:...}}` de l'access-policy, l'index composite ayant la colonne source en tête). `opportunity.internalEntityId` (FK directe) a aussi son index simple. `calendarEventPersonAudience` est hors périmètre (jonction calendarEvent↔workspaceMember, pas de colonne `internalEntityId`). **Piège opérateur** : la commande d'upgrade `2-1-workspace-command-1780000006000-deduplicate-internal-entity-memberships.command.ts` est enregistrée par timestamp (`@RegisteredWorkspaceCommand('2.1.0', 1780000006000)`) — un workspace déjà passé par la version 2.1.0 avant cette extension ne rejouera pas automatiquement les nouvelles étapes ; relancer manuellement `nx run twenty-server:command -- upgrade:2-1:deduplicate-internal-entity-memberships` (ou `init-internal-entities`) sur ce workspace si besoin. Toutes les étapes sont idempotentes.

## Données réelles

- **CSV source :** `docs/opportunity.csv` (10 opportunités, **gitignoré**).
- **Mapping `Société` → InternalEntity :**
  - `WEKNOW` (8 lignes, 112 520 EUR)
  - `DEVBYSTEP` (1 ligne, 11 400 EUR)
  - `ALLSENSIA` (1 ligne, 1 500 EUR)
  - `ANGLE_INTELLIGENCE` (0 ligne ; seedée, jamais utilisée comme fallback)
- Validation locale **non concluante** sur seed Apple : aucun des 10 UUID du CSV n'existe dans ce seed, donc `init-internal-entities` reporte `50 opportunité(s) sans internalEntityId`. Validation finale se fera sur l'instance cible.

## Références

- Backlog des audits (bugs + améliorations, statuts) : `docs/AUDIT-BACKLOG.md`
- Architecture technique : `docs/ARCHITECTURE.md`
- Roadmap + DoD par carte : `docs/ROADMAP.md`
- Conventions de code : `docs/CONVENTIONS.md`
- Workflow dev (commandes) : `docs/WORKFLOW.md`
- Checklist review : `docs/REVIEW.md`
- Règles non-négociables : `RULES.md`

---

> **Mainteneur :** mettre à jour la section "État d'avancement" à chaque merge de carte, et la section "Pièges connus" dès qu'un nouveau symptôme + remède est identifié.
