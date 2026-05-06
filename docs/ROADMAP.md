# Roadmap — Definition of Done par Carte

> Mise à jour doc au 2026-04-29, alignée sur l'état réel du code local.
> Cartes 2 et 3 sont implémentées. La carte 1 est en place côté schéma / seed /
> hooks, mais la migration CSV locale reste partiellement validée sur le dataset
> seed Apple car ses opportunités ne correspondent pas aux 10 UUID du CSV réel.

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
- Mutations GraphQL : `addEntityToContact`, `removeEntityFromContact`

### Critères d'Acceptation
- [ ] La fiche `Person` affiche les entités associées sous forme de badges cliquables
- [ ] Un bouton "Ajouter une entité" ouvre un sélecteur (dropdown)
- [ ] Cliquer sur un badge existant propose la suppression (avec confirmation)
- [ ] Les mutations sont atomiques (pas de state intermédiaire incohérent)
- [ ] Un contact peut appartenir à 1 à N entités simultanément
- [ ] `npx nx typecheck twenty-front` passe sans erreur

---

## Carte 5 — `5-anonymisation-calendrier-tiers` : Privacy Proxy

**Objectif :** Intercepter les requêtes calendrier inter-entités et remplacer le détail par "Occupé".

### Fichiers attendus / modifiés
- `packages/twenty-server/src/engine/api/graphql/interceptors/calendar-privacy.interceptor.ts`
- Enregistrement dans le module GraphQL (pas global)

### Critères d'Acceptation
- [ ] L'intercepteur détecte si `entity_id` du créneau ≠ `entity_id` de l'utilisateur requêtant
- [ ] Si différent : `title`, `description`, `attendees` sont remplacés par `"Occupé"` / `null`
- [ ] Les champs `startAt`, `endAt` restent visibles (pour la planification)
- [ ] Un créneau de la même entité passe sans transformation
- [ ] Les tests unitaires couvrent les deux cas (même entité, entité différente)
- [ ] `npx nx typecheck twenty-server` passe sans erreur

---

## Carte 6 — `6-visualisation-calendrier-groupe` : Multi-Stream Calendar

**Objectif :** Vue calendrier affichant les créneaux de toutes les entités, avec code couleur.

### Fichiers attendus / modifiés
- `packages/twenty-front/src/modules/activities/calendar/` (extension ou nouveau composant)
- Hook : `useMultiEntityCalendar()`
- Query GQL fusionnant les 4 flux

### Critères d'Acceptation
- [ ] La vue calendrier affiche les créneaux des 4 entités simultanément
- [ ] Chaque entité a une couleur distincte (définie par `InternalEntity.color`)
- [ ] La légende des couleurs est visible
- [ ] Les créneaux d'autres entités respectent la règle de la Carte 5 (anonymisation)
- [ ] La vue supporte les modes Jour, Semaine, Mois
- [ ] `npx nx typecheck twenty-front` passe sans erreur

---

## Carte 7 — `7-badging-kanban-reporting` : Visual Badges & Dashboard

**Objectif :** Badge couleur sur chaque carte Kanban + Dashboard avec métriques agrégées par entité.

### Fichiers attendus / modifiés
- `packages/twenty-front/src/modules/views/` (composant Kanban card extension)
- Nouveau composant : `entity-dashboard.component.tsx`

### Critères d'Acceptation
- [ ] Chaque carte Kanban affiche un badge couleur correspondant à son entité
- [ ] Le badge est non-intrusif (coin supérieur droit, petit)
- [ ] Une page Dashboard liste les 4 entités avec :
  - Nombre de contacts
  - Nombre de deals (par statut)
  - Valeur pipeline totale
- [ ] Les métriques sont calculées côté serveur (pas de calcul frontend sur des listes entières)
- [ ] `npx nx typecheck twenty-front` passe sans erreur
