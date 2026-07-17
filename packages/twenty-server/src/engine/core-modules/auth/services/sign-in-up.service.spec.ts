import { AuthExceptionCode } from 'src/engine/core-modules/auth/auth.exception';
import { type SignInUpNewUserPayload } from 'src/engine/core-modules/auth/types/signInUp.type';
import { AuthProviderEnum } from 'src/engine/core-modules/workspace/types/workspace.type';

import { SignInUpService } from './sign-in-up.service';

const BOOTSTRAP_ADMIN_EMAILS_FOR_TESTS = 'aline@weknow.dev,aline@devbystep.fr';
const originalBootstrapAdminEmails = process.env.BOOTSTRAP_ADMIN_EMAILS;

const mockPartialUserPayload: SignInUpNewUserPayload = {
  email: 'first.user@weknow.dev',
  firstName: 'First',
  lastName: 'User',
  locale: 'en',
  isEmailAlreadyVerified: true,
};

const mockDisallowedDomainPayload: SignInUpNewUserPayload = {
  email: 'someone@external-vendor.com',
  firstName: 'Someone',
  lastName: 'External',
  locale: 'en',
  isEmailAlreadyVerified: true,
};

type MockConfigurationValues = {
  IS_MULTIWORKSPACE_ENABLED: boolean;
  IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS: boolean;
  SERVER_URL: string;
};

const createSignInUpServiceForTests = () => {
  const mockUserRepository = {
    create: jest.fn((user) => user),
    save: jest.fn(async (user) => ({ id: 'saved-user-id', ...user })),
    count: jest.fn(),
    findOne: jest.fn().mockResolvedValue(null),
  };

  const mockWorkspaceRepository = {
    count: jest.fn(),
    create: jest.fn((workspace) => workspace),
    findOne: jest.fn().mockResolvedValue(null),
  };

  const mockConfigurationValues: MockConfigurationValues = {
    IS_MULTIWORKSPACE_ENABLED: true,
    IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS: false,
    SERVER_URL: 'http://localhost:3000',
  };

  const mockWorkspaceService = {
    activateWorkspace: jest.fn(),
  };

  const mockThrottlerService = {
    tokenBucketThrottleOrThrow: jest.fn().mockResolvedValue(undefined),
  };

  const mockTwentyConfigService = {
    get: jest.fn(
      (configKey: keyof MockConfigurationValues) =>
        mockConfigurationValues[configKey],
    ),
  };

  const queryRunnerMock = {
    manager: {
      save: jest.fn(async (_entity, value) => ({
        id: value.id ?? 'saved-id',
        ...value,
      })),
      update: jest.fn(),
    },
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
  };

  const service = new SignInUpService(
    mockUserRepository as any,
    mockWorkspaceRepository as any,
    {
      validatePersonalInvitation: jest.fn(),
      invalidateWorkspaceInvitation: jest.fn(),
      findInvitationsByEmail: jest.fn().mockResolvedValue([]),
    } as any,
    {
      create: jest.fn(async () => ({ id: 'user-workspace-id' })),
      checkUserWorkspaceExists: jest.fn(),
    } as any,
    {
      setOnboardingConnectAccountPending: jest.fn(),
      setOnboardingCreateProfilePending: jest.fn(),
      setOnboardingInviteTeamPending: jest.fn(),
      setOnboardingSuperadminWorkspaceSetupPending: jest.fn(),
      createOnboardingStatusForWorkspaceMember: jest.fn(),
    } as any,
    {
      emitCustomBatchEvent: jest.fn(),
    } as any,
    mockTwentyConfigService as any,
    {
      findUserByEmail: jest.fn(),
      findByEmail: jest.fn(),
      markEmailAsVerified: jest.fn(),
    } as any,
    {
      incrementCounter: jest.fn(),
    } as any,
    {
      invalidateAndRecompute: jest.fn(),
    } as any,
    {
      createWorkspaceCustomApplication: jest
        .fn()
        .mockResolvedValue({ universalIdentifier: 'custom-app-id' }),
    } as any,
    {
      uploadWorkspaceLogoFromUrl: jest.fn(),
    } as any,
    {
      isValid: jest.fn().mockReturnValue(false),
    } as any,
    mockWorkspaceService as any,
    mockThrottlerService as any,
    {
      createQueryRunner: jest.fn(() => queryRunnerMock),
    } as any,
  );

  return {
    service,
    mockUserRepository,
    mockWorkspaceRepository,
    mockConfigurationValues,
    mockWorkspaceService,
    mockThrottlerService,
  };
};

