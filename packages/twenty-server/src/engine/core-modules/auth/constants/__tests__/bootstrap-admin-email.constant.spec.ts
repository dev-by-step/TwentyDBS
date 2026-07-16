import {
  getBootstrapAdminEmailDomains,
  getBootstrapAdminEmails,
  isBootstrapAdminEmail,
  isBootstrapAdminEmailDomain,
} from 'src/engine/core-modules/auth/constants/bootstrap-admin-email.constant';

describe('bootstrap admin email constants', () => {
  it('parses bootstrap admin emails from a comma-separated env value', () => {
    const bootstrapAdminEmails = ' Aline@WEKNOW.dev, aline@devbystep.fr ,, ';

    expect(getBootstrapAdminEmails(bootstrapAdminEmails)).toEqual([
      'aline@weknow.dev',
      'aline@devbystep.fr',
    ]);
    expect(getBootstrapAdminEmailDomains(bootstrapAdminEmails)).toEqual([
      'weknow.dev',
      'devbystep.fr',
    ]);
    expect(
      isBootstrapAdminEmail('ALINE@WEKNOW.DEV', bootstrapAdminEmails),
    ).toBe(true);
    expect(
      isBootstrapAdminEmailDomain(
        'teammate@devbystep.fr',
        bootstrapAdminEmails,
      ),
    ).toBe(true);
  });

  it('does not authorize bootstrap emails when the env value is empty', () => {
    expect(isBootstrapAdminEmail('aline@weknow.dev', '')).toBe(false);
    expect(isBootstrapAdminEmailDomain('teammate@weknow.dev', '')).toBe(false);
  });
});
