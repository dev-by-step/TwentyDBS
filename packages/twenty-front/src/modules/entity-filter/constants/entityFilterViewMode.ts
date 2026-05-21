export const ENTITY_FILTER_VIEW_MODE = {
  MY_COMPANY: 'my-company',
  GROUP: 'group',
} as const;

export type EntityFilterViewMode =
  (typeof ENTITY_FILTER_VIEW_MODE)[keyof typeof ENTITY_FILTER_VIEW_MODE];
