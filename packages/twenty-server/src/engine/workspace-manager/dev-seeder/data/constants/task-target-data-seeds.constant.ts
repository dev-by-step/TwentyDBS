import { COMPANY_DATA_SEEDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/company-data-seeds.constant';
import { OPPORTUNITY_DATA_SEEDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/opportunity-data-seeds.constant';
import { PERSON_DATA_SEEDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/person-data-seeds.constant';
import { TASK_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/task-data-seeds.constant';

type TaskTargetDataSeed = {
  id: string;
  taskId: string | null;
  targetPersonId: string | null;
  targetCompanyId: string | null;
  targetOpportunityId: string | null;
};

export const TASK_TARGET_DATA_SEED_COLUMNS: (keyof TaskTargetDataSeed)[] = [
  'id',
  'taskId',
  'targetPersonId',
  'targetCompanyId',
  'targetOpportunityId',
];

// Generate all task target IDs
const GENERATE_TASK_TARGET_IDS = (): Record<string, string> => {
  const TASK_TARGET_IDS: Record<string, string> = {};

  // Person task targets (ID_1 to ID_1200)
  for (let INDEX = 1; INDEX <= 1200; INDEX++) {
    const HEX_INDEX = INDEX.toString(16).padStart(4, '0');

    TASK_TARGET_IDS[`ID_${INDEX}`] =
      `60606060-${HEX_INDEX}-4e7c-8001-123456789def`;
  }

  // Company task targets (ID_1201 to ID_1800)
  for (let INDEX = 1201; INDEX <= 1800; INDEX++) {
    const HEX_INDEX = INDEX.toString(16).padStart(4, '0');

    TASK_TARGET_IDS[`ID_${INDEX}`] =
      `60606060-${HEX_INDEX}-4e7c-9001-123456789def`;
  }

  return TASK_TARGET_IDS;
};

const TASK_TARGET_DATA_SEED_IDS = GENERATE_TASK_TARGET_IDS();

// Generate task target data seeds
const GENERATE_TASK_TARGET_SEEDS = (): TaskTargetDataSeed[] => {
  const TASK_TARGET_SEEDS: TaskTargetDataSeed[] = [];

  PERSON_DATA_SEEDS.forEach((person, index) => {
    const taskIndex = index + 1;

    TASK_TARGET_SEEDS.push({
      id: TASK_TARGET_DATA_SEED_IDS[`ID_${taskIndex}`],
      taskId: TASK_DATA_SEED_IDS[`ID_${taskIndex}`],
      targetPersonId: person.id,
      targetCompanyId: null,
      targetOpportunityId: null,
    });
  });

  COMPANY_DATA_SEEDS.forEach((company, index) => {
    const taskIndex = PERSON_DATA_SEEDS.length + index + 1;

    TASK_TARGET_SEEDS.push({
      id: TASK_TARGET_DATA_SEED_IDS[`ID_${taskIndex}`],
      taskId: TASK_DATA_SEED_IDS[`ID_${taskIndex}`],
      targetPersonId: null,
      targetCompanyId: company.id,
      targetOpportunityId: null,
    });
  });

  // FIX-39 : idem que pour les notes — aucune tâche n'était rattachée à une
  // opportunité, l'onglet Tasks d'une fiche affaire restait donc vide en local.
  const TASKS_PER_OPPORTUNITY = 2;
  const firstOpportunityTaskIndex =
    PERSON_DATA_SEEDS.length + COMPANY_DATA_SEEDS.length + 1;

  OPPORTUNITY_DATA_SEEDS.forEach((opportunity, opportunityIndex) => {
    for (let slot = 0; slot < TASKS_PER_OPPORTUNITY; slot++) {
      const taskIndex =
        firstOpportunityTaskIndex +
        opportunityIndex * TASKS_PER_OPPORTUNITY +
        slot;

      TASK_TARGET_SEEDS.push({
        id: TASK_TARGET_DATA_SEED_IDS[`ID_${taskIndex}`],
        taskId: TASK_DATA_SEED_IDS[`ID_${taskIndex}`],
        targetPersonId: null,
        targetCompanyId: null,
        targetOpportunityId: opportunity.id,
      });
    }
  });

  return TASK_TARGET_SEEDS;
};

export const TASK_TARGET_DATA_SEEDS = GENERATE_TASK_TARGET_SEEDS();

// Map for O(1) lookups by task ID
export const TASK_TARGET_DATA_SEEDS_MAP = new Map<string, TaskTargetDataSeed>(
  TASK_TARGET_DATA_SEEDS.filter((target) => target.taskId !== null).map(
    (target) => [target.taskId!, target],
  ),
);
