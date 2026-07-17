# AUDIT-BACKLOG.md — Suivi des correctifs et améliorations

> **Source de vérité du backlog technique issu des audits du fork multi-entités.**
> Périmètre : uniquement le code spécifique au fork (diff vs `twentyhq/twenty` upstream).
> Dernier audit complet : 2026-07-15.

---

## 📖 Mode d'emploi (humain ou agent IA)

Ce fichier est **dynamique** : il doit être mis à jour à chaque fois qu'un item est corrigé, invalidé ou découvert.

### Règles de mise à jour

1. **Les IDs sont stables et ne se réutilisent jamais** (`FIX-XX` = bug/incohérence, `IMP-XX` = amélioration). Un nouvel item prend le prochain numéro libre de sa série.
2. **Statuts autorisés** : `A_FAIRE` · `EN_COURS` · `FAIT` · `INVALIDE` (faux positif) · `REPORTE` (décision explicite de ne pas traiter).
3. Quand un item passe à `FAIT` : renseigner la date, les fichiers modifiés et la vérification effectuée (tests, typecheck). Ne pas supprimer l'entrée.
4. Quand un item est découvert : l'ajouter dans la bonne série avec sévérité, axe, fichiers, symptôme concret et piste de correction.
5. Avant de corriger un item : **relire le code cible** — ce fichier reflète l'état au moment de l'audit, le code a pu évoluer.
6. Après toute correction : `npx nx typecheck twenty-server` (et/ou `twenty-front`), tests ciblés, oxlint + prettier sur les fichiers touchés, puis mettre à jour ce fichier **et** `MEMORY.md` si la correction change une décision structurante.
7. Contraintes projet (voir `RULES.md`) : pas de commit sur `main` sans approbation, pas d'attribution IA dans les commits, Gitmoji + français impératif.

### Légende sévérité / axe

- Sévérité : 🔴 Critique · 🟠 Important · 🟡 Modéré · ⚪ Mineur
- Axe : `SEC` sécurité · `PERF` performance · `SCAL` scalabilité · `MAINT` maintenabilité · `UX` expérience utilisateur · `DATA` intégrité des données · `DOC` documentation

---

## 📊 Tableau de bord

| Série                     | Fait | À faire | Total |
| ------------------------- | ---- | ------- | ----- |
| FIX (bugs / incohérences) | 28   | 2       | 30    |
| IMP (améliorations)       | 18   | 3       | 21    |

> `FAIT` FIX : 01→18, 20→24, 26→30.
> `FAIT` IMP : 01→13, 16→20.
> Nouveaux findings du test end-to-end du 2026-07-16 : FIX-29 (corrigé le jour même), FIX-30 (métadonnées héritées `entiteInterne` — corrigé le 2026-07-16).

---

## 🧭 Feuille de route priorisée (items restants)

> Ordre de traitement recommandé. **Règle d'or : les failles de sécurité d'abord, puis l'intégrité des données, puis l'UX bloquante, puis la perf, puis la dette de maintenabilité, puis l'hygiène.** Chaque item pointe vers sa fiche détaillée plus bas.

### 🥇 Priorité 1 — Sécurité (à traiter en premier)

| ID  | Axe | Résumé |
| --- | --- | ------ |

### 🥈 Priorité 2 — Intégrité des données & UX bloquante

| ID     | Axe   | Résumé                                                         |
| ------ | ----- | -------------------------------------------------------------- |
| IMP-21 | 🟡 UX | Aucun récap des relations ignorées à l'import CSV (silencieux) |

### 🥉 Priorité 3 — Performance / Scalabilité

| ID     | Axe          | Résumé                                                                      |
| ------ | ------------ | --------------------------------------------------------------------------- |
| FIX-19 | 🟡 PERF/SCAL | Filtres `in: [ids…]` construits en chargeant des tables entières en mémoire |

### 🏅 Priorité 4 — Maintenabilité (dette technique)

| ID     | Axe      | Résumé                                                                       |
| ------ | -------- | ---------------------------------------------------------------------------- |
| IMP-14 | 🟠 MAINT | Découper les 2 fichiers géants (access-policy 1679 l., init-command 1950 l.) |
| IMP-15 | 🟡 MAINT | Découper `SuperadminWorkspaceSetup.tsx` (956 lignes)                         |

### 🎗️ Priorité 5 — Mineurs / hygiène

| ID     | Axe      | Résumé                                                          |
| ------ | -------- | --------------------------------------------------------------- |
| FIX-21 | ⚪ MAINT | `validate*Payload` sans `executeInWorkspaceContext`             |
| FIX-25 | ⚪ MAINT | Hygiène git : `.codex/`, `AGENTS.md`, snapshots Jest à trancher |

---

## 🐛 Série FIX — Bugs et incohérences (audit du 2026-07-15)

### ✅ Corrigés

#### FIX-01 — Fix `relation-nested-queries` inexistant (connect vers ID inconnu = crash) — `FAIT` (2026-07-15)

- **Sévérité/Axe** : 🔴 `DATA`
- **Fichiers** : `packages/twenty-server/src/engine/twenty-orm/field-operations/relation-nested-queries/relation-nested-queries.ts`
- **Problème** : le commit `f3c385d05c` annonçait « set null au lieu de crash » mais ne modifiait que le spec. Un `connect` vers un ID inexistant faisait échouer toute la mutation (import CSV cassé).
- **Correction** : 0 correspondance → relation mise à `null` ; >1 → erreur `CONNECT_RECORD_NOT_FOUND` conservée.
- **Vérif** : spec `relation-nested-queries.spec.ts` (3 cas), typecheck OK.

#### FIX-02 — Cache de disponibilité metadata jamais invalidé (isolation restait désactivée) — `FAIT` (2026-07-15)

- **Sévérité/Axe** : 🔴 `SEC`
- **Fichiers** : `packages/twenty-server/src/modules/internal-entity/query-hooks/services/internal-entity-access-policy.service.ts`
- **Problème** : `entityScopeFieldAvailabilityByKey` cachait `false` jusqu'au redémarrage. Un `init-internal-entities` via `dokku enter` n'activait jamais le filtrage sur le process web vivant → lecture inter-entités non filtrée.
- **Correction** : résultats négatifs expirés après 30 s (`NEGATIVE_AVAILABILITY_RECHECK_DELAY_MS`), positifs cachés à vie.
- **Vérif** : spec access-policy (43 tests), typecheck OK.

#### FIX-03 — Header client `x-spreadsheet-import-bypass-source-tagging` sans contrôle de rôle — `FAIT` (2026-07-15)

- **Sévérité/Axe** : 🔴 `SEC`
- **Fichiers** : `packages/twenty-server/src/modules/internal-entity/query-hooks/internal-entity-source-tagging.service.ts`
- **Problème** : tout utilisateur authentifié pouvait poser ce header et créer des Person/Company sans rattachement d'entité (hors modèle d'isolation).
- **Correction** : `canBypassInternalEntitySourceTagging` — bypass honoré seulement pour contextes serveur (API key, application) et users platform admin / entity manager.
- **Vérif** : spec source-tagging, typecheck OK.

#### FIX-04 — Assignation d'une opportunité à une entité arbitraire — `FAIT` (2026-07-15)

- **Sévérité/Axe** : 🔴 `SEC`
- **Fichiers** : `internal-entity-source-tagging.service.ts`, nouvel util `query-hooks/utils/extract-relation-target-id.util.ts`
- **Problème** : un `internalEntityId` explicite (ou `internalEntity.connect.where.id`) était accepté sans vérifier l'appartenance de l'utilisateur à l'entité cible.
- **Correction** : `assertExplicitInternalEntityAssignmentsAllowed` compare à `entityIds` (multi-appartenance) ; admins/entity managers exemptés. L'util partagé reconnaît `connect.where.id` (vrai format GraphQL) en plus de `connect.id` et du join column.
- **Vérif** : 19 tests source-tagging, typecheck OK.

#### FIX-05 — Dédoublonnage `InternalEntity` destructif dans `init-internal-entities` — `FAIT` (2026-07-15)

- **Sévérité/Axe** : 🔴 `DATA`
- **Fichiers** : `packages/twenty-server/src/modules/internal-entity/commands/init-internal-entities.command.ts`
- **Problème** : la suppression d'une entité dupliquée (même nom qu'un seed, ID différent) ne re-pointait que `workspaceMemberEntityMembership` — opportunités, memberships person/company, audiences calendrier et `calendarChannel.visibleInternalEntityIds` perdaient leur rattachement.
- **Correction** : `mergeDuplicateInternalEntities` re-pointe toutes les références (avec dédoublonnage des paires déjà existantes) avant le DELETE.
- **Vérif** : spec init-command (12 tests), typecheck OK.

#### FIX-06 — Memberships soft-deleted ressuscités à chaque boot — `FAIT` (2026-07-15)

