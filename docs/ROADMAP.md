# Roadmap — Definition of Done par Carte

> Mise à jour doc au 2026-05-11, alignée sur l'état réel du code local.
> Cartes 2, 3 et 4 sont implémentées. La carte 1 est en place côté schéma /
> seed / hooks, mais la migration CSV locale reste partiellement validée sur le
> dataset seed Apple car ses opportunités ne correspondent pas aux 10 UUID du
> CSV réel.

---

## Carte 1 — `1-init-projet` : Initialisation & Schema

**Objectif :** Setup du repo, création de l'objet `InternalEntity` via le Metadata Engine, relations M2M, seed des 4 entités, migration des opportunités existantes.

### Fichiers attendus / modifiés
- `packages/twenty-server/src/modules/internal-entity/` ← nouveau module NestJS
- Seed des 4 entités initiales
- Script de migration des opportunités CSV

### Critères d'Acceptation

**Init projet (réalisé)**
- [x] Fork `twentyhq/twenty` → `dev-by-step/twenty-crm`
- [x] Remote `upstream` configuré (twentyhq/twenty)
- [x] `CLAUDE.md` fusionné, `.gitignore` étendu, norme commit Gitmoji + Français

**Schema & Metadata (validé localement — branches `1-init-projet` à `3-filtrage-vues-entites`)**
- [x] L'objet `InternalEntity` est créé via `ObjectMetadataService` (pas SQL direct)
- [x] Champs minimaux : `name` (string), `color` (string), `workspaceId` (UUID)
- [x] Relation M2M `InternalEntity ↔ Person` créée via le Metadata Engine
- [x] Relation M2M `InternalEntity ↔ Company` créée via le Metadata Engine
- [x] Les 4 entités sont seedées : `WEKNOW`, `DEVBYSTEP`, `ALLSENSIA`, `ANGLE_INTELLIGENCE`
- [x] Le script de migration des opportunités est exécuté avec succès
- [ ] 0 opportunité orpheline après migration sur les workspaces locaux
- [x] `npx nx typecheck twenty-server` passe sans erreur
- [ ] Les 10 opportunités CSV réelles sont présentes dans l'instance cible et vérifiées post-migration

> Validation locale du 2026-04-29 :
> - la commande `init-internal-entities` crée / met à jour le schéma multi-entités
>   et seed les 4 `InternalEntity` par workspace ;
> - elle met à jour les `Opportunity` dont l'UUID existe dans le workspace, puis
>   propage les memberships `Company` / `Person` à partir des opportunités taggées
>   et des relations `Person.companyId` ;
> - aucun fallback par créateur n'est appliqué sur l'historique ;
> - sur le seed Apple local, aucun des 10 UUID du CSV n'existe, donc
>   `50 opportunité(s) sans internalEntityId` restent signalées après migration.

---

### Data Migration Strategy

**Source :** `docs/opportunity.csv` — 10 opportunités réelles de l'instance actuelle.

#### Analyse de la structure CSV

| Colonne | Type | Rôle | Remarques |
|---------|------|------|-----------|
| `Id` | UUID | PK de l'opportunité | Conserver tel quel, pas de re-génération |
| `Nom` | string | Nom de l'opportunité | Champ libre, conserver intact |
| `Société` | JSON array | **Signal d'entité** : `["WEKNOW"]` | Mapper → `InternalEntity.name` |
| `Montant / Amount` | integer | Valeur du deal | 2 opportunités à 0 (non renseignées) |
| `Montant / Currency` | string | Devise | 100 % EUR dans le jeu actuel |
| `Entreprise Id` | UUID | FK → `Company` | Présent sur toutes les lignes |
| `Point de contact Id` | UUID | FK → `Person` (optionnel) | 4 lignes vides — nullable autorisé |
| `Étape` | enum | Stage pipeline | 4 valeurs distinctes (voir ci-dessous) |

#### Entités détectées dans `Société`

| Entité (`Société`) | Nb opportunités | Montant total |
|--------------------|-----------------|---------------|
| `WEKNOW` | 8 | 112 520 EUR |
| `DEVBYSTEP` | 1 | 11 400 EUR |
| `ALLSENSIA` | 1 | 1 500 EUR |
| `ANGLE_INTELLIGENCE` | 0 dans CSV | — (entité seedée, sans fallback automatique) |

#### Étapes pipeline présentes

