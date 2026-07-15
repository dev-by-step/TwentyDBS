# CONVENTIONS.md — Conventions de code Twenty

## Composants

- Fonctionnels uniquement, exports nommés (jamais `export default`).
- Composants < 300 lignes. Services < 500 lignes. Au-delà, extraire.
- Un composant dans son propre répertoire avec ses tests + stories quand pertinent.

## Types

- `type` plutôt qu'`interface` (sauf extension de types tiers).
- Enums : string literals préférés (sauf enums GraphQL).
- **Zéro `any`**. Si `unknown` est nécessaire, narrower via guards.
- Générique TypeScript : descriptif + préfixe `T` (`TData`, `TFilter`).

## State

- **Jotai** uniquement pour le global UI (atoms, selectors, atom families).
- Pas d'accès direct au cache Apollo depuis un composant : passer par un hook dédié.
- Après mutation : invalider via `refetchQueries` ou `cache.evict`, pas de manip directe.

## Styling

- **Linaria** (zero-runtime CSS-in-JS).
- Variables de thème via `themeCssVariables`.
- Pas de styles inline (`style={…}`) sauf si la valeur est dynamique à chaque render.

## i18n

- **Lingui**. Macros `t\`…\`` ou `msg\`…\``.
- Identifiants explicites en anglais, stables, sans espaces ni caractères spéciaux.

## Fichiers (kebab-case + suffixe descriptif)

| Type | Convention | Exemple |
|------|------------|---------|
| Composant React | `<name>.component.tsx` | `entity-badge.component.tsx` |
| Service NestJS | `<name>.service.ts` | `internal-entity.service.ts` |
| Module NestJS | `<name>.module.ts` | `internal-entity.module.ts` |
| Entity TypeORM | `<name>.entity.ts` | `internal-entity.entity.ts` |
| DTO | `<name>.dto.ts` | `timeline-calendar-event.dto.ts` |
| Hook React | `useCamelCase.ts` | `useEntityFilter.ts` |
| Atom Jotai | `camelCaseState.ts` ou `camelCaseAtom.ts` | `selectedEntityIdState.ts` |
| Constante | `PascalCaseFile.ts` exportant `SCREAMING_SNAKE_CASE` | `InternalEntityObjectNameSingular.ts` |
| Util pure | `<name>.util.ts` | `normalize-optional-entity-id.util.ts` |
| Spec | `<name>.spec.ts` ou `<name>.test.tsx` | `calendar-privacy.service.spec.ts` |

## Nommage

- **Pas d'abréviations.** `fieldMetadata`, pas `fm`. `user`, pas `u`. `internalEntity`, pas `ie`.
- Booléens préfixés : `is*`, `has*`, `should*`, `can*`.
- Fonctions effectives préfixées par un verbe : `resolveContext`, `buildScopedFilter`, `applyMask`.

## Helpers utilitaires (à utiliser au lieu de réécrire)

```ts
import { isDefined, isNonEmptyString, isNonEmptyArray } from 'twenty-shared/utils';
import { normalizeOptionalEntityId } from 'src/engine/utils/normalize-optional-entity-id.util';
```

- `isDefined(x)` → `x !== null && x !== undefined`. Pas de `x != null` ailleurs.
- `normalizeOptionalEntityId` → trim + lowercase ; à utiliser sur toute valeur d'entité provenant d'une source moins fiable (HTTP header, colonne persistée, payload).

## Architecture backend NestJS

- **Service / Repository** : la logique métier vit dans le service, jamais dans le resolver.
- Les resolvers exposent les opérations, déléguent à un service injecté.
- Les query hooks (`*.findMany`, `*.createOne`, …) sont la couche d'interception transverse — pas de logique métier dedans, juste un appel au service approprié.
- Les intercepteurs GraphQL (ex. `CalendarPrivacyInterceptor`) sont enregistrés dans le module concerné, **pas globalement**.

## Architecture frontend

- Modules indépendants dans `src/modules/<feature>/` :
  ```
  feature/
  ├── components/  ← composants React
  ├── hooks/       ← useXxx
  ├── states/      ← atoms Jotai
  ├── constants/   ← constantes typées
  ├── types/       ← types réutilisés
  ├── utils/       ← fonctions pures
  └── graphql/     ← queries + mutations dédiées
  ```
- Pas d'imports cycliques entre modules. Si nécessaire, extraire dans `twenty-shared`.

## Tests

- Factories partagées dans `__tests__/factories/` dès qu'une donnée est réutilisée.
- Pas de `faker` dispersé dans les tests : factory dédiée si réutilisable.
- UUIDs générés dynamiquement (`faker.string.uuid()`, `crypto.randomUUID()`), pas codés en dur — sauf si le test vérifie explicitement une valeur stable.
- Une factory génère **une entité complète**, pas seulement un `id`, pour la lisibilité.
- Les messages d'erreur attendus réutilisent les constantes métier — jamais de duplication de chaînes.
- CSV de test : `papaparse.unparse`, jamais de concaténation manuelle.
- Pas de mocks de DB pour les tests d'intégration (`test:integration:with-db-reset`).

## SQL et sécurité (rappel `RULES.md`)

- Identifiants table/colonne échappés explicitement.
- Données dynamiques via placeholders (`$1`, `$2`) dans `values`.
- Une query n'est "préparée" que si les valeurs sont dans `values`, jamais interpolées dans `text`.

## Lisibilité

- Extraire les conditions complexes dans des variables nommées avant un `if`.
- Extraire les valeurs répétées dans des constantes explicites.
- Éviter les template literals inutiles (`\`${x}\``) quand `String(x)` ou x suffit.
- Préférer `early return` à des conditions imbriquées.
