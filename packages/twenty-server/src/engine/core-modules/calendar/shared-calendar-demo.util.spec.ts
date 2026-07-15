import { endOfMonth, formatISO, startOfMonth } from 'date-fns';

import { CALENDAR_CHANNEL_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/calendar-channel-data-seeds.constant';

import {
  buildSharedCalendarDemoMonthRange,
  buildSharedCalendarDemoSeeds,
} from './shared-calendar-demo.util';

describe('sharedCalendarDemoUtil', () => {
  it('should generate events for each entity calendar across two months', () => {
    const now = new Date('2026-05-18T10:00:00.000Z');
    const seeds = buildSharedCalendarDemoSeeds(now);
    const monthRange = buildSharedCalendarDemoMonthRange(now);
    const startMonth = startOfMonth(new Date(monthRange.startMonthIso));
    const endMonth = endOfMonth(new Date(monthRange.endMonthIso));
    const today = new Date('2026-05-18T00:00:00.000Z');
    const tomorrow = new Date('2026-05-18T23:59:59.999Z');

    expect(seeds.length).toBeGreaterThanOrEqual(240);

    expect(new Set(seeds.map((seed) => seed.channelId))).toEqual(
      new Set([
        CALENDAR_CHANNEL_DATA_SEED_IDS.JONY,
        CALENDAR_CHANNEL_DATA_SEED_IDS.TIM,
        CALENDAR_CHANNEL_DATA_SEED_IDS.PHIL,
        CALENDAR_CHANNEL_DATA_SEED_IDS.JANE,
      ]),
    );

    for (const seed of seeds) {
      const startsAt = new Date(seed.startsAt);

      expect(startsAt >= startMonth).toBe(true);
      expect(startsAt <= endMonth).toBe(true);
    }

    expect(
      new Set(
        seeds.map((seed) => formatISO(startOfMonth(new Date(seed.startsAt)))),
      ),
    ).toEqual(
      new Set([
        formatISO(startOfMonth(startMonth)),
        formatISO(startOfMonth(endMonth)),
      ]),
    );

    expect(
      seeds.filter((seed) => {
        const startsAt = new Date(seed.startsAt);

        return startsAt >= today && startsAt <= tomorrow;
      }).length,
    ).toBeGreaterThanOrEqual(4);
  });
});