| Valeur CSV (`Étape`) | Nb | Montant |
|----------------------|----|---------|
| `PROPOSITION_ENVOYEE` | 6 | 106 520 EUR |
| `GAGNE` | 2 | 7 500 EUR |
| `PROPOSITION_A_TRAITER` | 1 | 0 EUR |
| `RDV_PLANIFIE` | 1 | 0 EUR |

#### Règle de mapping `Société` → `InternalEntity`

```
Société[0] == "WEKNOW"    → InternalEntity WHERE name = 'WEKNOW'
Société[0] == "DEVBYSTEP" → InternalEntity WHERE name = 'DEVBYSTEP'
Société[0] == "ALLSENSIA" → InternalEntity WHERE name = 'ALLSENSIA'
Société == null / vide    → aucune migration automatique, ligne ignorée avec warning
Société inconnue          → aucune migration automatique, ligne ignorée avec warning
```

> **Note :** `ANGLE_INTELLIGENCE` est bien seedée lors de l'initialisation, mais
> n'est plus utilisée comme fallback implicite dans la migration CSV.

#### Stratégie du script de migration

Le script doit être **idempotent** (rejouable sans doublon) et s'exécuter **après** le seed des `InternalEntity`.

```
ÉTAPE 1 — Vérifier que les 4 InternalEntity sont en base
ÉTAPE 2 — Pour chaque ligne du CSV :
            a. Résoudre Société[0] → internal_entity_id
            b. Si pas de match → logger un warning et ignorer la ligne
            c. UPDATE Opportunity SET internal_entity_id = ? WHERE id = ?
ÉTAPE 3 — Propager les memberships `Company` / `Person` depuis les opportunités taggées
          puis depuis les relations `Person.companyId`
ÉTAPE 4 — Vérification : SELECT COUNT(*) WHERE internal_entity_id IS NULL
ÉTAPE 5 — Log du résultat : X opportunités migrées, Y lignes ignorées
```

**Points de vigilance :**
- Ne jamais re-créer les UUIDs existants — UPDATE uniquement, pas INSERT
- `Point de contact Id` vide est valide, ne pas lever d'erreur sur ce champ
- Les montants à `0` sont légitimes, ne pas filtrer
- La colonne `Société` est un JSON array — parser avec `JSON.parse(value)[0]`
- Le seed Apple local n'est pas un clone du CSV réel ; la validation locale ne prouve
  donc pas à elle seule la migration de production

---

## Carte 2 — `2-identification-entite-source` : Auto-Tagging

**Objectif :** Chaque objet créé est automatiquement associé à l'entité de l'utilisateur créateur.

### Fichiers attendus / modifiés
- Hooks workspace `*.createOne` / `*.createMany` en pre/post query
- Extension du profil `User` pour stocker `entityId`

### Critères d'Acceptation
- [x] Le profil `User` stocke un `entityId` (FK → `InternalEntity`)
- [x] Des hooks `*.createOne` / `*.createMany` interceptent la création de `Person`, `Company`, `Opportunity`
- [x] Les hooks lisent `user.entityId` depuis le contexte de la requête
- [x] `Opportunity` reçoit automatiquement `internalEntityId`
- [x] `Person` et `Company` reçoivent automatiquement une ligne de membership M2M vers `InternalEntity`
- [x] Si `entityId` absent du user, la création échoue avec un message clair
- [x] `npx nx typecheck twenty-server` passe sans erreur

---

## Carte 3 — `3-filtrage-vues-entites` : Global Context Filter

**Objectif :** Bascule de vue d'entité dans l'UI ; toutes les requêtes GraphQL sont filtrées par le scope actif.

### Fichiers attendus / modifiés
- `packages/twenty-front/src/modules/entity-filter/` ← nouveau module
- Atom Jotai : `selectedEntityIdAtom`
- Hook : `useEntityFilter()`
- Composant : `entity-selector.component.tsx` (dans la navbar)
- Injection du filtre dans les hooks de record index / list / aggregate

### Critères d'Acceptation
- [x] Une bascule `Ma Société` / `Vue Groupe` est visible dans la navigation principale
- [x] La sélection persiste dans un atom Jotai (`selectedEntityIdAtom`)
- [x] Toutes les vues de listes (People, Companies, Deals) se filtrent automatiquement
- [x] L'option `Vue Groupe` affiche les données consolidées (sans filtre)
- [x] Aucun composant existant n'est cassé
- [x] `npx nx typecheck twenty-front` passe sans erreur