- **Sévérité/Axe** : 🔴 `DATA`
- **Fichiers** : `packages/twenty-server/src/modules/internal-entity/query-hooks/utils/internal-entity-source-tagging-sql.util.ts`
- **Problème** : le `WHERE NOT EXISTS` filtrait `deletedAt IS NULL` → un détachement manuel (soft delete) était recréé au run suivant (l'entrypoint relance `init-internal-entities` à chaque boot).
- **Correction** : le check d'existence ignore désormais `deletedAt` — une ligne soft-deleted bloque la réinsertion.
- **Vérif** : nouveau spec `internal-entity-source-tagging-sql.util.spec.ts`, typecheck OK.

#### FIX-26 — Le filtrage en lecture par entité n'a jamais fonctionné (bug fondamental de `isEntityScopeFieldAvailable`) — `FAIT` (2026-07-15, trouvé en écrivant IMP-17)

- **Sévérité/Axe** : 🔴 `SEC` — le plus grave finding de tout l'audit.
- **Fichiers** : `packages/twenty-server/src/modules/internal-entity/query-hooks/services/internal-entity-access-policy.service.ts`
- **Problème** : `isEntityScopeFieldAvailable` cherchait un champ nommé `internalEntitiesId` (`filterFieldName`) dans `objectMetadata.fields` pour valider la disponibilité du scoping sur `company`/`person`. Ce nom ne correspond à AUCUNE ligne réelle de métadonnée — c'est une clé de filtre virtuelle calculée à la volée par le générateur de schéma GraphQL pour les relations ONE_TO_MANY, jamais une entrée listée. Le check échouait donc **systématiquement** pour `company`, qui fait partie des 5 objets requis par `isEntityScopeBootstrapAvailable` → le bootstrap entier restait `false` en permanence → `canApplyEntityScopeFilter` renvoyait `false` pour absolument tous les objets, y compris `opportunity` (qui a son propre problème symétrique, voir ci-dessous). **Conséquence concrète : le header `x-active-internal-entity-id` (vue « Ma Société ») n'a jamais filtré quoi que ce soit — un utilisateur voyait toujours les données de toutes les entités en lecture, quel que soit le toggle front.** Seule l'écriture (create/update/delete) était réellement isolée.
- **Découverte** : mise en évidence uniquement via la suite d'intégration bout-en-bout (IMP-17) — tous les mocks unitaires existants injectaient artificiellement un faux champ `internalEntitiesId` dans leurs fixtures, masquant le bug depuis l'origine.
- **Correction** : pour les relations ONE_TO_MANY/junction (`requiresJunctionTargetFieldId: true`), le signal de disponibilité est désormais uniquement « le champ relation existe ET `junctionTargetFieldId` est posé » — sans lookup du filterField fantôme. Pour les relations MANY_TO_ONE (`opportunity`, `*EntityMembership`), même correction : le join column (`internalEntityId`) n'est lui non plus jamais une entrée de métadonnée séparée, donc seul `field` existant est vérifié. Le champ `filterFieldName`, devenu mort, a été retiré du type `EntityScopeFieldRequirement`.
- **Vérif** : 57 tests unitaires (dont 2 nouveaux couvrant explicitement le cas junction complet vs incomplet vs absent) + 16 tests d'intégration bout-en-bout (`internal-entity-isolation.integration-spec.ts`) vérifiant le filtrage réel via HTTP/GraphQL sur une DB Postgres réelle, typecheck OK.

#### FIX-27 — Les admins/entity managers ne pouvaient pas muter des enregistrements hors de leur entité active — `FAIT` (2026-07-15, trouvé en écrivant IMP-17)

- **Sévérité/Axe** : 🔴 `SEC`
- **Fichiers** : `packages/twenty-server/src/modules/internal-entity/query-hooks/services/internal-entity-access-policy.service.ts` (`assertSingleMutationAllowed`)
- **Problème** : le check de correspondance d'entité (`recordSummary.entityIds.includes(activeEntityId)`) s'exécutait et levait `PERMISSION_DENIED` **avant** le bypass `canManageEntityScopedRecords` réservé aux platform admins/entity managers — ce bypass n'était donc jamais atteint pour une mutation cross-entité. Contredit directement le design documenté (les entity managers/admins doivent pouvoir gérer toutes les entités) et le pattern déjà correct utilisé ailleurs dans le même service (`assertMembershipCreateTargetsCurrentEntity`).
- **Correction** : le bypass (`canBypassEntityMatchForCrmObject`) est désormais calculé et vérifié **avant** le check d'entité, qui devient conditionnel à son absence — inchangé pour les objets non-CRM (internalEntity, memberships) où l'admin bypass existant en tête de fonction s'applique déjà.
- **Vérif** : test d'intégration « allows the privileged user to update an opportunity in an entity they do not belong to » (échouait avant le fix, passe après), 57 tests unitaires, typecheck OK.

#### FIX-28 — Le dev-seeder insérait une chaîne vide dans une colonne UUID NOT NULL, cassant tout `database:reset` — `FAIT` (2026-07-15, trouvé en écrivant IMP-17)

- **Sévérité/Axe** : 🟠 `MAINT`/`DATA` — bloquait toute la suite d'intégration (pas de faille de sécurité en soi).
- **Fichiers** : `packages/twenty-server/src/engine/workspace-manager/dev-seeder/core/utils/seed-agents.util.ts`
- **Problème** : `seedChatThreads` insérait `userWorkspaceId: ''` (chaîne vide) alors que la colonne est `uuid NOT NULL` sur `core.agentChatThread` → `nx database:reset` échouait systématiquement sur un nouvel environnement, avant même que le schéma workspace ne soit créé. Non lié au fork multi-entités (fonctionnalité agents IA), mais bloquait la validation de TOUT le reste.
- **Correction** : utilise désormais `USER_WORKSPACE_DATA_SEED_IDS.JONY` (l'admin du workspace seedé) comme propriétaire du thread par défaut.
- **Vérif** : `nx database:reset` complet sans erreur, suite d'intégration exécutée avec succès sur la DB fraîchement seedée.

### 🟠 À faire — Importants

#### FIX-07 — Le backfill CSV écrase les corrections manuelles à chaque boot — `FAIT` (2026-07-16, constaté)

- **Constat** : le `UPDATE` de `updateOpportunitiesInternalEntity` garde `AND opportunity."internalEntityId" IS NULL` — une opportunité déjà rattachée (CSV ou réassignation manuelle) n'est jamais réécrite. Bug résolu.

- **Sévérité/Axe** : 🟠 `DATA`
- **Fichiers** : `init-internal-entities.command.ts` (`updateOpportunitiesInternalEntity`)
- **Problème** : `UPDATE … WHERE internalEntityId IS DISTINCT FROM csv_values` — toute réassignation manuelle d'une opportunité listée dans le CSV est annulée au redeploy suivant.
- **Piste** : ne backfiller que si `internalEntityId IS NULL`, ou marquer les opportunités migrées (colonne / userVar) pour ne les traiter qu'une fois.

#### FIX-08 — Fallback par créateur contredit la décision documentée — `FAIT` (2026-07-16, décision produit)

- **Sévérité/Axe** : 🟠 `DOC`/`DATA`
- **Fichiers** : `init-internal-entities.command.ts`, `docs/ARCHITECTURE.md`
- **Décision** : **aucun fallback par créateur** (option retenue). Vérifié en code : plus aucune inférence de `internalEntityId` depuis `createdBy`/`owner` dans `init-internal-entities.command.ts` (grep vide). Une opportunité sans correspondance CSV reste `NULL`. Doc `ARCHITECTURE.md` réalignée en conséquence (voir FIX-24). Code et doc désormais cohérents.

#### FIX-09 — Page Calendrier Groupe crashe si metadata absente — `FAIT` (2026-07-16)

- **Sévérité/Axe** : 🟠 `UX`
- **Fichiers** : `packages/twenty-front/src/modules/activities/group-calendar/hooks/useCurrentUserEntityIds.ts`
- **Problème** : `useCurrentUserEntityIds` appelait `useFindManyRecords('workspaceMemberEntityMembership')`, dont le `useObjectMetadataItem` interne **throw `ObjectMetadataItemNotFoundError` au mount** (indépendamment de `skip`) tant que `init-internal-entities` n'a pas tourné → crash de toute la page Calendrier Groupe. Un simple `skip` ne suffit pas (le throw précède le skip).
- **Correction** : réécriture sur le pattern IMP-19 (`useSelectableInternalEntities`) — requête construite manuellement via `generateFindManyRecordsQuery` **seulement si** la métadonnée existe (sinon requête placebo `currentUser { id }`), `skip` sur absence de métadonnée / membre / permission de lecture. Hooks toujours appelés inconditionnellement (Rules of Hooks). Fallback `user.entityId` conservé.
- **Vérif** : `npx nx typecheck twenty-front` OK.

#### FIX-10 — Confidentialité calendrier : code ≠ commentaire ≠ spec — `FAIT` (2026-07-16)

- **Décision produit** : le propriétaire du compte connecté voit TOUJOURS ses propres événements.
- **Correction** : `calendar-privacy.service.ts` construit désormais `ownerWorkspaceMemberIdsByCalendarEventId` et, en tête d'arbitrage (juste après le check WORKSPACE_PUBLIC), démasque inconditionnellement si `currentWorkspaceMemberId` est propriétaire de l'événement — avant toute règle d'entité/audience/visibilité de canal. Ordre d'arbitrage re-documenté (public > propriétaire > audience explicite > entité propriétaire > visibilité canal > masqué).
- **Vérif** : nouveau test « should never mask a calendar event for its connected-account owner » (canal excluant explicitement l'entité du propriétaire) — spec privacy 25/25.

- **Sévérité/Axe** : 🟠 `SEC`/`DOC`
- **Fichiers** : `packages/twenty-server/src/modules/calendar/common/services/calendar-privacy.service.ts` (~l.372-407), `docs/ARCHITECTURE.md`
- **Problème** : (a) une `visibleInternalEntityIds` de channel excluant l'entité propriétaire masque les événements aux membres de l'entité owner — y compris potentiellement au propriétaire — alors que le commentaire affirme le contraire ; (b) l'ordre implémenté (liste channel > entité owner > audience) ≠ l'arbitrage documenté (public > audience > carte 5).
- **Piste** : garantir « owner voit toujours ses propres événements » (check viewer == owner du connected account), puis aligner doc et code sur un seul ordre.

#### FIX-11 — Permissions calendrier contournables via la forme `connect` — `FAIT` (2026-07-16)

- **Sévérité/Axe** : 🟠 `SEC`
- **Fichiers** : `packages/twenty-server/src/modules/calendar/common/query-hooks/calendar-event/services/calendar-event-mutation-permission.service.ts` (+ spec)
- **Problème** : le contrôle n'était fait que si `calendarChannelId`/`calendarEventId` était extractible du payload ; la forme `connect` a été couverte par `extractRelationTargetId` (déjà branché), mais un payload **sans référence extractible** (forme d'input inconnue, relation absente) sautait encore silencieusement la vérification — le vecteur de contournement restant.
- **Correction** : refus systématique quand aucune référence n'est extractible — `validateCreatePayload` : association → liste vide passée à `assertCalendarChannelMutationAllowed` (qui refuse les listes vides, avec audit `empty-calendar-channel-ids`) ; participant → `throwPermissionDenied` (`missing-calendar-event-reference`). `validateCreateManyPayload` : contrôle **par ligne** — une seule ligne du batch sans référence invalide tout le batch.
- **Vérif** : 4 nouveaux tests de refus (one/many × association/participant, avec rôle entity manager pour prouver que c'est bien le payload qui est refusé) — suite calendrier 38/38.

#### FIX-12 — Merge/doublons impossibles sur enregistrements multi-entités — `FAIT` (2026-07-16, constaté)

- **Constat** : `validateMergeManyPayload`/`validateFindDuplicatesPayload` exigent désormais `entityIds.includes(activeEntityId)` (au lieu de l'ancienne exclusivité `some(id !== activeEntityId)`) — un record partagé entre entités est accepté dès qu'il inclut l'entité active. Bug résolu.

- **Sévérité/Axe** : 🟠 `UX`
- **Fichiers** : `internal-entity-access-policy.service.ts` (`validateMergeManyPayload`, `validateFindDuplicatesPayload`)
- **Problème** : `entityIds.some(id => id !== activeEntityId)` rejette tout record partagé entre entités (Carte 4). Message d'erreur trompeur.
- **Piste** : exiger `entityIds.includes(activeEntityId)` au lieu de l'exclusivité (décider du comportement pour les managers).

#### FIX-13 — Restriction signup mono-domaine vs 4 sociétés — `FAIT` (2026-07-16, décision produit)

- **Décision** : **invitation uniquement** pour les 3 autres sociétés (statu quo conservé volontairement). Aucun changement de code ; comportement documenté. Les membres de DEVBYSTEP/ALLSENSIA/ANGLE_INTELLIGENCE rejoignent le workspace sur invitation d'un admin (ou via un domaine listé dans `BOOTSTRAP_ADMIN_EMAILS`). Se combine avec IMP-12 (durcissement anti-énumération).

- **Sévérité/Axe** : 🟠 `SEC`/`UX`
- **Fichiers** : `packages/twenty-server/src/engine/core-modules/auth/services/sign-in-up.service.ts` (`assertEmailDomainAllowedForAutoSignUp`)
- **Problème** : seul le domaine email du premier super admin peut s'auto-inscrire — les 3 autres sociétés passent obligatoirement par invitation.
- **Piste** : liste de domaines autorisés en variable d'env (un par société), ou assumer le modèle « invitation only » et documenter.

#### FIX-14 — `skipInviteTeamOnboardingStep` modifie l'onboarding de tout le workspace — `FAIT` (2026-07-16)

- **Sévérité/Axe** : 🟠 `SEC`/`UX`
- **Décision produit** : drapeaux d'onboarding au niveau UTILISATEUR.
- **Fichiers** : `onboarding.service.ts` (+ spec), `onboarding.resolver.ts` (+ spec), `sign-in-up.service.ts`, `workspace-invitation.service.ts`.
- **Problème** : `setOnboardingInviteTeamPending` et `setOnboardingBookOnboardingPending` écrivaient des userVars **workspace-level** (userId nul). Comme `getAll` fusionne le scope workspace partagé, un seul utilisateur qui passait/complétait l'étape « inviter l'équipe » basculait l'onboarding de TOUS les membres. (Codex avait déjà ajouté un garde superadmin sur la mutation `skip`, mais le drapeau restait partagé.)
- **Correction** : les deux setters + `advanceFromInviteTeamStep` prennent désormais un `userId` et écrivent en scope user (userId + workspaceId), comme `setOnboardingConnectAccountPending`. Les 5 call sites passent l'utilisateur acteur : sign-up (`user.id`), envoi d'invitations (`sender.userId`), setup superadmin (`user.id`), `skipBookOnboardingStep`/`skipInviteTeamOnboardingStep` (`@AuthUser`). Le nettoyage book-onboarding dans `getOnboardingStatus` est aussi passé user-level.
- **Caveat migration** : un éventuel drapeau workspace-level _hérité_ (posé par l'ancien code avant déploiement) resterait lisible via le scope partagé de `getAll` jusqu'à expiration ; sans impact sur un workspace fraîchement seedé (cas local + prod déjà onboardée). Pas de migration dédiée jugée nécessaire.
- **Vérif** : `advanceFromInviteTeamStep` scoped-user (spec) + specs resolver/sign-in-up/invitation verts (24/24 sur le périmètre) ; typecheck OK.

#### FIX-29 — Wizard superadmin non idempotent : bloque sur un workspace déjà seedé — `FAIT` (2026-07-16)

- **Sévérité/Axe** : 🟠 `UX`/`DATA`
- **Fichiers** : `packages/twenty-front/src/modules/onboarding/components/SuperadminWorkspaceSetup.tsx`, nouvel util `packages/twenty-front/src/modules/onboarding/utils/getRecoverableDuplicateRecordId.ts` (+ spec, 8 tests).
- **Problème** (observé en conditions réelles) : à la soumission de l'étape « Set up your workspace », le wizard envoyait une mutation **`createInternalEntity` par entité de base sans id de draft** (IDs fixes `550e8400-…`). Si les entités existaient déjà (workspace dev seedé, re-run de l'onboarding, lecture initiale vide pour cause de cache/permissions), chaque mutation échouait avec `"A duplicate entry was detected"` et **le wizard restait bloqué**. Dégât constaté en base avant correction : 3 entités **dupliquées** (même nom, IDs aléatoires) créées par une soumission concurrente.
- **Correction** : le serveur est traité comme l'autorité —
  1. `createOrReuseInternalEntity` : le `createInternalEntity` est enveloppé ; en cas d'erreur duplicate portant `conflictingRecordId` + `conflictingObjectNameSingular === 'internalEntity'` (extensions posées par `handleDuplicateKeyError` côté serveur), l'ID en conflit est **réutilisé** comme entité persistée au lieu d'échouer.
  2. Création de membership tolérante : un duplicate (y compris via l'index unique composite IMP-06, sans `conflictingRecordId` résolu) est ignoré — l'état désiré est déjà atteint (`isDuplicateRecordError`, détection par le message technique stable `A duplicate entry was detected`).
  3. Logique extraite dans `getRecoverableDuplicateRecordId.ts` (le composant fait déjà 956+ lignes, cf. IMP-15), unit-testée.
- **Vérifié en conditions réelles** : wizard re-déclenché sur le workspace contenant déjà 7 entités (4 seeds + 3 doublons hérités du bug) → soumission **réussie**, passage à l'étape « Invite your team », `completeSuperadminWorkspaceSetup` 200, **aucun nouveau doublon** (7 entités avant/après), state re-sauvegardé avec l'ID seed correct pour WEKNOW, flag PENDING nettoyé.
- **Reste (hors périmètre de ce fix)** : (1) ~~les 3 doublons créés par le bug avant correction~~ → **fusionnés le 2026-07-16** par `mergeDuplicateInternalEntities` (FIX-05) lors du run d'`init-internal-entities` débloqué par FIX-30 (`INTERNAL_ENTITY_MERGE` ×3 tracés par l'audit logger IMP-11, 4 entités seed restantes vérifiées en base) ; (2) une contrainte d'unicité serveur sur `internalEntity.name` serait la garantie structurelle contre les doublons même-nom/ID-différent ; (3) incohérence mineure : le calcul serveur du statut d'onboarding ignore le flag `PENDING` et ne regarde que l'absence de `STATE` (`isSuperadminWorkspaceSetupRequired`), alors que le front teste les deux.
- **Vérif** : `jest getRecoverableDuplicateRecordId.test.ts` → 8/8 ; `npx nx typecheck twenty-front` OK ; oxlint --type-aware + prettier OK ; test end-to-end réel dans l'UI (ci-dessus).

#### FIX-30 — Métadonnées héritées `entiteInterne` jamais migrées → `init-internal-entities` échoue — `FAIT` (2026-07-16)

- **Sévérité/Axe** : 🟠 `DATA`/`MAINT`
- **Fichiers** : nouvel util `packages/twenty-server/src/modules/internal-entity/utils/internal-entity-legacy-field-migration.util.ts` (+ spec, 5 tests), `packages/twenty-server/src/modules/internal-entity/commands/init-internal-entities.command.ts` (nouvelle méthode `renameLegacyInternalEntityRelationFields`, appelée **avant** `ensureMetadataSchema`).
- **Problème** (observé en conditions réelles) : sur un workspace provisionné par une **ancienne version du fork**, les champs de relation vers l'entité interne portaient le nom camelCasé du label français (« Entité interne » → **`entiteInterne`**) alors que le code actuel cherche **`internalEntity`** : `findFieldId('personEntityMembership', 'internalEntity')` levait `Champ introuvable` et toute la commande échouait avant le seed/backfill/index. Constaté sur `personEntityMembership`, `companyEntityMembership`, `calendarEventEntityAudience`.
- **Correction** : migration SQL idempotente exécutée en tête de `runSeedForWorkspace` (même pattern que `normalizeInternalEntityMetadataLabels`) — `UPDATE core."fieldMetadata" SET name='internalEntity'` pour tout champ RELATION à nom hérité (`entiteInterne`, liste extensible) sur les 5 objets porteurs (4 jonctions + `opportunity`), **uniquement si** aucun champ `internalEntity` n'existe déjà sur l'objet (`NOT EXISTS`, anti-collision), suivi de l'invalidation des flat maps + log WARN listant les objets migrés. Purement metadata : le `joinColumnName` stocké est déjà `internalEntityId` sur ces workspaces, aucune migration physique. Périmètre : commande uniquement — `InternalEntitySchemaService.ensureSchema` n'est appelé que par le flux de création de workspaces **neufs** (`workspace-manager.service.ts`), jamais confronté au nommage hérité.
- **Vérifié en conditions réelles** : état legacy reproduit en base (renommage manuel `internalEntity`→`entiteInterne` sur 2 objets) → run de la commande : `2 champ(s) de relation hérité(s) renommé(s) en internalEntity (calendarEventEntityAudience, personEntityMembership)` puis **complétion intégrale** (schéma, seed, backfill CSV, memberships, nettoyage, intégrité). Re-run : aucun renommage, complétion OK (idempotent). Champs vérifiés en base : tous `internalEntity`.
- **Impact prod** : au prochain déploiement, l'entrypoint relançant `init-internal-entities` migrera automatiquement l'instance 20.devbystep.fr si elle porte l'ancien nommage — c'est la voie de résolution prévue.
- **Note** : sur la base locale, les champs avaient déjà été renommés à la main (probablement par l'autre agent) entre la découverte et cette correction — la migration codifiée reste indispensable pour la prod et tout autre workspace hérité (un renommage manuel n'est pas reproductible).
- **Vérif** : spec util 5/5 ; suite `src/modules/internal-entity` : 146/148 — les **2 échecs sont étrangers à ce fix** (mocks des specs access-policy et init-command pas encore à jour du chantier concurrent IMP-11/IMP-13 de l'autre agent : `internalEntityRoleService`, `logInternalEntityMerge`) ; typecheck : 0 erreur dans les fichiers de ce fix (2 erreurs préexistantes dans `command.ts` et le spec access-policy, même chantier concurrent) ; oxlint OK (1 warning préexistant hors périmètre) ; prettier OK ; double test réel ci-dessus.

### 🟡 À faire — Modérés

#### FIX-15 — `assertSignUpEnabled()` supprimé — `FAIT` (2026-07-16, déjà livré, constaté)

- **Sévérité/Axe** : 🟡 `SEC`
- **Fichiers** : `sign-in-up.service.ts` (+ spec)
- **Résolution constatée** : `assertSignUpEnabled()` est réintroduit et appelé en **tête** de `signUpWithoutWorkspace` et dans `assertWorkspaceCreationAllowed`. Sémantique fork : signup autorisé si `IS_MULTIWORKSPACE_ENABLED` ou si aucun workspace n'existe (bootstrap initial) — plus strict que le flag upstream. Testé : rejet `SIGNUP_DISABLED` quand mono-workspace + workspace existant (spec 12/12).

#### FIX-16 — Échec d'auto-activation du workspace avalé — `FAIT` (2026-07-16, déjà livré, constaté)

- **Sévérité/Axe** : 🟡 `UX`/`DATA`
- **Fichiers** : `sign-in-up.service.ts` (+ spec)
- **Résolution constatée** : `activateWorkspace` est appelé en `await` direct **sans catch avaleur** — tout échec remonte au front (plus de workspace `PENDING_CREATION` orphelin silencieux). Le cast `as unknown as AuthContextUser` a été supprimé. Testé : « throws when the new workspace auto-activation fails » (spec 12/12).

#### FIX-17 — Fallback JWT silencieux vers le premier workspace — `FAIT` (2026-07-16, résolu par la réécriture de la stratégie)

- **Sévérité/Axe** : 🟡 `SEC`
- **Fichiers** : `packages/twenty-server/src/engine/core-modules/auth/strategies/jwt.auth.strategy.ts` (+ spec)
- **Problème (historique)** : un JWT au `workspaceId` obsolète était re-routé silencieusement vers le premier workspace trouvé, sans trace.
- **Résolution constatée** : la stratégie a été réécrite — le fallback n'existe plus. Un token dont le workspace n'existe plus est **rejeté** (`WORKSPACE_NOT_FOUND`), un mismatch userWorkspace/workspace est rejeté aussi. Comportement plus strict que la piste initiale (qui proposait seulement un log). Testé : « should reject an access token when its workspace no longer exists » (19/19 verts). `logJwtFallback` reste disponible dans l'audit logger si un fallback devait réapparaître.

#### FIX-18 — Emails bootstrap admin en dur — `FAIT` (déjà livré par un autre agent, constaté le 2026-07-16, voir IMP-10)

- 🟡 `SEC`/`MAINT` — `bootstrap-admin-email.constant.ts` lit désormais `process.env.BOOTSTRAP_ADMIN_EMAILS`, aucun email codé en dur ne subsiste dans le module auth. Détails de la vérification : voir IMP-10.

#### FIX-19 — Filtres `in: [ids…]` construits en chargeant des tables entières — `A_FAIRE`

- **Sévérité/Axe** : 🟡 `PERF`/`SCAL`
- **Fichiers** : `internal-entity-access-policy.service.ts` (`getHybridScopeFilter`, `getPersonalScopeFilter` noteTarget/taskTarget), `timeline-calendar-event.service.ts` (`getGroupCalendarEvents`)
- **Problème** : le scope de lecture est appliqué en chargeant **tous** les IDs accessibles côté serveur puis en construisant un filtre `in: [id1, id2, …]`. Sur une grosse base, ces tableaux d'IDs explosent (taille du filtre, mémoire, latence). IMP-01/02/05 ont ajouté un cache TTL 30 s qui **atténue** la fréquence du problème mais pas sa borne supérieure : un `in: [...]` avec des dizaines de milliers d'IDs reste pathologique.
- **Correction proposée** : pousser le scope **en SQL** — sous-requête `EXISTS` / jointure sur les tables de membership (via `apply-row-level-permission-predicates`) au lieu de matérialiser la liste d'IDs. Pour le calendrier de groupe, IMP-03 a déjà paginé en SQL ; appliquer le même principe aux autres chemins. C'est la solution structurelle dont IMP-01/02 sont la version « cache » provisoire.
- **Effort** : élevé (touche le générateur de prédicats de permission de Twenty).

#### FIX-20 — Normalisation des IDs d'entité incohérente — `FAIT` (2026-07-16, constaté)

- **Constat** : `calendar-privacy.service.ts` normalise désormais TOUTES les frontières via `normalizeOptionalEntityId`/`normalizeEntityIdSet` — entité propriétaire, `visibleInternalEntityIds` de canal, et lignes d'audience (`loadAudienceMap`). Plus de dépendance au comportement implicite de PG. Bug résolu.

- **Sévérité/Axe** : 🟡 `MAINT` (risque `DATA` latent)
- **Fichiers** : `internal-entity-access-policy.service.ts` (`resolveContext`), `calendar-privacy.service.ts`, chemins consommant `calendarChannel.visibleInternalEntityIds` et les lignes d'audience
- **Problème** : `resolveContext` met tout en lowercase, mais `calendarChannel.visibleInternalEntityIds` n'est que trimmé et les lignes d'audience sont comparées brutes via `Set.has`. La comparaison ne « marche » aujourd'hui que parce que Postgres renvoie les uuid en minuscules. Toute source d'ID en casse mixte (saisie manuelle, import, API externe) casserait silencieusement l'isolation ou le masquage.
- **Correction proposée** : passer **chaque** ID d'entité par `normalizeOptionalEntityId` (trim + lowercase, la fonction canonique existante) à toutes les frontières — écriture ET lecture — pour ne jamais dépendre d'un comportement implicite du driver PG. Ajouter des tests avec des IDs en casse mixte.
- **Effort** : faible/moyen (chirurgie ponctuelle mais à faire à plusieurs endroits).

### ⚪ À faire — Mineurs

#### FIX-21 — `validateFindDuplicatesPayload`/`validateMergeManyPayload` sans `executeInWorkspaceContext` — `FAIT` (2026-07-16, constaté)

- **Constat** : les deux validateurs enveloppent désormais leurs lookups (`resolveRecordSummary`) dans `executeInWorkspaceContext`, comme le reste du service. Incohérence résolue.

- **Sévérité/Axe** : ⚪ `MAINT`
- **Fichiers** : `internal-entity-access-policy.service.ts`
- **Problème** : ces deux validateurs n'enveloppent pas leurs lookups dans `executeInWorkspaceContext`, contrairement à **tous** les autres chemins du même service. Incohérence qui peut faire diverger le contexte de datasource et devenir un vrai bug si ces chemins se mettent à requêter des tables scopées.
- **Correction proposée** : aligner sur le pattern majoritaire — envelopper la logique dans `executeInWorkspaceContext`. À traiter en même temps que FIX-12 (qui touche déjà `validateMergeManyPayload`).
- **Effort** : faible.

#### FIX-22 — Parser CSV : champs parsés jamais utilisés — `FAIT` (2026-07-16, constaté)

- **Constat** : `import-csv-opportunities-parser.service.ts` — `CsvOpportunityRow` est élagué à `{id, name, entityName}` (les `amount`/`currency`/`stage`/`companyId`/`personId` inutiles au backfill ont été retirés), et `parseEntityName` **jette une erreur explicite avec numéro de ligne** quand `Société` n'est pas un tableau JSON valide/non vide (plus de `null` silencieux). Résolu. (`import-csv.command.ts`, l'import CSV complet, parse légitimement tous les champs — hors périmètre.)

- **Sévérité/Axe** : ⚪ `MAINT`
- **Fichiers** : `import-csv-opportunities-parser.service.ts`
- **Problème** : le parser extrait `amount`, `currency`, `stage`, `companyId`, `personId` que le backfill `init-internal-entities` n'utilise jamais (seuls `id` et `Société`→entité comptent). De plus, si la colonne `Société` n'est pas un tableau JSON valide, la valeur retombe silencieusement à `null` (simple log `debug`) — un opérateur ne voit pas passer une ligne mal formée.
- **Correction proposée** : (1) élaguer les champs parsés inutiles (ou documenter pourquoi ils restent), (2) remonter un `warn` explicite quand `Société` n'a pas le format attendu, avec le numéro de ligne, pour que les lignes ignorées soient visibles (recoupe IMP-21 côté import interactif).
- **Effort** : faible.

#### FIX-23 — Bypass asymétrique Person/Company vs Opportunity — `FAIT` (2026-07-16)

- **Sévérité/Axe** : ⚪ `DOC`
- **Fichiers** : `internal-entity-source-tagging.service.ts`
- **Constat/correction** : le vrai comportement est une asymétrie de **tagging** (person/company auto-tagués sans assignation explicite possible ; opportunity autorise une assignation explicite validée via sa FK directe). Commentaire explicatif ajouté au point de branchement `objectName !== OPPORTUNITY_OBJECT_NAME` figeant l'intention (ne pas uniformiser les deux branches sous peine de casser l'isolation ou l'assignation légitime). Le bypass FIX-03, lui, s'applique désormais uniformément à tous les objets (vérifié en amont du branchement).
- **Vérif** : spec source-tagging 22/22, typecheck OK.

#### FIX-24 — Docs périmées — `FAIT` (2026-07-16)

- **Sévérité/Axe** : ⚪ `DOC`
- **Fichiers** : `MEMORY.md` (déjà à jour), `docs/ARCHITECTURE.md`
- **Correction** : `ARCHITECTURE.md` réaligné sur les décisions tranchées — arbitrage de masquage calendrier réécrit avec la règle « propriétaire toujours visible » (FIX-10) + normalisation (FIX-20) ; note backfill précisée (aucun fallback créateur FIX-08, garde `IS NULL` FIX-07) ; nouvelle section « Accès & inscription » documentant invitation-only (FIX-13), anti-énumération (IMP-12) et onboarding par utilisateur (FIX-14).
- **Vérif** : prettier OK ; cohérence code/doc revue sur les 3 axes tranchés.

#### FIX-25 — Hygiène git : `.codex/`, `AGENTS.md` et snapshots — `A_FAIRE`

- **Sévérité/Axe** : ⚪ `MAINT`
- **Fichiers** : `.gitignore`, `AGENTS.md`, snapshots Jest (`all-universal-flat-entity-properties…snap`, `get-standard-object-metadata-related-entity-ids…snap`)
- **Problème** : `.codex/` et `AGENTS.md` (artefacts d'agents IA) ne sont ni ignorés ni committés proprement. Un snapshot Jest a été modifié trivialement (URL de commentaire) — à committer ou restaurer. Le snapshot `get-standard-object-metadata-related-entity-ids` est périmé (champs calendrier ajoutés par le fork) et doit être régénéré.
- **Correction proposée** : (1) décider `.gitignore` vs commit pour `.codex/`/`AGENTS.md` ; (2) régénérer le snapshot périmé (`jest -u` ciblé) et vérifier que le diff correspond bien aux champs calendrier attendus ; (3) committer/restaurer le snapshot trivialement modifié.
- **Effort** : trivial.

---

## 🚀 Série IMP — Améliorations (audit du 2026-07-15)

### Performance / Scalabilité

#### IMP-01 — Cache TTL des IDs lisibles pour `timelineActivity` — `FAIT` (2026-07-15)

- **Sévérité/Axe** : 🟠 `PERF`/`SCAL`
- **Fichiers** : `packages/twenty-server/src/modules/internal-entity/query-hooks/services/internal-entity-scope-cache.service.ts` (nouveau), `internal-entity-access-policy.service.ts`, `internal-entity-query-hook.module.ts`
- **Problème** : chaque lecture de `timelineActivity` chargeait tous les IDs de notes, tâches, companies, persons et opportunités accessibles (5 requêtes + tableaux en mémoire) pour construire un `or` de `in`. Sur une fiche record, la timeline est affichée fréquemment, ce qui amplifiait le coût.
- **Correction** : mise en cache mémoire process des listes d'IDs lisibles par `(workspaceId, workspaceMemberId, entityIds, objectName)` avec un TTL de 30 s. `getReadablePersonalNoteIds`, `getReadablePersonalTaskIds` et `getReadableEntityScopedRecordIds` lisent/écrivent dans ce cache. L'invalidation par workspace est exposée pour les futures hooks de mutation.
- **Limite** : ce n'est pas une sous-requête SQL (piste initiale) ; à très grande volumétrie la liste d'IDs pourra encore dépasser la taille acceptable d'un filtre `in: [...]`. L'approche a été retenue car elle ne nécessite pas de modifier le générateur SQL de Twenty et reste correcte sémantiquement.
- **Vérif** : 58 tests unitaires access-policy (dont 1 nouveau sur le cache timeline), 5 tests sur `InternalEntityScopeCacheService`, `npx nx typecheck twenty-server` OK.

#### IMP-02 — Cache TTL des IDs lisibles pour `noteTarget`/`taskTarget` — `FAIT` (2026-07-15)

- **Sévérité/Axe** : 🟡 `PERF`
- **Fichiers** : `packages/twenty-server/src/modules/internal-entity/query-hooks/services/internal-entity-scope-cache.service.ts`, `internal-entity-access-policy.service.ts`
- **Problème** : `getPersonalScopeFilter` listait tous les IDs de notes/tâches du membre à chaque requête `noteTarget`/`taskTarget`.
- **Correction** : `getReadablePersonalNoteIds` et `getReadablePersonalTaskIds` utilisent le même cache TTL 30 s que IMP-01 (clés `readableNoteIds` / `readableTaskIds`).
- **Vérif** : 58 tests unitaires access-policy, `npx nx typecheck twenty-server` OK.

#### IMP-03 — Paginer `getGroupTimelineCalendarEvents` en SQL — `FAIT` (2026-07-15)

- 🟠 `PERF`/`SCAL` — `timeline-calendar-event.service.ts` (`getGroupCalendarEvents`)
- `getGroupCalendarEvents(includeMaskedEvents=true)` utilise désormais `findAndCount` avec `relations` pour charger la page demandée en une requête SQL.
- `getUnmaskedGroupCalendarEventsPage` charge les événements complets par batch via `find` avec `relations` (au lieu de charger tous les IDs puis de refaire un `find` par ID), et s'arrête dès que la page est pleine.
- **Fichiers** : `packages/twenty-server/src/engine/core-modules/calendar/timeline-calendar-event.service.ts`, `timeline-calendar-event.service.spec.ts`
- **Vérif** : `npx nx typecheck twenty-server`, tests calendrier.

#### IMP-04 — Batcher la résolution d'entité des propriétaires de canaux — `FAIT` (2026-07-15)

- 🟡 `PERF` — `calendar-privacy.service.ts` (`getCalendarEventMaskMap`) : remplacement de la boucle `resolveContext` par canal par un appel unique à `resolveContextsByWorkspaceMemberIds` pour tous les propriétaires de canaux.
- **Fichiers** : `packages/twenty-server/src/modules/calendar/common/services/calendar-privacy.service.ts`, `calendar-privacy.service.spec.ts`
- **Vérif** : `npx nx typecheck twenty-server`, tests privacy calendrier.

#### IMP-05 — Cacher le contexte membre→entités par requête — `FAIT` (2026-07-15)

- 🟡 `PERF` — `workspace-member-internal-entity.service.ts` : cache mémoire par `(workspaceId, workspaceMemberId, fallbackEntityId)` avec TTL 30 s dans `resolveContextsByWorkspaceMemberIds`. Les appels suivants avec les mêmes paramètres ne requêtent plus la table `workspaceMemberEntityMembership`.
- **Fichiers** : `packages/twenty-server/src/modules/internal-entity/services/workspace-member-internal-entity.service.ts`, `workspace-member-internal-entity.service.spec.ts`
- **Vérif** : `npx nx typecheck twenty-server`, tests internal-entity.

#### IMP-06 — Index et contrainte d'unicité sur les tables de jonction — `FAIT` (2026-07-15)

- **Sévérité/Axe** : 🟠 `SCAL`/`DATA`
- **Fichiers** : `packages/twenty-server/src/modules/internal-entity/query-hooks/utils/internal-entity-membership-integrity-sql.util.ts`, `.../internal-entity-membership-integrity-sql.util.spec.ts`, `packages/twenty-server/src/modules/internal-entity/commands/init-internal-entities.command.ts`, `packages/twenty-server/src/database/commands/upgrade-version-command/2-1/2-1-workspace-command-1780000006000-deduplicate-internal-entity-memberships.command.ts`.
- **Problème initial** : aucune contrainte unique sur (`personId`,`internalEntityId`) etc. : l'anti-doublon reposait sur `WHERE NOT EXISTS` (sujet aux races concurrentes) et le `ON CONFLICT DO NOTHING` ne matchait jamais (PK aléatoire). Pas d'index dédié sur `internalEntityId` pour les filtres de scope.
- **Point de départ** : un autre agent (codex) avait déjà livré `internal-entity-membership-integrity-sql.util.ts` (dédup + index unique partiel `NULLS NOT DISTINCT` sur (source, internalEntityId)), câblé dans `ensureMembershipIntegrity` de `init-internal-entities.command.ts` **pour 3 tables seulement** (`companyEntityMembership`, `personEntityMembership`, `workspaceMemberEntityMembership`) + dans la commande d'upgrade `2-1-workspace-command-1780000006000-deduplicate-internal-entity-memberships.command.ts`.
- **Écarts comblés** :
  1. `calendarEventEntityAudience` (jonction calendarEvent↔internalEntity, colonne source `calendarEventId`) manquait à la liste malgré son support déjà présent dans `seedInternalEntities`/repoint. Ajoutée à `ensureMembershipIntegrity` (init) **et** à `MEMBERSHIP_OBJECTS` de la commande d'upgrade. (`calendarEventPersonAudience` n'est **pas** concernée : c'est une jonction calendarEvent↔workspaceMember sans colonne `internalEntityId`, hors périmètre.)
  2. Aucun index simple (non-unique) sur `internalEntityId` seul — l'index composite a la colonne source en tête, donc inutilisable par les filtres `{internalEntityId: {in: [...]}}` de l'access-policy. Nouveau builder générique `buildCreateInternalEntityIdIndexQuery({sqlTable, indexName})` (index B-tree partiel `WHERE "deletedAt" IS NULL`, découplé du type "membership" pour être réutilisable), appelé pour chaque table de jonction en plus de l'index unique composite.
  3. `opportunity.internalEntityId` (FK directe, pas une jonction) sans aucun index. Même builder réutilisé, appelé une fois sur `opportunitySqlTable` dans `runSeedForWorkspace` et dans la commande d'upgrade (nouvelle méthode `ensureOpportunityInternalEntityIdIndex`).
- **Type étendu** : `InternalEntityMembershipIntegrityTarget.sourceJoinColumnName` accepte désormais `'calendarEventId'` ; `InternalEntityMembershipUniqueIndexTarget` porte un `internalEntityIdIndexName` en plus de `indexName`.
- **Limite connue / action opérateur requise** : la commande d'upgrade `2-1-workspace-command-1780000006000-...` est enregistrée via `@RegisteredWorkspaceCommand('2.1.0', 1780000006000)` — un workspace qui a **déjà exécuté** ce timestamp avant cette correction ne la rejouera pas automatiquement (registre par timestamp, pas par contenu). Toutes les étapes ajoutées sont idempotentes (`CREATE INDEX IF NOT EXISTS`, dédup/cleanup basés sur des `WHERE`/`HAVING`) : pour tout workspace déjà passé par 2.1.0, un opérateur doit relancer manuellement `nx run twenty-server:command -- upgrade:2-1:deduplicate-internal-entity-memberships` (ou `init-internal-entities`, qui couvre le même correctif). À ce stade (outil interne, peu de workspaces réels), pas jugé nécessaire de créer une nouvelle commande d'upgrade timestampée dédiée pour ce seul delta.
- **Vérif** : `npx jest src/modules/internal-entity` → 135/135 (11 suites) ; suite d'intégration `internal-entity-isolation` → 16/16 après rebuild (`nx build twenty-server`) ; `npx nx typecheck twenty-server` OK ; oxlint --type-aware + prettier sur tous les fichiers touchés OK.

#### IMP-07 — Mémoïser les checks de rôle par requête — `FAIT` (2026-07-16)

- 🟡 `PERF` — `UserRoleService.getRolesByUserWorkspaces` n’avait pas de cache : chaque appel requêtait `roleTarget` + `role.permissionFlags`. Pour une mutation calendrier, `isPlatformAdmin` puis `isEntityManager` / `canManageScopedCalendarRecords` appelaient chacun la méthode.
- **Correction** : cache mémoire par `(workspaceId, userWorkspaceId)` avec TTL 30 s dans `UserRoleService`. Seuls les IDs manquants sont requêtés ; les résultats sont stockés puis réutilisés par tous les services consommateurs.
- **Fichiers** : `packages/twenty-server/src/engine/metadata-modules/user-role/user-role.service.ts`, nouveau `user-role.service.spec.ts`
- **Vérif** : `npx nx typecheck twenty-server`, tests user-role + calendrier.

#### IMP-08 — Paralléliser `validateCreateManyPayload` calendrier — `FAIT` (2026-07-16)

- ⚪ `PERF` — `calendar-event-mutation-permission.service.ts` : `validateCreateManyPayload` bouclait séquentiellement sur `payload.data` et appelait `validateCreatePayload` pour chaque ligne, refaisant les mêmes lookups rôle / canal / événement.
- **Correction** :
  - `calendarChannelEventAssociation` : déduplication des `calendarChannelId` du batch et appel unique à `assertCalendarChannelMutationAllowed`.
  - `calendarEvent` : appel unique à `assertCalendarRecordCreationAllowed`.
  - `calendarEventParticipant` : déduplication des `calendarEventId` et validation parallèle (`Promise.all`) des événements uniques.
- **Fichiers** : `packages/twenty-server/src/modules/calendar/common/query-hooks/calendar-event/services/calendar-event-mutation-permission.service.ts`
- **Vérif** : `npx nx typecheck twenty-server`, tests calendrier.

### Sécurité (hardening)

#### IMP-09 — Brancher `INTERNAL_ENTITY_SEEDS` (env) dans `init-internal-entities` — `FAIT` (2026-07-16)

- **Sévérité/Axe** : 🟠 `SEC`/`MAINT`
- **Fichiers** : `packages/twenty-server/src/modules/internal-entity/commands/init-internal-entities.command.ts`, `.../commands/import-csv.command.ts`, `.../utils/internal-entity-command.utils.ts` (+ specs des trois), `internal-entity.module.ts` (aucun changement nécessaire, les deux commandes et `InternalEntityConfigurationService` étaient déjà providers du même module).
- **Problème** : la commande maîtresse (`init-internal-entities`, qui écrit réellement les `InternalEntity` en base) lisait `INTERNAL_ENTITY_SEEDS` **codé en dur** (`Object.values(INTERNAL_ENTITY_SEEDS)`) au lieu de passer par `InternalEntityConfigurationService` (qui sait charger/valider la variable d'env `INTERNAL_ENTITY_SEEDS`). `import-csv.command.ts` faisait de même via une résolution de nom d'entité dupliquée et strictement moins robuste (`resolveInternalEntitySeedId` 1-arg dans `internal-entity-command.utils.ts` : correspondance exacte uniquement, contre `DEFAULT_INTERNAL_ENTITY_SEEDS` codé en dur — jamais l'éventuelle config d'env). Résultat : configurer `INTERNAL_ENTITY_SEEDS` en env ne changeait rien au seed réel — split-brain total. Seule `import-csv-opportunities.command` utilisait déjà correctement le service.
- **Correction** : `InternalEntityConfigurationService` injecté dans `InitInternalEntitiesCommand` et `ImportCsvCommand`. `seedInternalEntities` appelle désormais `this.internalEntityConfigurationService.getInternalEntitySeeds()` ; `backfillOpportunities` (init) et `resolveImportableRows` (import-csv) appellent `resolveInternalEntityId(entityName)` (résolution normalisée trim+lowercase, avec support des alias — plus robuste que l'ancienne correspondance exacte). La fonction dupliquée `resolveInternalEntitySeedId` 1-arg de `internal-entity-command.utils.ts` a été supprimée (dead code après le swap ; la version 2-arg de `internal-entity-seeds.util.ts`, utilisée par le service, reste la seule implémentation).
- **Durcissement 2026-07-16** : `INTERNAL_ENTITY_SEEDS` est désormais déclarée dans `ConfigVariables` comme variable `env-only` (`ADVANCED_SETTINGS`) et `InternalEntityConfigurationService` lit prioritairement `TwentyConfigService.get('INTERNAL_ENTITY_SEEDS')`, avec fallback `process.env` uniquement pour les contextes isolés/tests. La variable devient donc un vrai contrat d'exploitation et non une lecture opportuniste, tout en restant compatible Dokku (`dokku config:set twenty-dbs INTERNAL_ENTITY_SEEDS='[...]'`). Format accepté : tableau JSON d'entités ou objet JSON `{ "entities": [...] }`; chaque entité exige `id`, `name`, `color`, et accepte `aliases`.
- **Hors périmètre (assumé)** : `shared-calendar-demo.service.ts` et `primary-dev-workspace-data.constant.ts` référencent encore `INTERNAL_ENTITY_SEEDS` codé en dur — mais ce sont des fixtures de démo dev intrinsèquement couplées aux 4 sociétés actuelles (users TIM/JONY/PHIL/JANE, événements calendrier fixes) ; les généraliser à un jeu d'entités arbitraire est un chantier séparé, plus large, sans rapport avec le seed réel d'un workspace de production.
- **Vérif** : `npx jest src/modules/internal-entity` → 135/135 (11 suites) ; `npx nx typecheck twenty-server` OK ; `npx nx build twenty-server` OK. Durcissement 2026-07-16 : `internal-entity-configuration.service.spec.ts` (5 tests) OK ; `multi-entity-config-variables.spec.ts` (2 tests) OK ; `npx nx typecheck twenty-server` OK ; `npx nx lint:diff-with-main twenty-server` OK ; oxlint ciblé + Prettier ciblé OK.

#### IMP-10 — Externaliser `BOOTSTRAP_ADMIN_EMAILS` en variable d'env — `FAIT` (déjà livré par un autre agent, constaté le 2026-07-16)

- **Sévérité/Axe** : 🟡 `SEC`
- **Fichiers** : `packages/twenty-server/src/engine/core-modules/auth/constants/bootstrap-admin-email.constant.ts`, `bootstrap-admin-email-domains.constant.ts`, `sign-in-up.service.ts`, `jwt.auth.strategy.ts` (+ specs).
- **Constat** : au moment de traiter cet item, le code était déjà entièrement migré — `getBootstrapAdminEmails`/`isBootstrapAdminEmail`/`isBootstrapAdminEmailDomain` lisent `process.env.BOOTSTRAP_ADMIN_EMAILS` par défaut, aucune liste d'emails codée en dur ne subsiste dans le module auth (vérifié par grep sur `aline@weknow.dev` — ne reste que dans les fixtures de test et le dev-seeder, hors périmètre prod). Va même au-delà de la piste FIX-18 (pas de fallback codé en dur du tout, juste un tableau vide si la variable est absente).
- **Durcissement 2026-07-16** : `BOOTSTRAP_ADMIN_EMAILS` est aussi déclarée dans `ConfigVariables` comme variable `env-only` (`ADVANCED_SETTINGS`), ce qui documente officiellement le contrat de déploiement et empêche une configuration DB de diverger de l'environnement d'exécution.
- **Vérif** : `npx nx typecheck twenty-server` OK (aucune modif nécessaire). Durcissement 2026-07-16 : `multi-entity-config-variables.spec.ts` (2 tests) OK ; `npx nx typecheck twenty-server` OK ; oxlint ciblé + Prettier ciblé OK.

#### IMP-11 — Journal d'audit des décisions de la policy — `FAIT` (2026-07-16)

- **Sévérité/Axe** : 🟡 `SEC`
- **Fichiers** : `packages/twenty-server/src/modules/internal-entity/services/internal-entity-audit-logger.service.ts` (+ module), branché dans `internal-entity-access-policy.service.ts`, `internal-entity-source-tagging.service.ts`, `calendar-event-mutation-permission.service.ts`, `init-internal-entities.command.ts`.
- **Contenu livré** : logger structuré `warn` avec événements typés — `logPermissionDenied`, `logSourceTaggingBypass`, `logInternalEntityMerge` (constaté en action lors de la fusion des 3 doublons FIX-29), `logJwtFallback` (disponible, sans appelant : le fallback JWT a été supprimé, voir FIX-17). Schéma : `{event, workspaceId, userId?, objectName?, décision…}` sur stdout (agrégeable).
- **Vérif** : specs des 4 consommateurs verts ; merges observés en réel dans les logs d'`init-internal-entities`.

#### IMP-12 — Durcir le flux signup contre l'énumération — `FAIT` (2026-07-16)

- **Sévérité/Axe** : ⚪ `SEC`
- **Fichiers** : `sign-in-up.service.ts` (+ spec), `auth.module.ts`
- **Décision produit** : oui, durcir (on reste en invitation-only, cf. FIX-13).
- **Correction** : (1) **messages uniformes** — tous les refus d'auto-inscription passent par `throwUniformSignUpRestricted` (même code + même `userFriendlyMessage`), supprimant l'oracle qui révélait l'existence d'un super admin / d'une invitation / d'un domaine ; (2) **throttle par e-mail** — `assertSignUpAttemptWithinRateLimit` consomme un token (`ThrottlerService`, 10 tentatives / 15 min, clé `sign-up-attempt:<email normalisé>`), le dépassement renvoyant le MÊME message uniforme. En défense en profondeur au-dessus du `CaptchaGuard` déjà présent sur la mutation `signUp`.
- **Vérif** : nouveau test « throttles repeated sign-up attempts » (court-circuite avant lecture DB) — spec 13/13 ; typecheck OK.

### Maintenabilité

#### IMP-13 — Extraire un `InternalEntityRoleService` partagé — `FAIT` (2026-07-16)

- **Sévérité/Axe** : 🟠 `MAINT`
- **Fichiers** : `packages/twenty-server/src/modules/internal-entity/services/internal-entity-role.service.ts` (+ module), consommé par `internal-entity-access-policy.service.ts`, `calendar-event-mutation-permission.service.ts`, `internal-entity-source-tagging.service.ts`.
- **Contenu livré** : `isPlatformAdmin` / `isEntityManager` / `canManageEntityScopedRecords` centralisés dans un service unique injecté dans les 3 anciens duplicateurs — l'évolution du modèle de rôles se fait désormais en un seul endroit. S'appuie sur le cache TTL de `UserRoleService` (IMP-07).
- **Vérif** : 148/148 tests internal-entity + specs calendrier verts après mise à jour des mocks.

#### IMP-14 — Découper les deux fichiers géants — `A_FAIRE`

- **Sévérité/Axe** : 🟠 `MAINT`
- **Fichiers** : `internal-entity-access-policy.service.ts` (~1679 lignes), `init-internal-entities.command.ts` (~1950 lignes)
- **Problème** : ces deux fichiers violent la règle projet « services < 500 lignes » (`docs/ARCHITECTURE.md`). Leur taille rend chaque modification risquée (c'est dans `internal-entity-access-policy.service.ts` que se cachaient FIX-26 et FIX-27) et la revue difficile.
- **Correction proposée** :
  - **Policy** → 3 services : scope de **lecture** (filtres), gardes de **mutation**, et `resolveRecordSummary` + utils partagés.
  - **Command** → 3 services : `InternalEntitySchemaService` (metadata — déjà en embryon), `InternalEntitySeedService` (seed + merge de doublons), `InternalEntityBackfillService` (backfills + `verifyMigration`).
  - À faire **après** IMP-13 (le role service extrait allège déjà la policy) et idéalement avant de retoucher lourdement ces fichiers.
- **Effort** : élevé (refactor structurel — bien couvrir de tests avant/après ; les suites unitaire + intégration existantes servent de filet).

#### IMP-15 — Découper `SuperadminWorkspaceSetup.tsx` — `EN_COURS` (2026-07-16)

- **Sévérité/Axe** : 🟡 `MAINT`
- **Fichiers** : `SuperadminWorkspaceSetup.tsx` + nouveaux `SuperadminWorkspaceSetup.styles.ts`, `SuperadminEntitiesSection.tsx`, `SuperadminModulesSection.tsx`, `SuperadminModuleOrderSection.tsx`, `utils/superadminWorkspaceSetup.ts` (+ test).
- **Progrès (décomposition sûre, sans changement de comportement)** : le composant passe de **995 à 670 lignes**. Extraits (déplacements verbatim, validés par typecheck + lint) : les 17 styled-components → fichier `.styles.ts` ; les types + helpers purs (`parseSavedSetupState`, `resolveModuleOptions`) → `utils/superadminWorkspaceSetup.ts` avec 5 tests unitaires ; les 3 sections d'UI (entités, modules, ordre du menu) → 3 sous-composants présentationnels purs (props in, aucun état). Le `handleSubmit`/FIX-29 n'a pas été touché.
- **Reste (volontairement différé)** : extraire l'orchestration (`handleSubmit` + `syncWorkspaceNavigationMenu` + state, ~350 l.) dans un hook `useSuperadminWorkspaceSetupForm` pour passer sous 300 lignes. C'est la partie couplée au chemin critique d'onboarding ; à faire APRÈS avoir ajouté un test de rendu du composant (filet de sécurité absent aujourd'hui) pour ne pas risquer une régression du submit.
- **Vérif** : `jest src/modules/onboarding` 27/27 ; `nx typecheck twenty-front` OK ; `nx lint:diff-with-main twenty-front` OK ; prettier OK.

#### IMP-16 — Unifier les deux résolveurs de seeds — `FAIT` (2026-07-16, résolu par IMP-09)

- **Sévérité/Axe** : 🟡 `MAINT`
- **Fichiers** : `internal-entity-command.utils.ts`, `internal-entity-seeds.util.ts`
- **Problème** : `resolveInternalEntitySeedId` existait en deux versions — une 1-arg codée en dur (`internal-entity-command.utils.ts`, correspondance exacte contre `DEFAULT_INTERNAL_ENTITY_SEEDS`) et une 2-arg configurable (`internal-entity-seeds.util.ts`, normalisée + alias).
- **Résolution** : en implémentant IMP-09, la version 1-arg dupliquée a été **supprimée** ; tous les appelants passent désormais par `InternalEntityConfigurationService` (qui délègue à la version 2-arg, seule implémentation restante). Les deux résolveurs sont donc unifiés. Voir la fiche IMP-09 pour le détail.
- **Vérif** : couverte par la vérif d'IMP-09 (135/135 tests internal-entity, typecheck OK).

#### IMP-17 — Tests d'intégration sur l'isolation par entité — `FAIT` (2026-07-15)

- **Sévérité/Axe** : 🟠 `MAINT`
- **Fichiers** : `packages/twenty-server/test/integration/graphql/suites/internal-entity-isolation.integration-spec.ts` (nouveau, 16 tests), `test/integration/utils/run-init-internal-entities.util.ts` (nouveau), `test/integration/graphql/utils/make-graphql-api-request.util.ts` (ajout d'un paramètre `headers` optionnel, non-breaking).
- **Contenu** : suite bout-en-bout contre une vraie DB Postgres (via `nx jest --config=jest-integration.config.ts`), sans aucun mock — exerce le pipeline réel GraphQL → query hooks → SQL. Découvre dynamiquement 2 users seedés sur des entités différentes + 1 user privilégié (jamais de label hardcodé). Couvre : tagging automatique à la création (opportunity + company via jonction M2M), rejet d'assignation explicite cross-entité (régression FIX-04), isolation en lecture (`findMany`/`findOne`, avec et sans header, vue groupe), isolation en écriture (update/delete/bulk update refusés hors entité), bypass des admins/entity managers en écriture tout en restant scopés en lecture.
- **Obstacle non anticipé** : `InitInternalEntitiesCommand` vit dans le contexte de bootstrap CLI (`DatabaseCommandModule`), pas dans l'`AppModule` HTTP utilisé par le serveur de test — `global.app.get()` ne le trouve pas. Contournement : exécuter le binaire CLI compilé (`dist/command/command.js`) en sous-processus dans `beforeAll`, exactement comme un opérateur réel (`nx run twenty-server:command -- init-internal-entities`), en tolérant l'échec final connu et documenté (voir MEMORY.md) du check `verifyMigration` sur le seed CSV.
- **Valeur livrée au-delà du plan initial** : cette suite a immédiatement mis en évidence et permis de corriger **deux bugs de sécurité critiques préexistants** (FIX-26 : le filtrage en lecture par entité n'a jamais fonctionné ; FIX-27 : les admins ne pouvaient pas muter cross-entité) ainsi qu'**un bug bloquant la CI** (FIX-28 : `database:reset` cassé). Ces bugs étaient invisibles aux 57 tests unitaires existants car leurs mocks reproduisaient artificiellement l'état attendu plutôt que la vraie forme des métadonnées.
- **Reste hors périmètre** (candidats pour une extension future) : isolation sur `person` (couverte indirectement via `company`, même chemin de code), merge/duplicates, calendrier (audience/masquage), et les rôles standard Member/EntityManager qui n'ont par défaut aucune permission d'écriture sur les objets CRM (contournement actuel : la suite crée un rôle custom dédié et l'assigne de façon additive — documenté dans le fichier).
- **Vérif** : `npx jest src/modules/internal-entity` → 133/133 ; suite d'intégration → 16/16 ; `npx nx typecheck twenty-server` OK ; oxlint + prettier sur tous les fichiers touchés OK.

#### IMP-18 — Automatiser `init-internal-entities` après l'onboarding superadmin — `FAIT` (2026-07-16, constaté)

- **Constat** : `workspace.service.ts` appelle `seedInternalEntitiesForWorkspace` en fin d'activation (`activateAndInitializeUpgradeState`) → `runSeedForWorkspace` (idempotent, dans un `executeInWorkspaceContext`, avec catch non bloquant qui log en cas d'échec). Plus besoin de lancer la commande à la main. Amélioration livrée.

- **Sévérité/Axe** : 🟡 `MAINT`/`UX`
- **Fichiers** : flux `activateWorkspace` / `completeSuperadminWorkspaceSetup`, `init-internal-entities.command.ts` (`runSeedForWorkspace`, déjà public et idempotent)
- **Problème** : `MEMORY.md` note « à automatiser » — après l'onboarding superadmin en prod, la commande `init-internal-entities` doit encore être lancée **à la main**. Tant qu'elle ne l'est pas, la metadata multi-entités est absente → le filtrage par entité reste inactif (et FIX-09 fait crasher le calendrier de groupe).
- **Correction proposée** : appeler `runSeedForWorkspace` (idempotente et déjà exposée comme point d'entrée public exprès pour ça) en fin d'`activateWorkspace` ou de `completeSuperadminWorkspaceSetup`. Grâce à FIX-02 (le cache négatif de disponibilité expire en 30 s), le filtrage s'activera sans redémarrage du process web. Élimine aussi une bonne partie de la surface de FIX-09.
- **Effort** : faible/moyen (un appel bien placé + gestion d'erreur ; attention à ne pas bloquer l'onboarding si le seed échoue partiellement).

### Expérience utilisateur

#### IMP-19 — Sélecteur d'entité : nom réel + choix multi-entités — `FAIT` (2026-07-16)

- 🟠 `UX` — `entity-selector.component.tsx` : remplacement du toggle binaire « My company / Group view » par un dropdown listant « Group view » + les entités du membre courant avec nom réel, pastille couleur et coche d'état actif.
- **Fichiers** : `packages/twenty-front/src/modules/entity-filter/components/entity-selector/entity-selector.component.tsx`, `packages/twenty-front/src/modules/entity-filter/hooks/useSelectableInternalEntities.ts` (nouveau), `packages/twenty-front/src/modules/entity-filter/utils/buildSelectableInternalEntities.ts` (nouveau), `buildSelectableInternalEntities.test.ts` (nouveau).
- **Correction** : le sélecteur alimente `selectedEntityIdState` avec l'entité choisie, garde l'option groupe (`null`), dédoublonne les memberships et conserve `currentUser.entityId` en fallback si la migration M2M n'a pas encore remonté de membership.
- **Point de robustesse** : la requête des memberships n'utilise pas `useFindManyRecords` pour éviter que le scope entité actif ne filtre lui-même les options du sélecteur.
- **Vérif** : `jest buildSelectableInternalEntities.test.ts` OK, `nx typecheck twenty-front` OK, `oxlint --type-aware` ciblé OK, `prettier --check` ciblé OK. `nx lint:diff-with-main twenty-front` bloqué localement par le `npx` absent du PATH du shell, remplacé par l'équivalent ciblé sur les fichiers touchés.

#### IMP-20 — Resynchroniser le filtre d'entité persisté — `FAIT` (2026-07-16)

- **Sévérité/Axe** : 🟡 `UX` (risque de confusion `DATA` perçue)
- **Fichiers** : `packages/twenty-front/.../entity-filter/` (`selectedEntityIdState` / `activeEntityIdState` et leur persistance localStorage)
- **Problème** : ces atomes persistent en localStorage **sans revalidation**. Si l'entité stockée n'existe plus, ou ne correspond plus à l'utilisateur (changement d'affectation, ou autre compte sur le même navigateur), l'UI affiche « Ma Société » (libellé de l'entité stockée) mais le serveur, lui, retombe silencieusement sur l'entité par défaut du user → **les données affichées ne correspondent pas au libellé**. L'utilisateur croit voir une entité alors qu'il en voit une autre.
- **Correction** : nouvel util pur `shouldResetPersistedEntityFilter` (`entity-filter/utils/`, testé 5 cas) + effet dans `entity-selector.component.tsx` : une fois `useSelectableInternalEntities` chargé (`isLoading=false`), si `selectedEntityId` n'appartient plus aux entités sélectionnables → `setGroupView()`. Ne réinitialise jamais pendant le chargement ni la Vue Groupe (null/''). L'effet est monté avant l'early-return du composant (Rules of Hooks).
- **Vérif** : `jest shouldResetPersistedEntityFilter.test.ts` 5/5 ; `npx nx typecheck twenty-front` OK ; oxlint + prettier OK.

#### IMP-21 — Récap des relations ignorées à l'import CSV — `A_FAIRE`

- **Sévérité/Axe** : 🟡 `UX`
- **Fichiers** : chemin d'import (serveur : `relation-nested-queries.ts` — voir FIX-01 ; front : dialog d'import spreadsheet)
- **Problème** : conséquence directe de FIX-01 — un `connect` vers un ID inconnu laisse désormais la relation vide au lieu de crasher (bien), mais **silencieusement**. L'utilisateur qui importe un CSV ne sait pas quelles lignes ont perdu leur rattachement (company, person, entité…).
- **Correction proposée** : compter côté serveur les connects ignorés (par relation) et remonter un **résumé** — soit dans le dialog d'import spreadsheet, soit en snackbar post-import (« 3 lignes importées sans société : IDs introuvables »). Recoupe FIX-22 (warning parser sur `Société` mal formée).
- **Effort** : moyen (nécessite de propager un compteur du serveur jusqu'au front).

---

## 🔁 Historique des audits

| Date       | Périmètre                                                    | Résultat                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-07-15 | Diff complet fork vs upstream (bugs/incohérences)            | 25 findings (FIX-01→25), 6 corrigés le jour même                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2026-07-15 | Améliorations (perf, sécu, scalabilité, maintenabilité, UX)  | 21 items (IMP-01→21)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 2026-07-15 | Implémentation IMP-17 (tests d'intégration isolation)        | Suite de 16 tests bout-en-bout créée ; a découvert et corrigé 2 bugs de sécurité critiques préexistants (FIX-26, FIX-27) + 1 bug bloquant `database:reset` (FIX-28)                                                                                                                                                                                                                                                                                                                                                                                                              |
| 2026-07-15 | Implémentation IMP-06 (index/contraintes sur les jonctions)  | Complète le travail déjà livré par un autre agent : couverture étendue à `calendarEventEntityAudience`, nouvel index simple `internalEntityId` sur chaque jonction + sur `opportunity.internalEntityId`. 135/135 tests unitaires, 16/16 intégration.                                                                                                                                                                                                                                                                                                                             |
| 2026-07-16 | Implémentation IMP-09 / IMP-10 (config en env)               | `INTERNAL_ENTITY_SEEDS` branché sur `InternalEntityConfigurationService` dans `init-internal-entities` + `import-csv` ; résolveur de seed dupliqué supprimé (résout IMP-16). IMP-10 constaté déjà livré. Durcissement `ConfigVariables` (env-only) sur les deux variables.                                                                                                                                                                                                                                                                                                       |
| 2026-07-16 | Consolidation du backlog (`.md`)                             | Ajout d'une feuille de route priorisée (5 tiers), étoffement de toutes les fiches restantes (bug détaillé + correction proposée + effort), correction du tableau de bord (IMP 13/8), IMP-16 acté `FAIT` via IMP-09.                                                                                                                                                                                                                                                                                                                                                              |
| 2026-07-16 | Test end-to-end de l'app locale (UI + DB réelles)            | ✅ Front/serveur/GraphQL/DB sains ; ✅ index IMP-06 constatés en base sur les 4 jonctions + opportunity (posés par la commande d'upgrade au boot) ; ✅ fix « notes/tâches sur opportunité » validé en réel (note + tâche créées et persistées avec leurs targets) ; ✅ filtrage par entité (FIX-26) démontré (Ma Société → 0 opp non taguées, Vue Groupe → 50) ; 🐛 2 nouveaux findings : FIX-29 (wizard superadmin non idempotent), FIX-30 (nommage hérité `entiteInterne` non migré).                                                                                          |
| 2026-07-16 | Correction FIX-29 (wizard superadmin idempotent)             | Récupération des conflits duplicate via `conflictingRecordId` (entités) + tolérance duplicate (memberships, index IMP-06). Validé en réel : wizard re-déclenché sur base avec 7 entités préexistantes → soumission OK, aucun doublon ajouté, onboarding complété. 8/8 tests unitaires, typecheck front OK.                                                                                                                                                                                                                                                                       |
| 2026-07-16 | Correction FIX-30 (migration nommage hérité `entiteInterne`) | Migration SQL idempotente en tête d'`init-internal-entities` (renommage → `internalEntity`, anti-collision, invalidation flat maps). Testé en réel sur état legacy reproduit : 2 champs migrés, commande complète, re-run sans effet. Au passage, le run d'`init` débloqué a fusionné les 3 doublons d'entités de FIX-29 (FIX-05 + audit logger IMP-11).                                                                                                                                                                                                                         |
| 2026-07-16 | Déploiement prod + hygiène CI/CD et git                      | Commit intégral `0c4df7cd21` (100 fichiers) poussé sur origin (branche + main, fast-forward sans PR) et déployé sur Dokku (`b667280a38` → https://20.devbystep.fr, healthz/GraphQL vérifiés). CI fork : 6 workflows upstream cassés/inutiles désactivés (CD deploy main/tag, AI Catalog Sync, Crowdin ×3), run E2E bloqué annulé, `CD Dokku build` conservé (image GHCR, vert). Git : main FF, 9 branches locales et 6 distantes mergées supprimées. À configurer côté VPS : `BOOTSTRAP_ADMIN_EMAILS` (sinon pas de nouvelle élévation bootstrap ; comptes existants inchangés). |
