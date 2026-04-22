import { defineApplication } from 'twenty-sdk/define';

export const APPLICATION_UNIVERSAL_IDENTIFIER =
  '2b7f4a2e-9c4b-4a11-b63c-2e5e7d3f5a9a';

export default defineApplication({
  universalIdentifier: APPLICATION_UNIVERSAL_IDENTIFIER,
  displayName: 'Exa',
  description:
    'Structured web search powered by Exa. Surfaces entity-aware results (companies, people, research, news) to Twenty AI agents.',
  icon: 'IconSearch',
  serverVariables: {
    EXA_API_KEY: {
      description:
        'Exa API key. Server admins can set this via the EXA_API_KEY env var, which is auto-seeded into this application registration at server bootstrap.',
      isSecret: true,
      isRequired: true,
    },
  },
});