> État actuel : la carte 3 implémente un switch binaire `Ma Société` / `Vue Groupe`.
> La sélection explicite parmi les 4 entités internes n'est pas encore en place.

---

## Carte 4 — `4-gestion-contacts-multi-societes` : UI M2M

**Objectif :** Interface permettant d'associer / dissocier plusieurs entités sur une fiche contact.

### Fichiers attendus / modifiés
- `packages/twenty-front/src/modules/object-record/` (composant de champ M2M)
- Mutations GraphQL génériques existantes de création / suppression du record de jonction

### Critères d'Acceptation
- [x] La fiche `Person` affiche les entités associées sous forme de badges cliquables
- [x] Un bouton "Ajouter une entité" ouvre un sélecteur (dropdown)
- [x] Cliquer sur un badge existant propose la suppression (avec confirmation)
- [x] Les mutations sont atomiques (pas de state intermédiaire incohérent)
- [x] Un contact peut appartenir à 1 à N entités simultanément
- [x] `npx nx typecheck twenty-front` passe sans erreur

> Validation locale du 2026-05-11 :
> - la fiche `Person` affiche les entités via les composants dédiés
>   `InternalEntityRelationFieldDisplay` et `InternalEntityRelationPicker` ;
> - l'ajout / la suppression de relation passent par les mutations génériques
>   de record de jonction déjà présentes dans l'application ;
> - la mise à jour du store local sur ajout est déclenchée uniquement après
>   succès de la mutation de création, ce qui évite tout état intermédiaire
>   incohérent ;
> - tests ciblés passés :
>   `useUpdateJunctionRelationFromCell.test.tsx`,
>   `InternalEntityRelationPicker.test.tsx`,
>   `PageLayoutRelationWidgetsSyncEffect.test.tsx`,
>   `usePageLayoutWithRelationWidgets.test.tsx` ;
> - `npx nx typecheck twenty-front` passe localement.

---

## Carte 5 — `5-anonymisation-calendrier-tiers` : Privacy Proxy

**Objectif :** Intercepter les requêtes calendrier inter-entités et remplacer le détail par "Occupé".

### Fichiers attendus / modifiés
- `packages/twenty-server/src/engine/api/graphql/interceptors/calendar-privacy.interceptor.ts`
- Enregistrement dans le module GraphQL (pas global)

### Critères d'Acceptation
- [x] L'intercepteur détecte si `entity_id` du créneau ≠ `entity_id` de l'utilisateur requêtant
- [x] Si différent : `title`, `description`, `attendees` sont remplacés par `"Occupé"` / `null`
- [x] Les champs `startAt`, `endAt` restent visibles (pour la planification)
- [x] Un créneau de la même entité passe sans transformation
- [x] Les tests unitaires couvrent les deux cas (même entité, entité différente)
- [x] `npx nx typecheck twenty-server` passe sans erreur

> Validation locale du 2026-05-11 :
> - l'anonymisation inter-entités est appliquée à la timeline GraphQL via
>   `CalendarPrivacyInterceptor` et réutilisée aussi dans les hooks calendrier
>   workspace pour garder une règle homogène ;
> - le masquage conserve `startAt` et `endAt`, et anonymise aussi les champs
>   sensibles dérivés (`location`, `conferenceSolution`, `conferenceLink`,
>   participants) pour éviter les fuites par métadonnées ;
> - la résolution de l'entité requêtante supporte plusieurs sources de contexte
>   (`user.entityId`, `user.id`, `workspaceMemberId`) ;
> - si l'identité du requêtant est partielle mais non résoluble, le service
>   masque par défaut plutôt que de divulguer des données ;
> - les vérifications de propriété de calendrier sont batchées pour éviter les
>   requêtes N+1 dans les hooks de visibilité ;
> - tests ciblés passés :
>   `calendar-privacy.service.spec.ts`,
>   `calendar-privacy.interceptor.spec.ts`,
>   `apply-calendar-events-visibility-restrictions.service.spec.ts`,
>   `timeline-calendar-event.service.spec.ts` ;
> - `npx nx typecheck twenty-server` passe localement.

---

## Carte 6 — `6-visualisation-calendrier-groupe` : Multi-Stream Calendar

**Objectif :** ETQU utilisateur, je peux visualiser la charge globale du groupe sur un seul calendrier.

