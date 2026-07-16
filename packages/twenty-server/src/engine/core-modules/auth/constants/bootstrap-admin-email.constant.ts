import { getEmailDomain } from 'src/engine/core-modules/auth/constants/bootstrap-admin-email-domains.constant';

export const BOOTSTRAP_ADMIN_EMAILS_ENV_VAR = 'BOOTSTRAP_ADMIN_EMAILS';

export const getBootstrapAdminEmails = (
  bootstrapAdminEmails = process.env[BOOTSTRAP_ADMIN_EMAILS_ENV_VAR],
) =>
  (bootstrapAdminEmails ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter((email) => email.length > 0);

export const getBootstrapAdminEmailDomains = (
  bootstrapAdminEmails = process.env[BOOTSTRAP_ADMIN_EMAILS_ENV_VAR],
) =>
  getBootstrapAdminEmails(bootstrapAdminEmails)
    .map(getEmailDomain)
    .filter((domain): domain is string => domain !== null);

export const isBootstrapAdminEmail = (
  email: string,
  bootstrapAdminEmails = process.env[BOOTSTRAP_ADMIN_EMAILS_ENV_VAR],
) =>
  getBootstrapAdminEmails(bootstrapAdminEmails).includes(
    email.trim().toLowerCase(),
  );

export const isBootstrapAdminEmailDomain = (
  email: string,
  bootstrapAdminEmails = process.env[BOOTSTRAP_ADMIN_EMAILS_ENV_VAR],
) => {
  const domain = getEmailDomain(email);

  return (
    domain !== null &&
    getBootstrapAdminEmailDomains(bootstrapAdminEmails).includes(domain)
  );
};
