import { COMPANY_DATA_SEEDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/company-data-seeds.constant';
import { NOTE_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/note-data-seeds.constant';
import { PERSON_DATA_SEEDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/person-data-seeds.constant';

type NoteTargetDataSeed = {
  id: string;
  noteId: string | null;
  targetPersonId: string | null;
  targetCompanyId: string | null;
  targetOpportunityId: string | null;
};

export const NOTE_TARGET_DATA_SEED_COLUMNS: (keyof NoteTargetDataSeed)[] = [
  'id',
  'noteId',
  'targetPersonId',
  'targetCompanyId',
  'targetOpportunityId',
];

const GENERATE_NOTE_TARGET_IDS = (): Record<string, string> => {
  const NOTE_TARGET_IDS: Record<string, string> = {};

  for (let INDEX = 1; INDEX <= 1200; INDEX++) {
    const HEX_INDEX = INDEX.toString(16).padStart(4, '0');

    NOTE_TARGET_IDS[`ID_${INDEX}`] =
      `20202020-${HEX_INDEX}-4e7c-8001-123456789def`;
  }

  for (let INDEX = 1201; INDEX <= 1800; INDEX++) {
    const HEX_INDEX = INDEX.toString(16).padStart(4, '0');

    NOTE_TARGET_IDS[`ID_${INDEX}`] =
      `20202020-${HEX_INDEX}-4e7c-9001-123456789def`;
  }

  return NOTE_TARGET_IDS;
};

const NOTE_TARGET_DATA_SEED_IDS = GENERATE_NOTE_TARGET_IDS();

const GENERATE_NOTE_TARGET_SEEDS = (): NoteTargetDataSeed[] => {
  const NOTE_TARGET_SEEDS: NoteTargetDataSeed[] = [];

  PERSON_DATA_SEEDS.forEach((person, index) => {
    const noteIndex = index + 1;

    NOTE_TARGET_SEEDS.push({
      id: NOTE_TARGET_DATA_SEED_IDS[`ID_${noteIndex}`],
      noteId: NOTE_DATA_SEED_IDS[`ID_${noteIndex}`],
      targetPersonId: person.id,
      targetCompanyId: null,
      targetOpportunityId: null,
    });
  });

  COMPANY_DATA_SEEDS.forEach((company, index) => {
    const noteIndex = PERSON_DATA_SEEDS.length + index + 1;

    NOTE_TARGET_SEEDS.push({
      id: NOTE_TARGET_DATA_SEED_IDS[`ID_${noteIndex}`],
      noteId: NOTE_DATA_SEED_IDS[`ID_${noteIndex}`],
      targetPersonId: null,
      targetCompanyId: company.id,
      targetOpportunityId: null,
    });
  });

  return NOTE_TARGET_SEEDS;
};

export const NOTE_TARGET_DATA_SEEDS = GENERATE_NOTE_TARGET_SEEDS();

// Map for O(1) lookups by note ID
export const NOTE_TARGET_DATA_SEEDS_MAP = new Map<string, NoteTargetDataSeed>(
  NOTE_TARGET_DATA_SEEDS.filter((target) => target.noteId !== null).map(
    (target) => [target.noteId!, target],
  ),
);