### Fichiers attendus / modifiés
- `packages/twenty-front/src/modules/activities/group-calendar/` (nouveau module)
- Page : `pages/group-calendar/GroupCalendarPage.tsx`
- Hook : `useGroupCalendarEvents`
- Service backend : `TimelineCalendarEventService.getGroupCalendarEvents`

### Critères d'Acceptation
- [x] La vue calendrier affiche les créneaux occupés des entités sur un seul calendrier
- [x] Je peux voir les créneaux de mes collègues des autres sociétés dans la vue groupe
- [x] Les créneaux d'autres entités respectent la règle de la Carte 5 (anonymisation du détail, conservation des horaires)
- [x] La vue supporte les modes Jour, Semaine, Mois
- [x] `npx nx typecheck twenty-front` passe sans erreur

---

## Carte 7 — `7-identification-porteur-calendrier` : Entity Ownership on Calendar

**Objectif :** ETQU utilisateur, je peux identifier le porteur d'un projet sur le calendrier grâce à une couleur associée à la société responsable.

### Fichiers attendus / modifiés
- `packages/twenty-front/src/modules/activities/group-calendar/components/GroupCalendarEventsCard.tsx`
- Mapping `InternalEntity.color` via `TimelineCalendarEventService.buildCalendarEventEntityColorMap`
- Exposition `entityColor` sur `TimelineCalendarEventDTO`

### Critères d'Acceptation
- [x] Chaque créneau du calendrier affiche une bordure de couleur correspondant à la société responsable
- [x] La couleur provient de `InternalEntity.color`
- [x] Le repère visuel reste visible même quand le détail du créneau est anonymisé par la Carte 5
- [x] Je peux identifier rapidement quelle société porte le créneau depuis la vue calendrier
- [x] `npx nx typecheck twenty-front` passe sans erreur

---

## Carte 10 — `10-permissions-entites` : Permissions multi-entités + Audience calendrier

**Objectif :** ETQU plateforme, isoler les données CRM par entité interne via un
système de permissions transverse (lecture, mutation, bulk, merge,
duplicates) ; ETQU utilisateur, choisir l'audience d'un événement de
calendrier (groupe entier ou liste d'entités spécifiques, y compris une
entité dont je ne fais pas partie).

### Fichiers attendus / modifiés

**Permissions transverses :**
- `packages/twenty-server/src/modules/internal-entity/query-hooks/services/internal-entity-access-policy.service.ts`
- `packages/twenty-server/src/modules/internal-entity/query-hooks/internal-entity-access-*.pre-query-hook.ts` (16 hooks branchés sur `*.findMany`, `*.findOne`, `*.groupBy`, `*.create*`, `*.update*`, `*.delete*`, `*.destroy*`, `*.restore*`, `*.findDuplicates`, `*.mergeMany`)
- `packages/twenty-server/src/modules/internal-entity/services/workspace-member-internal-entity.service.ts`
- Constantes : `ENTITY_SCOPED_OBJECT_NAMES`, `ENTITY_CONFIGURATION_OBJECT_NAMES`, `PERSONAL_WORK_OBJECT_NAMES`, `HYBRID_SCOPED_OBJECT_NAMES`
- Rôles : `STANDARD_ROLE.entityManager` (créé dans le seeder dev)
- Header HTTP : `ACTIVE_INTERNAL_ENTITY_ID_HEADER_NAME` (twenty-shared)

**Audience calendrier per-event :**
- Nouvel objet metadata `calendarEventEntityAudience` (junction M2M `CalendarEvent ↔ InternalEntity`) seedé par `init-internal-entities`
- Champ `sharingScope` sur `CalendarEvent` : `ENTITY_ONLY` (défaut) | `WORKSPACE_PUBLIC`
- `CalendarPrivacyService.loadAudienceEntityIdsByCalendarEventId` consulte la M2M
- Modal `GroupCalendarCreateEventModal.tsx` : sélecteur d'audience (radio "Tout le groupe" / "Entités spécifiques" + chips couleur)
- Édition : auto-générée par Twenty via le picker de relation sur la fiche événement

### Critères d'Acceptation

