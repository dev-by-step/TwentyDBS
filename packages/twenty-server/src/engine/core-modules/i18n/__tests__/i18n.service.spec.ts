import { Test } from '@nestjs/testing';

import { I18nService } from 'src/engine/core-modules/i18n/i18n.service';

describe('I18nService.getI18nInstance', () => {
  let service: I18nService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [I18nService],
    }).compile();

    service = moduleRef.get(I18nService);
    await service.loadTranslations();
  });

  it('returns a usable i18n instance for a canonical locale', () => {
    const i18n = service.getI18nInstance('fr-FR');

    expect(i18n).toBeDefined();
    expect(typeof i18n._).toBe('function');
  });

  it('normalises legacy language-only codes (e.g. "fr" → "fr-FR")', () => {
    const i18n = service.getI18nInstance('fr' as any);

    expect(i18n).toBeDefined();
    expect(typeof i18n._).toBe('function');
  });

  it('falls back to the source locale for unknown values instead of returning undefined', () => {
    const i18n = service.getI18nInstance('zz' as any);

    expect(i18n).toBeDefined();
    expect(typeof i18n._).toBe('function');
  });

  it('handles null / undefined gracefully', () => {
    expect(typeof service.getI18nInstance(null)._).toBe('function');
    expect(typeof service.getI18nInstance(undefined)._).toBe('function');
  });
});