beforeEach(() => {
  process.env.BOOTSTRAP_ADMIN_EMAILS = BOOTSTRAP_ADMIN_EMAILS_FOR_TESTS;
});

afterEach(() => {
  if (originalBootstrapAdminEmails === undefined) {
    delete process.env.BOOTSTRAP_ADMIN_EMAILS;

    return;
  }

  process.env.BOOTSTRAP_ADMIN_EMAILS = originalBootstrapAdminEmails;
});

describe('SignInUpService workspace-creation policy', () => {
  it('grants bootstrap owner server permissions to the designated admin email', async () => {
    const {
      service,
      mockUserRepository,
      mockWorkspaceRepository,
      mockConfigurationValues,
    } = createSignInUpServiceForTests();

    mockConfigurationValues.IS_MULTIWORKSPACE_ENABLED = true;
    mockConfigurationValues.IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS =
      false;
    mockWorkspaceRepository.count.mockResolvedValue(0);
    mockUserRepository.count.mockResolvedValue(0);
    jest
      .spyOn((service as any).userService, 'findUserByEmail')
      .mockResolvedValue(null);

    await service.signUpWithoutWorkspace(
      {
        ...mockPartialUserPayload,
        email: 'aline@devbystep.fr',
      },
      {
        provider: AuthProviderEnum.Google,
      } as any,
    );

    expect(mockUserRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        canImpersonate: true,
        canAccessFullAdminPanel: true,
      }),
    );
  });

  it('assigns default non-admin permissions to a same-domain teammate signing up after the super admin', async () => {
    const {
      service,
      mockUserRepository,
      mockWorkspaceRepository,
      mockConfigurationValues,
    } = createSignInUpServiceForTests();

    mockConfigurationValues.IS_MULTIWORKSPACE_ENABLED = true;
    mockConfigurationValues.IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS =
      false;
    mockWorkspaceRepository.count.mockResolvedValue(1);
    mockUserRepository.count.mockResolvedValue(1);
    mockUserRepository.findOne.mockResolvedValue({
      id: 'aline-id',
      email: 'aline@weknow.dev',
      canAccessFullAdminPanel: true,
    });
    jest
      .spyOn((service as any).userService, 'findUserByEmail')
      .mockResolvedValue(null);

    await service.signUpWithoutWorkspace(mockPartialUserPayload, {
      provider: AuthProviderEnum.Google,
    } as any);

    expect(mockUserRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        canImpersonate: false,
        canAccessFullAdminPanel: false,
      }),
    );
  });

  it('throws forbidden when a non-admin existing user creates workspace in restricted mode after bootstrap', async () => {
    const { service, mockWorkspaceRepository, mockConfigurationValues } =
      createSignInUpServiceForTests();

    mockConfigurationValues.IS_MULTIWORKSPACE_ENABLED = true;
    mockConfigurationValues.IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS =
      true;
    mockWorkspaceRepository.count.mockResolvedValue(1);

    const nonAdminExistingUser = {
      id: 'existing-user-id',
      email: 'existing.user@acme.dev',
      canAccessFullAdminPanel: false,
    };

    await expect(
      service.signUpOnNewWorkspace({
        type: 'existingUser',
        existingUser: nonAdminExistingUser as any,
      }),
    ).rejects.toMatchObject({
      code: AuthExceptionCode.FORBIDDEN_EXCEPTION,
    });
  });

  it('marks superadmin workspace setup as pending for the bootstrap admin workspace', async () => {
    const {
      service,
      mockUserRepository,
      mockWorkspaceRepository,
      mockConfigurationValues,
    } = createSignInUpServiceForTests();

    mockConfigurationValues.IS_MULTIWORKSPACE_ENABLED = true;
    mockConfigurationValues.IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS =
      false;
    mockWorkspaceRepository.count.mockResolvedValue(0);
    mockUserRepository.count.mockResolvedValue(0);

    await service.signUpOnNewWorkspace({
      type: 'newUserWithPicture',
      newUserWithPicture: {
        ...mockPartialUserPayload,
        email: 'aline@devbystep.fr',
      },
    } as any);

    expect(
      (service as any).onboardingService
        .setOnboardingSuperadminWorkspaceSetupPending,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        value: true,
      }),
      expect.anything(),
    );
  });

  it('throws SIGNUP_DISABLED when creating workspace in single-workspace mode after bootstrap', async () => {
    const { service, mockWorkspaceRepository, mockConfigurationValues } =
      createSignInUpServiceForTests();

    mockConfigurationValues.IS_MULTIWORKSPACE_ENABLED = false;
    mockConfigurationValues.IS_WORKSPACE_CREATION_LIMITED_TO_SERVER_ADMINS =
      false;
    mockWorkspaceRepository.count.mockResolvedValue(1);

    await expect(
      service.signUpOnNewWorkspace({
        type: 'existingUser',
        existingUser: {
          id: 'existing-user-id',
          email: 'existing.user@acme.dev',
          canAccessFullAdminPanel: true,
        } as any,
      }),
    ).rejects.toMatchObject({
      code: AuthExceptionCode.SIGNUP_DISABLED,
    });
  });

  it('throws SIGNUP_DISABLED when auto-signing up without workspace in single-workspace mode after bootstrap', async () => {
    const { service, mockWorkspaceRepository, mockConfigurationValues } =
      createSignInUpServiceForTests();

    mockConfigurationValues.IS_MULTIWORKSPACE_ENABLED = false;
    mockWorkspaceRepository.count.mockResolvedValue(1);
    jest
      .spyOn((service as any).userService, 'findUserByEmail')
      .mockResolvedValue(null);

    await expect(
      service.signUpWithoutWorkspace(mockPartialUserPayload, {
        provider: AuthProviderEnum.Password,
        password: 'Hunter2!safe',
      } as any),
    ).rejects.toMatchObject({
      code: AuthExceptionCode.SIGNUP_DISABLED,
    });
  });

  it('throws when the new workspace auto-activation fails', async () => {
    const {
      service,
      mockWorkspaceRepository,
      mockUserRepository,
      mockWorkspaceService,
    } = createSignInUpServiceForTests();

    const activationError = new Error('activation failed');

    mockWorkspaceRepository.count.mockResolvedValue(0);
    mockUserRepository.count.mockResolvedValue(0);
    mockWorkspaceService.activateWorkspace.mockRejectedValueOnce(
      activationError,
    );
    jest
      .spyOn((service as any).userService, 'findUserByEmail')
      .mockResolvedValue(null);

    await expect(
      service.signUpWithoutWorkspace(
        {
          ...mockPartialUserPayload,
          email: 'aline@devbystep.fr',
        },
        {
          provider: AuthProviderEnum.Password,
          password: 'Hunter2!safe',
        } as any,
      ),
    ).rejects.toThrow(activationError);

    expect(mockWorkspaceService.activateWorkspace).toHaveBeenCalled();
  });
});

