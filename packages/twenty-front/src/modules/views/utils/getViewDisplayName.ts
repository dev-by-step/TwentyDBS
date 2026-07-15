const DEFAULT_VIEW_NAME_PREFIX = 'All ';

export const getViewDisplayName = (viewName: string): string => {
  if (!viewName.startsWith(DEFAULT_VIEW_NAME_PREFIX)) {
    return viewName;
  }

  return `Toutes les ${viewName.slice(DEFAULT_VIEW_NAME_PREFIX.length)}`;
};
