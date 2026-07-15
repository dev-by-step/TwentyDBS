export const getInternalEntityDisplayLabel = (label: string): string => {
  if (label === 'Internal Entities') {
    return 'Entités internes';
  }

  if (label === 'Internal Entity') {
    return 'Entité interne';
  }

  return label;
};