describe('SignInUpService email-domain restriction', () => {
  it('rejects sign-up from an email domain outside the authorized list', async () => {
    const { service } = createSignInUpServiceForTests();

    jest
      .spyOn((service as any).userService, 'findUserByEmail')
      .mockResolvedValue(null);

    await expect(
      service.signUpWithoutWorkspace(mockDisallowedDomainPayload, {
        provider: AuthProviderEnum.Password,
        password: 'Hunter2!safe',
      } as any),
    ).rejects.toMatchObject({
      code: AuthExceptionCode.FORBIDDEN_EXCEPTION,
    });
  });

  // IMP-12 : au-delà de la limite de tentatives, le refus est indistinguable
  // d'un refus de domaine (même code, message uniforme) et court-circuite
  // avant toute lecture de la base.
  it('throttles repeated sign-up attempts for the same email', async () => {
    const { service, mockThrottlerService, mockUserRepository } =
      createSignInUpServiceForTests();

    mockThrottlerService.tokenBucketThrottleOrThrow.mockRejectedValueOnce(
      new Error('Limit reached'),
    );
    jest
      .spyOn((service as any).userService, 'findUserByEmail')
      .mockResolvedValue(null);

    await expect(
      service.signUpWithoutWorkspace(mockDisallowedDomainPayload, {
        provider: AuthProviderEnum.Password,
        password: 'Hunter2!safe',
      } as any),
    ).rejects.toMatchObject({
      code: AuthExceptionCode.FORBIDDEN_EXCEPTION,
    });

    expect(
      mockThrottlerService.tokenBucketThrottleOrThrow,
    ).toHaveBeenCalledWith(
      expect.stringContaining('sign-up-attempt:'),
      1,
      expect.any(Number),
      expect.any(Number),
    );
    // La limite court-circuite avant la lecture du super admin.
    expect(mockUserRepository.findOne).not.toHaveBeenCalled();
  });

  it('allows sign-up from the same domain as the existing super admin', async () => {
    const { service, mockUserRepository, mockWorkspaceRepository } =
      createSignInUpServiceForTests();

    mockWorkspaceRepository.count.mockResolvedValue(1);
    mockUserRepository.count.mockResolvedValue(1);
    mockUserRepository.findOne.mockResolvedValue({
      id: 'aline-id',
      email: 'aline@weknow.dev',
      canAccessFullAdminPanel: true,
    });
    jest
      .spyOn((service as any).userService, 'findUserByEmail')
      .mockResolvedValue(null);

    await expect(
      service.signUpWithoutWorkspace(
        {
          ...mockPartialUserPayload,
          email: 'newcomer@weknow.dev',
        },
        {
          provider: AuthProviderEnum.Password,
          password: 'Hunter2!safe',
        } as any,
      ),
    ).resolves.toBeDefined();

    expect(mockUserRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'newcomer@weknow.dev',
      }),
    );
  });

  it('allows sign-up from another authorized bootstrap domain after the first super admin exists', async () => {
    const { service, mockUserRepository, mockWorkspaceRepository } =
      createSignInUpServiceForTests();

    mockWorkspaceRepository.count.mockResolvedValue(1);
    mockUserRepository.count.mockResolvedValue(1);
    mockUserRepository.findOne.mockResolvedValue({
      id: 'aline-id',
      email: 'aline@weknow.dev',
      canAccessFullAdminPanel: true,
    });
    jest
      .spyOn((service as any).userService, 'findUserByEmail')
      .mockResolvedValue(null);

    await expect(
      service.signUpWithoutWorkspace(
        {
          ...mockPartialUserPayload,
          email: 'someone@devbystep.fr',
        },
        {
          provider: AuthProviderEnum.Password,
          password: 'Hunter2!safe',
        } as any,
      ),
    ).resolves.toBeDefined();

    expect(mockUserRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'someone@devbystep.fr',
      }),
    );
  });

  it('rejects first sign-up when email is not a designated bootstrap admin', async () => {
    const { service } = createSignInUpServiceForTests();

    jest
      .spyOn((service as any).userService, 'findUserByEmail')
      .mockResolvedValue(null);

    await expect(
      service.signUpWithoutWorkspace(
        {
          ...mockPartialUserPayload,
          email: 'random@some-external.dev',
        },
        {
          provider: AuthProviderEnum.Password,
          password: 'Hunter2!safe',
        } as any,
      ),
    ).rejects.toMatchObject({
      code: AuthExceptionCode.FORBIDDEN_EXCEPTION,
    });
  });

  it('accepts a cross-domain sign-up when the email has a pending invitation', async () => {
    const { service, mockUserRepository, mockWorkspaceRepository } =
      createSignInUpServiceForTests();

    mockWorkspaceRepository.count.mockResolvedValue(1);
    mockUserRepository.count.mockResolvedValue(1);
    mockUserRepository.findOne.mockResolvedValue({
      id: 'aline-id',
      email: 'aline@devbystep.fr',
      canAccessFullAdminPanel: true,
    });
    jest
      .spyOn((service as any).userService, 'findUserByEmail')
      .mockResolvedValue(null);
    (
      service as any
    ).workspaceInvitationService.findInvitationsByEmail.mockResolvedValueOnce([
      { id: 'invite-token', context: { email: 'pierre@external.com' } },
    ]);

    await expect(
      service.signUpWithoutWorkspace(
        {
          ...mockPartialUserPayload,
          email: 'pierre@external.com',
        },
        {
          provider: AuthProviderEnum.Password,
          password: 'Hunter2!safe',
        } as any,
      ),
    ).resolves.toBeDefined();

    expect(
      (service as any).workspaceInvitationService.findInvitationsByEmail,
    ).toHaveBeenCalledWith('pierre@external.com');
  });
});
