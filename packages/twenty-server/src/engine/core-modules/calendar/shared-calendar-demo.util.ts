import {
  addDays,
  addMonths,
  endOfMonth,
  isAfter,
  isBefore,
  startOfMonth,
} from 'date-fns';
import { utcToZonedTime, zonedTimeToUtc } from 'date-fns-tz';

import {
  getPrimaryDevWorkspaceUserDisplayName,
  PRIMARY_DEV_WORKSPACE_USERS,
} from 'src/engine/workspace-manager/dev-seeder/core/constants/primary-dev-workspace-data.constant';
import { CALENDAR_CHANNEL_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/calendar-channel-data-seeds.constant';
import { WORKSPACE_MEMBER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';

export const SHARED_CALENDAR_DEMO_TIME_ZONE = 'Europe/Paris';

type DemoEventTemplate = {
  title: string;
  description: string;
  location: string;
  startHour: number;
  startMinute: number;
  durationInMinutes: number;
};

type DemoOwnerConfig = {
  key: keyof typeof PRIMARY_DEV_WORKSPACE_USERS;
  channelId: string;
  workspaceMemberId: string;
  eventTemplates: DemoEventTemplate[];
};

export type DemoCalendarSeed = {
  id: string;
  title: string;
  description: string;
  location: string;
  startsAt: string;
  endsAt: string;
  channelId: string;
  associationId: string;
  participantId: string;
  workspaceMemberId: string;
  handle: string;
  displayName: string;
};

const SHARED_CALENDAR_DEMO_OWNERS: DemoOwnerConfig[] = [
  {
    key: 'JONY',
    channelId: CALENDAR_CHANNEL_DATA_SEED_IDS.JONY,
    workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.JONY,
    eventTemplates: [
      {
        title: 'Point pilotage WEKNOW',
        description: 'Revue d avancement commerciale et delivery WEKNOW.',
        location: 'Salle Horizon',
        startHour: 9,
        startMinute: 30,
        durationInMinutes: 45,
      },
      {
        title: 'Comite produit WEKNOW',
        description: 'Arbitrages produit et coordination transverse WEKNOW.',
        location: 'Google Meet',
        startHour: 14,
        startMinute: 0,
        durationInMinutes: 60,
      },
    ],
  },
  {
    key: 'TIM',
    channelId: CALENDAR_CHANNEL_DATA_SEED_IDS.TIM,
    workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.TIM,
    eventTemplates: [
      {
        title: 'Standup delivery DEVBYSTEP',
        description: 'Synchronisation delivery et suivi des dependances.',
        location: 'War Room',
        startHour: 10,
        startMinute: 30,
        durationInMinutes: 30,
      },
      {
        title: 'Revue technique DEVBYSTEP',
        description: 'Point architecture et arbitrages techniques.',
        location: 'Teams',
        startHour: 11,
        startMinute: 0,
        durationInMinutes: 60,
      },
    ],
  },
  {
    key: 'PHIL',
    channelId: CALENDAR_CHANNEL_DATA_SEED_IDS.PHIL,
    workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.PHIL,
    eventTemplates: [
      {
        title: 'Point operationnel ALLSENSIA',
        description: 'Suivi des chantiers et des actions clients ALLSENSIA.',
        location: 'Salle Nova',
        startHour: 9,
        startMinute: 0,
        durationInMinutes: 45,
      },
      {
        title: 'Revue portefeuille ALLSENSIA',
        description: 'Analyse portefeuille et priorisation des opportunites.',
        location: 'Zoom',
        startHour: 15,
        startMinute: 0,
        durationInMinutes: 60,
      },
    ],
  },
  {
    key: 'JANE',
    channelId: CALENDAR_CHANNEL_DATA_SEED_IDS.JANE,
    workspaceMemberId: WORKSPACE_MEMBER_DATA_SEED_IDS.JANE,
    eventTemplates: [
      {
        title: 'Coordination ANGLE Intelligence',
        description: 'Alignement hebdomadaire sur les sujets data et IA.',
        location: 'Lab 2',
        startHour: 14,
        startMinute: 30,
        durationInMinutes: 45,
      },
      {
        title: 'Atelier client ANGLE Intelligence',
        description: 'Preparation atelier client et prochaines decisions.',
        location: 'Meet',
        startHour: 10,
        startMinute: 0,
        durationInMinutes: 90,
      },
    ],
  },
];

export const buildSharedCalendarDemoMonthRange = (now = new Date()) => {
  const nowInParis = utcToZonedTime(now, SHARED_CALENDAR_DEMO_TIME_ZONE);

  return {
    startMonthIso: zonedTimeToUtc(
      startOfMonth(nowInParis),
      SHARED_CALENDAR_DEMO_TIME_ZONE,
    ).toISOString(),
    endMonthIso: zonedTimeToUtc(
      endOfMonth(addMonths(nowInParis, 1)),
      SHARED_CALENDAR_DEMO_TIME_ZONE,
    ).toISOString(),
  };
};

export const buildSharedCalendarDemoSeeds = (
  now = new Date(),
): DemoCalendarSeed[] => {
  const { startMonthIso, endMonthIso } = buildSharedCalendarDemoMonthRange(now);
  const rangeStart = new Date(startMonthIso);
  const rangeEnd = new Date(endMonthIso);
  const seeds: DemoCalendarSeed[] = [];
  let index = 0;

  for (
    let dayIndex = 0, dayInRange = rangeStart;
    dayInRange <= rangeEnd;
    dayIndex += 1, dayInRange = addDays(rangeStart, dayIndex)
  ) {
    for (const owner of SHARED_CALENDAR_DEMO_OWNERS) {
      const template =
        owner.eventTemplates[dayIndex % owner.eventTemplates.length];
      const startsAt = buildUtcIsoFromParisDaySlot(
        dayInRange,
        template.startHour,
        template.startMinute,
      );
      const endsAt = buildUtcIsoFromParisDuration(
        dayInRange,
        template.startHour,
        template.startMinute,
        template.durationInMinutes,
      );
      const startsAtDate = new Date(startsAt);

      if (
        isBefore(startsAtDate, rangeStart) ||
        isAfter(startsAtDate, rangeEnd)
      ) {
        continue;
      }

      index += 1;

      seeds.push({
        id: buildDemoUuid('77777777', index),
        associationId: buildDemoUuid('88888888', index),
        participantId: buildDemoUuid('99999999', index),
        title: template.title,
        description: template.description,
        location: template.location,
        startsAt,
        endsAt,
        channelId: owner.channelId,
        workspaceMemberId: owner.workspaceMemberId,
        handle: PRIMARY_DEV_WORKSPACE_USERS[owner.key].email,
        displayName: getPrimaryDevWorkspaceUserDisplayName(owner.key),
      });
    }
  }

  return seeds;
};

const buildUtcIsoFromParisDaySlot = (
  dayInRange: Date,
  hour: number,
  minute: number,
): string => {
  const localParisDate = new Date(
    dayInRange.getFullYear(),
    dayInRange.getMonth(),
    dayInRange.getDate(),
    hour,
    minute,
    0,
    0,
  );

  return zonedTimeToUtc(
    localParisDate,
    SHARED_CALENDAR_DEMO_TIME_ZONE,
  ).toISOString();
};

const buildUtcIsoFromParisDuration = (
  dayInRange: Date,
  hour: number,
  minute: number,
  durationInMinutes: number,
): string => {
  const startsAt = new Date(
    buildUtcIsoFromParisDaySlot(dayInRange, hour, minute),
  );

  return new Date(
    startsAt.getTime() + durationInMinutes * 60 * 1000,
  ).toISOString();
};

const buildDemoUuid = (prefix: string, index: number) => {
  const hexIndex = index.toString(16).padStart(4, '0');
  const tail = index.toString(16).padStart(12, '0');

  return `${prefix}-${hexIndex}-4${hexIndex.slice(1)}-8${hexIndex.slice(
    1,
  )}-${tail}`;
};
