export const getEmailDomain = (email: string): string | null => {
  const domain = email.trim().toLowerCase().split('@')[1];

  return domain && domain.length > 0 ? domain : null;
};
