import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { type DataResidency } from 'twenty-shared/ai';

export const DATA_RESIDENCY_CONFIG: Record<
  DataResidency,
  { label: string | MessageDescriptor; flag: string }
> = {
  us: { label: msg`United States`, flag: '🇺🇸' },
  eu: { label: msg`European Union`, flag: '🇪🇺' },
  global: { label: msg`Global`, flag: '🌐' },
  uk: { label: msg`United Kingdom`, flag: '🇬🇧' },
  ap: { label: msg`Asia Pacific`, flag: '🌏' },
  jp: { label: msg`Japan`, flag: '🇯🇵' },
  au: { label: msg`Australia`, flag: '🇦🇺' },
  ca: { label: msg`Canada`, flag: '🇨🇦' },
  de: { label: msg`Germany`, flag: '🇩🇪' },
  fr: { label: msg`France`, flag: '🇫🇷' },
};
