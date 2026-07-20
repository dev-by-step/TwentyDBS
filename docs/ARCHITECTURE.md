# Architecture Technique — Twenty CRM Multi-Entity

## Vue d'ensemble du projet Twenty

Twenty est un CRM open-source structuré en monorepo **Nx / Yarn 4** :

```
twenty/
├── packages/twenty-server/       ← NestJS API (GraphQL Yoga)
├── packages/twenty-front/        ← React 18 SPA (Vite)
├── packages/twenty-ui/           ← Librairie de composants partagés
├── packages/twenty-shared/       ← Types et utilitaires communs
├── packages/twenty-emails/       ← Templates email (React Email)
└── packages/twenty-e2e-testing/  ← Tests Playwright
```

**Stack réelle confirmée :**
- Frontend : React 18 · TypeScript · **Jotai** (state) · **Linaria** (styling) · Vite
- Backend : NestJS · TypeORM · PostgreSQL · Redis · GraphQL Yoga · BullMQ
- Monorepo : Nx workspace + Yarn 4

---

## Backend — Patterns à respecter

### Metadata Engine (cœur du système)

Twenty ne crée pas d'objets via des migrations SQL classiques. Il utilise un **Metadata Engine** qui génère dynamiquement les tables PostgreSQL.

**Flux de création d'un objet custom :**
```
MetadataModule
  └── ObjectMetadataService.createOne()
        └── WorkspaceMigrationRunnerService.executeMigrationFromPendingMigrations()
              └── PostgreSQL TABLE créée dynamiquement
```

**Fichiers clés :**
```
engine/metadata/object-metadata/object-metadata.service.ts
engine/metadata/field-metadata/field-metadata.service.ts
engine/metadata/relation-metadata/relation-metadata.service.ts
engine/workspace/workspace-migration-runner/
```

### Pattern Service / Repository

```typescript
// CORRECT — Clean Architecture
@Injectable()
export class InternalEntityService {
  constructor(
    @InjectRepository(InternalEntityObjectMetadata)
    private readonly internalEntityRepository: Repository<InternalEntityObjectMetadata>,
  ) {}

  async findByWorkspace(workspaceId: string): Promise<InternalEntityObjectMetadata[]> {
    return this.internalEntityRepository.find({ where: { workspaceId } });
  }
}

// INTERDIT — logique métier dans le resolver
@Resolver()
export class InternalEntityResolver {
  // Ne pas mettre de .find() ou .save() ici directement
}
```

### Intercepteurs GraphQL (Carte 5 — Anonymisation)

```typescript
// Pattern pour intercepter et filtrer les réponses GQL
@Injectable()
export class CalendarPrivacyInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map((data) => this.applyPrivacyFilter(data, context)),
    );
  }
}
// Enregistrement dans le module GraphQL, pas globalement
```

### Pre-query hooks d'accès (Carte 10 — Permissions multi-entités)

`InternalEntityAccessPolicyService` est branché sur tous les `*.findMany`,
`*.findOne`, `*.groupBy`, `*.create*`, `*.update*`, `*.delete*`, etc., via des
`WorkspaceQueryHook` génériques :

```
findMany → scopeFindManyPayload
            ├── sanitizeEntityScopeFilterFromPayload   ← retire les clés
            │                                            internalEntityId /
            │                                            internalEntitiesId du
            │                                            filtre client si la
            │                                            métadonnée n'est pas
            │                                            initialisée
            └── buildScopedFilter
                  ├── ENTITY_SCOPED   → filtre par activeInternalEntityId
                  │                     (gate `isEntityScopeFieldAvailable`
                  │                     en cache process)
                  ├── HYBRID_SCOPED   → timelineActivity (OR personnel +
                  │                     entité)
                  └── PERSONAL_WORK   → note/task/attachment/noteTarget/
                                        taskTarget (filtre par createdBy
                                        ou assignee)
```

**Gating métadonnée :** avant d'injecter un filtre `internalEntitiesId` /
`internalEntityId`, le service vérifie via `ObjectMetadataService` que le
champ relation existe et (pour les M2M Person/Company) que
`junctionTargetFieldId` est positionné. Si la métadonnée n'est pas prête
(workspace pas encore initialisé), le filtre est silencieusement ignoré pour
laisser passer les pages au lieu de planter avec `Invalid filter`.

**Header de scope :** le front pose l'entité active dans le header HTTP
`ACTIVE_INTERNAL_ENTITY_ID_HEADER_NAME` (cf. `twenty-shared/constants`),
normalisé via `normalizeOptionalEntityId` (trim + lowercase) côté serveur.
Vue Groupe = header absent → aucun filtre d'entité appliqué en lecture.

---