**Scoping par entité :**
- [x] ~~Un utilisateur sans entité active (Vue Groupe) voit toutes les données CRM accessibles à son rôle (filtre désactivé en lecture).~~ **Révisé le 2026-07-18** : la Vue Groupe est désormais scopée à **toutes les entités d'appartenance du membre**, et non plus « aucun filtre ». Motif : la portée de lecture était dérivée d'un en-tête HTTP fourni par le client, donc une requête l'omettant lisait l'intégralité du workspace. La portée est maintenant toujours résolue côté serveur depuis les adhésions ; l'en-tête ne peut que **restreindre** à une entité dont l'appelant est membre, jamais élargir. Les platform admins conservent leur exemption de lecture.
- [x] Un utilisateur en Vue Société (`activeInternalEntityId` posé) ne voit que les `Company`/`Person`/`Opportunity`/`Membership`/`InternalEntity` rattachés à son entité.
- [x] Les mutations (`updateOne`, `deleteOne`, `bulkUpdate`, etc.) sont rejetées sur un enregistrement d'une autre entité, sauf pour `STANDARD_ROLE.admin` (platform admin) ou `STANDARD_ROLE.entityManager`.
- [x] `findDuplicates` et `mergeMany` sont restreints aux entity managers / platform admins, et uniquement sur des enregistrements de l'entité active.
- [x] ~~`Task`/`Note`/`Attachment`/`NoteTarget`/`TaskTarget` suivent la règle "personal work" (créateur ou assignee uniquement).~~ **Révisé le 2026-07-18** : `Note`/`NoteTarget` passent en **visibilité d'équipe** — une note est visible si on l'a écrite **ou** si elle est rattachée à une société / personne / opportunité de ses entités. Motif : une note portée par une affaire est une information d'équipe ; l'ancienne règle empêchait deux commerciaux d'une même entité de partager quoi que ce soit sur une même affaire, et interdisait tout audit au superadmin. Le cloisonnement multi-entités est préservé (une note d'une entité dont on n'est pas membre reste invisible). `Task`/`Attachment`/`TaskTarget` gardent la règle personal work.
- [x] `TimelineActivity` suit la règle hybride (OR createdBy personnel + targets visibles dans l'entité).

**Résilience metadata :**
- [x] Si l'objet `calendarEventEntityAudience` (ou les `junctionTargetFieldId` Person/Company) n'est pas encore créé sur le workspace, l'access policy ignore silencieusement le filtre concerné au lieu de remonter `Invalid filter`. Le service met le résultat de cette vérification en cache process.
- [x] Le filtre client envoyé par le front (`internalEntityId` / `internalEntitiesId`) est strippé avant validation si le scope field n'est pas disponible (`sanitizeEntityScopeFilterFromPayload`).

**Audience calendrier :**
- [x] Sur la création d'un événement, je peux choisir entre "Tout le groupe" (= `sharingScope: WORKSPACE_PUBLIC`) et "Entités spécifiques" (= membership M2M sur les `InternalEntity` sélectionnées).
- [x] Une `audienceEntities` non vide masque l'événement pour les utilisateurs hors audience (titre = "Occupé", description/location/attendees nuls), tout en gardant `startsAt`/`endsAt`.
- [x] Le créateur peut cibler une entité dont il ne fait pas partie (aucune contrainte d'appartenance imposée).
- [x] L'édition de l'audience se fait depuis la fiche événement (picker M2M auto-généré par Twenty).
- [x] Le modal front s'ouvre même si la metadata d'audience n'a pas encore été initialisée (gating via `useObjectMetadataItems`) — seul le mode "Tout le groupe" est exposé tant que `init-internal-entities` n'a pas tourné.

**Qualité :**
- [x] `npx nx typecheck twenty-server` et `npx nx typecheck twenty-front` passent.
- [x] `npx nx lint:diff-with-main twenty-server` et `npx nx lint:diff-with-main twenty-front` passent.
- [x] `internal-entity-access-policy.service.spec.ts` couvre les 4 familles de scope (entity, hybrid, personal, configuration) et la sanitization.
- [x] `calendar-privacy.service.spec.ts` couvre l'arbitrage WORKSPACE_PUBLIC / audience M2M / fallback Carte 5.

### Notes de mise en service
- Après tout reset DB ou ajout de relation, relancer `npx nx run twenty-server:command -- init-internal-entities` puis `npx nx run twenty-front:graphql:generate`.
- Le front communique l'entité active via header HTTP `ACTIVE_INTERNAL_ENTITY_ID_HEADER_NAME`. **Depuis le 2026-07-18** : Vue Groupe = header absent / vide → lecture scopée à **toutes les entités d'appartenance du membre** (et non plus « aucune contrainte »). Le header est une **restriction** optionnelle à une seule de ces entités : s'il désigne une entité dont l'appelant n'est pas membre, il est ignoré et la portée retombe sur son entité courante.
