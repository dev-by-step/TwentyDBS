import { type ParsedDomain, type parse } from 'psl';

export const isParsedDomain = (
  result: ReturnType<typeof parse>,
): result is ParsedDomain =>
  !('error' in result) && Object.prototype.hasOwnProperty.call(result, 'sld');
