# WORKFLOW.md — Commandes & flux de dev

## Démarrage

```bash
yarn dev                                # script local : front + back + worker
yarn start                              # commande Twenty équivalente

npx nx start twenty-front               # front seul
npx nx start twenty-server              # back seul
npx nx run twenty-server:worker         # worker seul
```

## Qualité de code (à exécuter après chaque changement)

```bash
# Lint sur le diff vs main (préféré, plus rapide)
npx nx lint:diff-with-main twenty-front
npx nx lint:diff-with-main twenty-server

# Typecheck (équivaut à tsc --noEmit via tsgo)
npx nx typecheck twenty-front
npx nx typecheck twenty-server

# Formatage (auto-fix)
npx nx fmt twenty-front
npx nx fmt twenty-server

# Fix auto Prettier sur le diff
npx nx lint:diff-with-main twenty-server --configuration=fix
npx nx lint:diff-with-main twenty-front --configuration=fix
```

## Tests

```bash
# Suite complète
npx nx test twenty-front
npx nx test twenty-server

# Tests d'intégration (reset DB inclus)
npx nx run twenty-server:test:integration:with-db-reset

# Un seul fichier
npx jest path/to/test.spec.ts --config=packages/twenty-server/jest.config.mjs
npx jest path/to/test.test.tsx --config=packages/twenty-front/jest.config.ts
```

## Base de données

```bash
# Reset complet du schéma
npx nx database:reset twenty-server

# Init / migrate production
npx nx run twenty-server:database:init:prod
npx nx run twenty-server:database:migrate:prod

# Générer une instance command (après modification d'une @Entity TypeORM)
npx nx run twenty-server:database:migrate:generate --name <nom> --type fast   # schéma
npx nx run twenty-server:database:migrate:generate --name <nom> --type slow   # data migration
```

> ⚠️ **Instance commands** : `up` et `down` sont obligatoires. Une fois committée, **ne jamais réécrire** une instance command — créer une nouvelle migration.

## Multi-entités (Carte 1 + 10)

Toute évolution de la metadata multi-entités (nouvel objet, nouvelle relation, nouveau `junctionTargetFieldId`) demande :

```bash
# 1. Recréer / mettre à jour la métadonnée du workspace
npx nx run twenty-server:command -- init-internal-entities

# 2. Régénérer les types GraphQL côté front
npx nx run twenty-front:graphql:generate

# 3. Hard refresh navigateur pour purger le cache Apollo
#    (Cmd+Shift+R sur macOS / Chrome)
```

Cette commande est **idempotente** : elle ne recrée pas ce qui existe, mais elle met à jour `junctionTargetFieldId` quand il manque.

## GraphQL

```bash
# Régénérer après tout changement de schéma core
npx nx run twenty-front:graphql:generate

# Idem pour le metadata schema (admin)
npx nx run twenty-front:graphql:generate --configuration=metadata
```

## Setup environnement dev (one-shot)

```bash
bash packages/twenty-utils/setup-dev-env.sh             # setup standard
bash packages/twenty-utils/setup-dev-env.sh --docker    # forcer Docker
bash packages/twenty-utils/setup-dev-env.sh --reset     # reset complet
```

## Protocole d'exécution par carte

Voir `RULES.md` — section "Protocole d'exécution par carte". Résumé :

1. Branche `[ID]-[name]`.
2. Lire la carte dans `docs/ROADMAP.md`.
3. Identifier puis lire les fichiers cibles.
4. Implémenter.
5. `typecheck` + `lint:diff-with-main` sur les deux packages touchés.
6. Lister les fichiers modifiés.
7. STOP — pas de merge, pas de PR sans approbation.

## Vérifier l'état d'un dev server

```bash
# Voir les process Node qui tournent
lsof -i :3000 -i :3001 2>/dev/null
ps aux | grep -E "twenty-(server|front)|nest|vite" | grep -v grep

# Logs du dev server (si lancé via le script repo)
tail -100 /tmp/twenty.log
```

Symptôme connu : `EMFILE: too many open files, watch` → chokidar a saturé. Le compilé tourne encore mais ne hot-reload plus. Solution : `yarn dev` à nouveau, ou augmenter `ulimit -n`.

## Debug fréquents

| Symptôme | Diagnostic | Remède |
|----------|-----------|--------|
| `Invalid filter : … doesn't have any "internalEntitiesId" field` | Metadata workspace incomplète | `init-internal-entities` |
| `ObjectMetadataItemNotFoundError: … cannot be found in an array of N elements` | Front : objet metadata absent | `init-internal-entities` + `graphql:generate` + hard refresh |
| Page entité-scopée vide ou alerte "Une erreur s'est produite" | Souvent typecheck server cassé → `nest start --watch` ne recompile plus | `npx nx typecheck twenty-server`, fix, restart |
| `EMFILE` chokidar | Trop de fichiers watch | Restart `yarn dev` ; `ulimit -n 4096` |
| Apollo renvoie de vieilles données après init | Cache stale | `graphql:generate` + hard refresh |
