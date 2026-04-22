// JSON Schema describing the input accepted by the exa_web_search tool.
// Kept as a plain JSON Schema (not Zod) because this is shipped through the
// application manifest and consumed by Twenty's tool provider at runtime.

export const DEFAULT_NUM_RESULTS = 10;
export const MAX_NUM_RESULTS = 30;

export const EXA_CATEGORIES = [
  'company',
  'research paper',
  'news',
  'pdf',
  'personal site',
  'financial report',
  'people',
] as const;

export type ExaCategory = (typeof EXA_CATEGORIES)[number];

export type ExaWebSearchInput = {
  query: string;
  category?: ExaCategory;
  numResults?: number;
};

export const exaWebSearchInputSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description:
        'The search query to look up on the web. Be specific and include relevant keywords for better results.',
    },
    category: {
      type: 'string',
      enum: EXA_CATEGORIES,
      description:
        'Optional content category to focus the search. Use "company" for business/organization info, "people" for person profiles, "news" for recent articles, "research paper" for academic content.',
    },
    numResults: {
      type: 'integer',
      minimum: 1,
      maximum: MAX_NUM_RESULTS,
      description: `Number of search results to return. Defaults to ${DEFAULT_NUM_RESULTS}, max ${MAX_NUM_RESULTS}. Use more results when you need comprehensive coverage.`,
    },
  },
  required: ['query'],
  additionalProperties: false,
} as const;
