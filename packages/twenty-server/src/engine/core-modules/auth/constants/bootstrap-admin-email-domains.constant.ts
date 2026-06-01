import { BOOTSTRAP_ADMIN_EMAILS } from 'src/engine/core-modules/auth/constants/bootstrap-admin-email.constant';

export const BOOTSTRAP_ALLOWED_EMAIL_DOMAINS: readonly string[] = Array.from(
  new Set(
    BOOTSTRAP_ADMIN_EMAILS.map((email) => {
      const domain = email.split('@')[1];

      return domain ? domain.toLowerCase() : '';
    }).filter((domain) => domain.length > 0),
  ),
);

export const getEmailDomain = (email: string): string | null => {
  const domain = email.trim().toLowerCase().split('@')[1];

  return domain && domain.length > 0 ? domain : null;
};

export const isBootstrapAllowedDomain = (email: string): boolean => {
  const domain = getEmailDomain(email);

  if (!domain) {
    return false;
  }

  return BOOTSTRAP_ALLOWED_EMAIL_DOMAINS.includes(domain);
};