## Frontend — Patterns à respecter

### Apollo + Jotai

- **Apollo** : toutes les mutations/queries passent par des hooks générés (`useQuery`, `useMutation`)
- **Jotai** : state global UI (entité sélectionnée, filtres actifs) — atoms, selectors, atom families
- Ne jamais accéder au cache Apollo directement depuis un composant — passer par des hooks dédiés
- Invalider le cache après mutation : `refetchQueries` ou `cache.evict`, pas de manipulation directe

### Filtre Global d'Entité (Carte 3)

```
Jotai atom: selectedEntityIdAtom
    ├── null                    → Vue Groupe
    └── currentUser.entityId    → Ma Société
          └── Hook: useEntityFilter()
                └── Injecté dans: useFindManyRecords(), useLazyFindManyRecords(),
                                  useAggregateRecords() et hooks record-index
                      └── Toutes les views récupèrent automatiquement les données filtrées
```

### Structure de composant (SRP)

```
entity-filter/
├── components/entity-selector/entity-selector.component.tsx
├── hooks/useEntityFilter.ts
├── states/selectedEntityIdAtom.ts
├── constants/entityFilterViewMode.ts
└── utils/buildEntityScopedRecordFilter.ts
```

**Règles Twenty :**
- Composants < 300 lignes, services < 500 lignes
- Répertoires en kebab-case, fichiers avec suffixe descriptif
- Exports nommés uniquement (pas de default export)
- Components dans leur propre répertoire avec tests et stories

### Conventions de nommage Twenty (confirmées)

| Type | Convention | Exemple |
|------|-----------|---------|
| Fichier composant | kebab-case + `.component.tsx` | `entity-badge.component.tsx` |
| Fichier service | kebab-case + `.service.ts` | `internal-entity.service.ts` |
| Fichier module | kebab-case + `.module.ts` | `internal-entity.module.ts` |
| Fichier entity | kebab-case + `.entity.ts` | `internal-entity.entity.ts` |
| Hook | camelCase + `use` | `useEntityFilter.ts` |
| Atom Jotai | camelCase + `Atom` | `selectedEntityIdAtom` |
| Constante | SCREAMING_SNAKE_CASE | `DEFAULT_ENTITY_COLOR` |
| Generic TypeScript | descriptif + `T` prefix | `TData`, `TFilter` |

---

## Modèle de données — Multi-Entity

### Objet `InternalEntity` (Carte 1)

```
InternalEntity
├── id: UUID
├── name: string          ← Ex: "WEKNOW", "DEVBYSTEP"
├── color: string         ← Hex code pour les badges (Carte 7)
├── workspaceId: UUID     ← Isolation workspace Twenty
├── persons: Person[]     ← Relation M2M via junction table
└── companies: Company[]  ← Relation M2M via junction table
```

### Stockage réel du scope d'entité

```
User
└── entityId: UUID (FK → InternalEntity)    ← entité interne du profil connecté

Opportunity
└── internalEntityId: UUID                  ← FK directe

Person
└── internalEntities: M2M via PersonEntityMembership

Company
└── internalEntities: M2M via CompanyEntityMembership

WorkspaceMember
└── internalEntities: M2M via WorkspaceMemberEntityMembership

CalendarEvent
├── sharingScope: 'ENTITY_ONLY' | 'WORKSPACE_PUBLIC'
└── audienceEntities: M2M via CalendarEventEntityAudience (Carte 10)
```

### Audience de calendrier (Carte 10)

Arbitrage du masquage par événement, dans l'ordre (source de vérité : `calendar-privacy.service.ts`) :

