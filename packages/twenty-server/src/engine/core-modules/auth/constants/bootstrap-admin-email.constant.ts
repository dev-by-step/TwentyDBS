export const BOOTSTRAP_ADMIN_EMAILS = [
  'aline@weknow.dev',
  'aline@devbystep.fr',
] as const;

export const isBootstrapAdminEmail = (email: string) =>
  BOOTSTRAP_ADMIN_EMAILS.includes(
    email.trim().toLowerCase() as (typeof BOOTSTRAP_ADMIN_EMAILS)[number],
  );
