# REVIEW.md — Checklist de revue (points récurrents à éviter)

> À parcourir avant chaque demande de revue ou avant de marquer une carte "done".
> Issu des retours de revue PR successifs sur ce projet.

## Configuration et données

- [ ] Aucune valeur métier sensible codée en dur (ID, URL, seuil, label) si elle peut varier par workspace / env / usage. Préférer service de config, constantes mutualisées, `.env` ou settings administrables.
- [ ] Quand une valeur n'existe **que pour les tests**, ne pas la lier à un faux workspace "réaliste" : générer une valeur aléatoire ou utiliser une factory dédiée.
- [ ] Pas de duplication de constantes entre back et front : centraliser dans `twenty-shared` quand utilisé des deux côtés.

## Tests

- [ ] Pas de `faker` dispersé directement dans les fichiers de test si une factory existe (ou si la donnée est réutilisée).
- [ ] Factories partagées dans `__tests__/factories/` dès qu'une donnée est réutilisée dans plusieurs tests.
- [ ] Une factory génère une **entité complète**, pas seulement un `id`.
- [ ] UUIDs de test générés dynamiquement (`faker.string.uuid()` / `crypto.randomUUID()`), pas codés en dur — sauf vérification explicite d'une valeur stable.
- [ ] Messages d'erreur attendus dans les tests : réutiliser les constantes métier déjà définies dans l'implémentation, pas dupliquer des chaînes.
- [ ] CSV de test : `papaparse.unparse` ou helper typé, jamais de concaténation manuelle de strings.
- [ ] Pas de mocks de DB sur les tests d'intégration (`test:integration:with-db-reset`).
- [ ] Couvrir les **deux branches** d'une logique de sécurité (autorisé / refusé), pas juste le happy path.

## Lisibilité et maintenabilité

- [ ] Extraire les conditions complexes dans des variables nommées avant un `if`.
- [ ] Extraire les valeurs répétées dans des constantes explicites au lieu de les redéfinir.
- [ ] Éviter les template literals inutiles (`\`${x}\``) quand un accès direct suffit.
- [ ] Préférer `early return` aux conditions imbriquées.
- [ ] Pas de code mort : méthode inutilisée, branche inatteignable, fallback redondant → supprimer.
- [ ] Composant React > 300 lignes ou service > 500 lignes → découper.

## SQL et sécurité

- [ ] Identifiants table/colonne échappés explicitement (whitelist de noms autorisés).
- [ ] Données dynamiques passées via placeholders (`$1`, `$2`, …) dans `values` — jamais interpolées dans `text`.
- [ ] Vérifier que `dataSource.query(text, values)` reçoit bien deux arguments quand il y a des paramètres.
- [ ] Toute valeur d'entité venant d'une source moins fiable (header HTTP, payload, colonne externe) → passer par `normalizeOptionalEntityId`.

## i18n

- [ ] Identifiants i18n explicites en anglais, stables, sans espaces ni caractères spéciaux.
- [ ] Pas de renommage massif de clés i18n sans besoin clair de migration.
- [ ] Macros Lingui (`t\`…\``, `msg\`…\``) plutôt que strings nues dans l'UI.

## TypeScript

- [ ] Zéro `any` dans le diff. `unknown` + guard si nécessaire.
- [ ] Pas d'`as` sauvages : si on a besoin d'un cast, justifier ou améliorer le typage en amont.
- [ ] Génériques nommés (`TData`, `TFilter`), pas `T1`, `T2`.
- [ ] `type` plutôt qu'`interface` sauf extension de tiers.

## Privacy calendrier (Cartes 5 & 10)

- [ ] Tout nouveau champ de `CalendarEventWorkspaceEntity` ou `TimelineCalendarEventDTO` qui peut leak l'entité du propriétaire doit être ajouté à `applyWorkspaceCalendarEventMask` / `applyTimelineCalendarEventMask`.
- [ ] Tout chemin qui retourne un `CalendarEvent` à un client doit passer par `getCalendarEventMaskMap` ou un intercepteur équivalent.

## Permissions (Carte 10)

- [ ] Tout nouvel objet metadata "entity-scoped" doit être ajouté à `ENTITY_SCOPED_OBJECT_NAMES` (+ éventuellement `ENTITY_SCOPED_CRM_OBJECT_NAMES` / `ENTITY_CONFIGURATION_OBJECT_NAMES`).
- [ ] Tout nouveau champ `internalEntityId` / relation M2M vers `InternalEntity` doit être pris en compte dans `getEntityScopeFilter` ET dans `getEntityScopeFieldRequirement` (pour le gating metadata).
- [ ] Si un nouveau M2M est ajouté, vérifier que `init-internal-entities` :
  1. Crée l'objet de jonction.
  2. Crée les ONE_TO_MANY des deux côtés.
  3. Pose le `junctionTargetFieldId` sur les ONE_TO_MANY (via `updateOneField`).

## Multi-entités (Cartes 1 → 10)

- [ ] Aucun fallback par créateur sur les données historiques sans accord explicite.
- [ ] Backfill idempotent : `INSERT ... ON CONFLICT DO NOTHING/UPDATE`, jamais de duplicate.
- [ ] `workspaceId` présent dans **toutes** les queries (le metadata engine le requiert).

## Frontend — Apollo & metadata

- [ ] Avant d'appeler `useCreateOneRecord` / `useObjectMetadataItem` sur un objet metadata récent, vérifier sa présence via `useObjectMetadataItems` — sinon `ObjectMetadataItemNotFoundError` au mount.
- [ ] Après mutation : `refetchQueries` ou `cache.evict`, pas de mutation directe du cache.
- [ ] Pas d'accès direct au client Apollo dans un composant : passer par un hook dédié.

## Git

- [ ] Commit message respecte la norme Gitmoji + français à l'impératif (`RULES.md`).
- [ ] Aucun `Co-Authored-By`, `Generated by`, ou attribution IA.
- [ ] Un commit = un sujet. Pas de mélange feature + refacto + fix.
- [ ] Vérifier `git status` et `.gitignore` — pas de `.env`, dumps, ou `docs/opportunity.csv` committé par erreur.