1. `sharingScope = WORKSPACE_PUBLIC` → jamais masqué.
2. **Propriétaire du compte connecté (FIX-10)** → jamais masqué pour lui-même : le propriétaire de l'agenda voit toujours ses propres événements, quelles que soient les règles d'entité, d'audience ou de visibilité de canal (y compris si la visibilité du canal exclut sa propre entité).
3. `audienceEntities` (audience explicite) non vide → démasqué si l'entité du requêtant (ou sa présence en audience de personnes) est dans l'audience ; sinon masqué (l'auteur peut cibler une entité dont il ne fait pas partie).
4. Sinon → règle Carte 5 : démasqué si l'entité du requêtant fait partie de l'entité propriétaire du canal.
5. Sinon → démasqué si l'entité du requêtant fait partie des `visibleInternalEntityIds` du canal.
6. Sinon → masqué (créneau visible « Occupé » avec le badge de l'entité propriétaire).

Toutes les comparaisons d'IDs d'entité sont normalisées (`normalizeOptionalEntityId` / `normalizeEntityIdSet`) à chaque frontière (FIX-20).

### Propagation de l'entité (Carte 2)

```
User
└── entityId: UUID (FK → InternalEntity)

Création d'un Opportunity
└── Pre-query hook (*.createOne / *.createMany)
      └── Lit user.entityId
            └── Injecte internalEntityId dans le payload

Création d'un Person / Company
└── Post-query hook (*.createOne / *.createMany)
      └── Lit user.entityId
            └── Crée une ligne de membership M2M vers InternalEntity
```

### Backfill historique (commande `init-internal-entities`)

```
1. Seed / validation des 4 InternalEntity
2. Migration CSV des Opportunity par UUID
3. Propagation Company <- Opportunity
4. Propagation Person <- Opportunity
5. Propagation Company <- Person
6. Propagation Person <- Company
```

Notes :
- **aucun fallback par créateur n'est appliqué sur l'historique** (décision produit figée, FIX-08) : une opportunité sans correspondance CSV reste `internalEntityId = NULL` plutôt que d'être déduite du créateur ou du propriétaire ; le backfill ne réécrit jamais un `internalEntityId` déjà renseigné (`WHERE internalEntityId IS NULL`, FIX-07) — les réassignations manuelles sont donc préservées ;
- le dataset seed Apple local n'est pas aligné sur les UUID du CSV réel.

### Accès & inscription (politique produit)

- **Inscription sur invitation uniquement (FIX-13)** : l'auto-inscription (`signUp`) n'est autorisée que pour le domaine e-mail du premier super admin, un domaine listé dans `BOOTSTRAP_ADMIN_EMAILS`, ou une adresse déjà invitée. Les membres des 3 autres sociétés (DEVBYSTEP, ALLSENSIA, ANGLE_INTELLIGENCE) rejoignent le workspace **sur invitation d'un admin**. Décision assumée : pas de multi-domaine self-service.
- **Anti-énumération (IMP-12)** : tous les refus d'auto-inscription renvoient un message uniforme (aucune divulgation de l'existence d'un super admin / d'une invitation / d'un domaine), doublé d'un throttle par e-mail (`ThrottlerService`, 10 tentatives / 15 min) au-dessus du `CaptchaGuard`.
- **Onboarding par utilisateur (FIX-14)** : les drapeaux d'onboarding `invite-team` et `book-onboarding` sont stockés en userVars **au niveau utilisateur** (userId + workspaceId), jamais au niveau workspace partagé — un membre qui passe une étape n'affecte pas l'onboarding des autres.

---

## Commandes de développement (Nx)

```bash
# Démarrer tout l'environnement (script local du repo)
yarn dev
# (équivalent : yarn start)

# Type checking (remplace tsc --noEmit)
npx nx typecheck twenty-front
npx nx typecheck twenty-server

# Lint — toujours préférer le diff (plus rapide)
npx nx lint:diff-with-main twenty-front
npx nx lint:diff-with-main twenty-server

# Tests
npx nx test twenty-server
npx nx test twenty-front

# GraphQL — régénérer après tout changement de schéma
npx nx run twenty-front:graphql:generate

# Init multi-entités — à relancer après toute évolution de la metadata
# (ajout d'objet, nouvelle relation M2M, junctionTargetFieldId, …)
npx nx run twenty-server:command -- init-internal-entities

# Instance commands — obligatoire après tout changement d'entity TypeORM
npx nx run twenty-server:database:migrate:generate --name <nom> --type fast
npx nx run twenty-server:database:migrate:generate --name <nom> --type slow  # si migration de données
```

---

## Pièges connus de Twenty

1. **Metadata vs Data** : Les objets custom Twenty ont deux couches — les métadonnées (schéma) et les données (instances). Ne pas confondre `ObjectMetadataEntity` et l'objet runtime.
2. **WorkspaceId partout** : Chaque query doit être scopée par `workspaceId`. Le metadata engine le requiert.
3. **Apollo Cache** : Après mutation, invalider le cache via `refetchQueries` ou `cache.evict`, pas de manipulation directe.
4. **TypeORM + Twenty** : Twenty utilise un `DataSourceService` custom pour le multi-tenant. Ne pas injecter `DataSource` directement — utiliser `TwentyORMGlobalManager`.
5. **Filtres ONE_TO_MANY via junction** : pour qu'un filtre `<field>Id: { in: [...] }` soit accepté sur une M2M, le champ relation côté Person/Company/CalendarEvent doit avoir `junctionTargetFieldId` positionné. Sinon `FilterArgProcessorService` lève `Invalid filter`. Le service `init-internal-entities` gère ce câblage ; côté front, ne pas appeler `useCreateOneRecord` / `useObjectMetadataItem` sur un objet metadata absent (ça throw au mount) — gater via `useObjectMetadataItems`.
