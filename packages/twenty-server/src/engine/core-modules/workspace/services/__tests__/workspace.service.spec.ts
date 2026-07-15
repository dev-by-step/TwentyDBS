import { Test, type TestingModule } from '@nestjs/testing';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';

import { type Repository } from 'typeorm';

import { GlobalWorkspaceOrmManager } from 'src/engine/twenty-orm/global-workspace-datasource/global-workspace-orm.manager';
import { ApprovedAccessDomainEntity } from 'src/engine/core-modules/approved-access-domain/approved-access-domain.entity';
import { AuditService } from 'src/engine/core-modules/audit/services/audit.service';
import { BillingSubscriptionService } from 'src/engine/core-modules/billing/services/billing-subscription.service';
import { BillingService } from 'src/engine/core-modules/billing/services/billing.service';
import { DnsManagerService } from 'src/engine/core-modules/dns-manager/services/dns-manager.service';
import { CustomDomainManagerService } from 'src/engine/core-modules/domain/custom-domain-manager/services/custom-domain-manager.service';
import { SubdomainManagerService } from 'src/engine/core-modules/domain/subdomain-manager/services/subdomain-manager.service';
import { EmailService } from 'src/engine/core-modules/email/email.service';
import { ExceptionHandlerService } from 'src/engine/core-modules/exception-handler/exception-handler.service';
import { FeatureFlagService } from 'src/engine/core-modules/feature-flag/services/feature-flag.service';
import { FileCorePictureService } from 'src/engine/core-modules/file/file-core-picture/services/file-core-picture.service';
import { MessageQueue } from 'src/engine/core-modules/message-queue/message-queue.constants';
import { type MessageQueueService } from 'src/engine/core-modules/message-queue/services/message-queue.service';
import { getQueueToken } from 'src/engine/core-modules/message-queue/utils/get-queue-token.util';
import { OnboardingService } from 'src/engine/core-modules/onboarding/onboarding.service';
import { TwentyConfigService } from 'src/engine/core-modules/twenty-config/twenty-config.service';
import { UserWorkspaceEntity } from 'src/engine/core-modules/user-workspace/user-workspace.entity';
import { UserWorkspaceService } from 'src/engine/core-modules/user-workspace/user-workspace.service';
import { UserService } from 'src/engine/core-modules/user/services/user.service';
import { UserEntity } from 'src/engine/core-modules/user/user.entity';
import { WorkspaceInvitationService } from 'src/engine/core-modules/workspace-invitation/services/workspace-invitation.service';
import { WorkspaceService } from 'src/engine/core-modules/workspace/services/workspace.service';
import { WorkspaceEntity } from 'src/engine/core-modules/workspace/workspace.entity';
import { createEmptyAllFlatEntityMaps } from 'src/engine/metadata-modules/flat-entity/constant/create-empty-all-flat-entity-maps.constant';
import { WorkspaceManyOrAllFlatEntityMapsCacheService } from 'src/engine/metadata-modules/flat-entity/services/workspace-many-or-all-flat-entity-maps-cache.service';
import { UpgradeMigrationService } from 'src/engine/core-modules/upgrade/services/upgrade-migration.service';
import { UpgradeSequenceReaderService } from 'src/engine/core-modules/upgrade/services/upgrade-sequence-reader.service';
import { AiModelRegistryService } from 'src/engine/metadata-modules/ai/ai-models/services/ai-model-registry.service';
import { ObjectMetadataService } from 'src/engine/metadata-modules/object-metadata/object-metadata.service';
import { PermissionsService } from 'src/engine/metadata-modules/permissions/permissions.service';
import { CoreEntityCacheService } from 'src/engine/core-entity-cache/services/core-entity-cache.service';
import { WorkspaceCacheStorageService } from 'src/engine/workspace-cache-storage/workspace-cache-storage.service';
import { WorkspaceDataSourceService } from 'src/engine/workspace-datasource/workspace-datasource.service';
import { PrefillLogicFunctionService } from 'src/engine/workspace-manager/standard-objects-prefill-data/services/prefill-logic-function.service';
import { ApplicationService } from 'src/engine/core-modules/application/application.service';
import { WorkspaceMigrationValidateBuildAndRunService } from 'src/engine/workspace-manager/workspace-migration/services/workspace-migration-validate-build-and-run-service';
import { WorkspaceManagerService } from 'src/engine/workspace-manager/workspace-manager.service';
import { InitInternalEntitiesCommand } from 'src/modules/internal-entity/commands/init-internal-entities.command';
import * as prefillCompaniesModule from 'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-companies.util';
import * as prefillDashboardsModule from 'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-dashboards.util';
import * as prefillOpportunitiesModule from 'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-opportunities.util';
import * as prefillPeopleModule from 'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-people.util';
import * as prefillWorkflowCommandMenuItemsModule from 'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-workflow-command-menu-items.util';
import * as prefillWorkflowsModule from 'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-workflows.util';

jest.mock(
  'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-companies.util',
  () => ({ prefillCompanies: jest.fn() }),
);
jest.mock(
  'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-dashboards.util',
  () => ({ prefillDashboards: jest.fn() }),
);
jest.mock(
  'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-opportunities.util',
  () => ({ prefillOpportunities: jest.fn() }),
);
jest.mock(
  'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-people.util',
  () => ({ prefillPeople: jest.fn() }),
);
jest.mock(
  'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-workflow-command-menu-items.util',
  () => ({ prefillWorkflowCommandMenuItems: jest.fn() }),
);
jest.mock(
  'src/engine/workspace-manager/standard-objects-prefill-data/utils/prefill-workflows.util',
  () => ({ prefillWorkflows: jest.fn() }),
);

type WorkspaceServiceInternals = {
  prefillCreatedWorkspaceRecords: (args: {
    workspaceId: string;
    schemaName: string;
  }) => Promise<void>;
};

describe('WorkspaceService', () => {
  let service: WorkspaceService;
  let userWorkspaceRepository: Repository<UserWorkspaceEntity>;
  let userRepository: Repository<UserEntity>;
  let workspaceRepository: Repository<WorkspaceEntity>;
  let workspaceCacheStorageService: WorkspaceCacheStorageService;
  let messageQueueService: MessageQueueService;
  let dnsManagerService: DnsManagerService;
  let billingSubscriptionService: BillingSubscriptionService;
  let userWorkspaceService: UserWorkspaceService;
  let twentyConfigService: TwentyConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkspaceService,
        {
          provide: getRepositoryToken(WorkspaceEntity),
          useValue: {
            findOne: jest.fn(),
            softDelete: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ApprovedAccessDomainEntity),
          useValue: {
            findOneBy: jest.fn(),
          },
        },
        {
          provide: ObjectMetadataService,
          useValue: {
            deleteWorkspaceAllObjectMetadata: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UserWorkspaceEntity),
          useValue: {
            find: jest.fn(),
            softDelete: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(UserEntity),
          useValue: {
            softDelete: jest.fn(),
          },
        },
        {
          provide: BillingService,
          useValue: {
            isBillingEnabled: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: BillingSubscriptionService,
          useValue: {
            deleteSubscriptions: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            createContext: jest.fn(),
          },
        },
        ...[
          WorkspaceManagerService,
          UserWorkspaceService,
          UserService,
          DnsManagerService,
          CustomDomainManagerService,
          SubdomainManagerService,
          TwentyConfigService,
          EmailService,
          OnboardingService,
          WorkspaceInvitationService,
          PermissionsService,
          FeatureFlagService,
          ExceptionHandlerService,
          PermissionsService,
          FileCorePictureService,
          AiModelRegistryService,
          ApplicationService,
          PrefillLogicFunctionService,
          WorkspaceMigrationValidateBuildAndRunService,
          UpgradeMigrationService,
          UpgradeSequenceReaderService,
          GlobalWorkspaceOrmManager,
          InitInternalEntitiesCommand,
        ].map((service) => ({
          provide: service,
          useValue: {},
        })),
        {
          provide: TwentyConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(true),
          },
        },
        {
          provide: PrefillLogicFunctionService,
          useValue: {
            ensureSeeded: jest.fn(),
          },
        },
        {
          provide: WorkspaceCacheStorageService,
          useValue: {
            flush: jest.fn(),
          },
        },
        {
          provide: WorkspaceDataSourceService,
          useValue: {
            deleteWorkspaceDBSchema: jest.fn(),
          },
        },
        {
          provide: WorkspaceManyOrAllFlatEntityMapsCacheService,
          useValue: {
            flushFlatEntityMaps: jest.fn(),
            getOrRecomputeManyOrAllFlatEntityMaps: jest
              .fn()
              .mockResolvedValue(createEmptyAllFlatEntityMaps()),
          },
        },
        {
          provide: UserWorkspaceService,
          useValue: {
            deleteUserWorkspace: jest.fn(),
          },
        },
        {
          provide: getQueueToken(MessageQueue.deleteCascadeQueue),
          useValue: {
            add: jest.fn(),
          },
        },
        {
          provide: CoreEntityCacheService,
          useValue: {
            invalidate: jest.fn(),
          },
        },
        {
          provide: getDataSourceToken(),
          useValue: {
            createQueryRunner: jest.fn().mockReturnValue({
              connect: jest.fn(),
              startTransaction: jest.fn(),
              commitTransaction: jest.fn(),
              rollbackTransaction: jest.fn(),
              release: jest.fn(),
              manager: {
                delete: jest.fn().mockResolvedValue({ affected: 0 }),
              },
            }),
          },
        },
      ],
    }).compile();

    service = module.get<WorkspaceService>(WorkspaceService);
    userWorkspaceRepository = module.get<Repository<UserWorkspaceEntity>>(
      getRepositoryToken(UserWorkspaceEntity),
    );
    userRepository = module.get<Repository<UserEntity>>(
      getRepositoryToken(UserEntity),
    );
    workspaceRepository = module.get<Repository<WorkspaceEntity>>(
      getRepositoryToken(WorkspaceEntity),
    );
    workspaceCacheStorageService = module.get<WorkspaceCacheStorageService>(
      WorkspaceCacheStorageService,
    );
    messageQueueService = module.get<MessageQueueService>(
      getQueueToken(MessageQueue.deleteCascadeQueue),
    );
    dnsManagerService = module.get<DnsManagerService>(DnsManagerService);
    dnsManagerService.deleteHostnameSilently = jest.fn();
    billingSubscriptionService = module.get<BillingSubscriptionService>(
      BillingSubscriptionService,
    );
    userWorkspaceService =
      module.get<UserWorkspaceService>(UserWorkspaceService);
    twentyConfigService = module.get<TwentyConfigService>(TwentyConfigService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('prefillCreatedWorkspaceRecords', () => {
    const workspaceId = '202788b3-df6d-4d3f-ac38-229c99d68c2e';
    const schemaName = 'workspace_1wj3apezdvmsiot2ijffy6u5q';

    const mockPrefillFunctions = () => ({
      companies: jest
        .mocked(prefillCompaniesModule.prefillCompanies)
        .mockResolvedValue(undefined),
      dashboards: jest
        .mocked(prefillDashboardsModule.prefillDashboards)
        .mockResolvedValue(undefined),
      opportunities: jest
        .mocked(prefillOpportunitiesModule.prefillOpportunities)
        .mockResolvedValue(undefined),
      people: jest
        .mocked(prefillPeopleModule.prefillPeople)
        .mockResolvedValue(undefined),
      workflowCommandMenuItems: jest
        .mocked(
          prefillWorkflowCommandMenuItemsModule.prefillWorkflowCommandMenuItems,
        )
        .mockResolvedValue(undefined),
      workflows: jest
        .mocked(prefillWorkflowsModule.prefillWorkflows)
        .mockResolvedValue(undefined),
    });

    const prefillCreatedWorkspaceRecords = async () =>
      await (
        service as unknown as WorkspaceServiceInternals
      ).prefillCreatedWorkspaceRecords({
        workspaceId,
        schemaName,
      });

    it('should prefill demo CRM records when enabled', async () => {
      const prefillFunctions = mockPrefillFunctions();

      await prefillCreatedWorkspaceRecords();

      expect(prefillFunctions.companies).toHaveBeenCalled();
      expect(prefillFunctions.people).toHaveBeenCalled();
      expect(prefillFunctions.opportunities).toHaveBeenCalled();
      expect(prefillFunctions.workflows).toHaveBeenCalled();
      expect(prefillFunctions.dashboards).toHaveBeenCalled();
    });

    it('should skip demo CRM records when disabled', async () => {
      const prefillFunctions = mockPrefillFunctions();

      jest.mocked(twentyConfigService.get).mockReturnValue(false);

      await prefillCreatedWorkspaceRecords();

      expect(prefillFunctions.companies).not.toHaveBeenCalled();
      expect(prefillFunctions.people).not.toHaveBeenCalled();
      expect(prefillFunctions.opportunities).not.toHaveBeenCalled();
      expect(prefillFunctions.workflows).toHaveBeenCalled();
      expect(prefillFunctions.dashboards).toHaveBeenCalled();
    });
  });

  describe('handleRemoveWorkspaceMember', () => {
    it('should soft delete the user workspace record', async () => {
      jest.spyOn(userWorkspaceRepository, 'find').mockResolvedValue([
        {
          userId: 'user-id',
          workspaceId: 'workspace-id',
          id: 'user-workspace-id',
        } as UserWorkspaceEntity,
      ]);

      await service.handleRemoveWorkspaceMember(
        'workspace-id',
        'user-id',
        true,
      );

      expect(userWorkspaceService.deleteUserWorkspace).toHaveBeenCalledWith({
        userWorkspaceId: 'user-workspace-id',
        softDelete: true,
      });
      expect(userWorkspaceRepository.delete).not.toHaveBeenCalled();
      expect(userRepository.softDelete).toHaveBeenCalledWith('user-id');
    });
    it('should destroy the user workspace record', async () => {
      jest.spyOn(userWorkspaceRepository, 'find').mockResolvedValue([
        {
          id: 'user-workspace-id',
          userId: 'user-id',
          workspaceId: 'workspace-id',
        } as UserWorkspaceEntity,
      ]);

      await service.handleRemoveWorkspaceMember(
        'workspace-id',
        'user-id',
        false,
      );

      expect(userWorkspaceService.deleteUserWorkspace).toHaveBeenCalledWith({
        userWorkspaceId: 'user-workspace-id',
        softDelete: false,
      });
      expect(userRepository.softDelete).toHaveBeenCalledWith('user-id');
    });

    it('should not soft delete the user record if there are other user workspace records', async () => {
      jest.spyOn(userWorkspaceRepository, 'find').mockResolvedValue([
        {
          id: 'remaining-user-workspace-id',
          userId: 'user-id',
          workspaceId: 'other-workspace-id',
        } as UserWorkspaceEntity,
        {
          id: 'user-workspace-id',
          userId: 'user-id',
          workspaceId: 'workspace-id',
        } as UserWorkspaceEntity,
      ]);

      await service.handleRemoveWorkspaceMember(
        'workspace-id',
        'user-id',
        false,
      );

      expect(userWorkspaceService.deleteUserWorkspace).toHaveBeenCalledWith({
        userWorkspaceId: 'user-workspace-id',
        softDelete: false,
      });
      expect(userWorkspaceService.deleteUserWorkspace).not.toHaveBeenCalledWith(
        {
          userWorkspaceId: 'remaining-user-workspace-id',
          softDelete: false,
        },
      );
      expect(userRepository.softDelete).not.toHaveBeenCalled();
    });
  });

  describe('deleteWorkspace', () => {
    it('should delete the workspace', async () => {
      const mockWorkspace = {
        id: 'workspace-id',
        metadataVersion: 0,
      } as WorkspaceEntity;

      jest
        .spyOn(workspaceRepository, 'findOne')
        .mockResolvedValue(mockWorkspace);
      jest.spyOn(userWorkspaceRepository, 'find').mockResolvedValue([]);

      await service.deleteWorkspace(mockWorkspace.id, false);

      expect(workspaceRepository.softDelete).not.toHaveBeenCalled();
      expect(workspaceCacheStorageService.flush).toHaveBeenCalledWith(
        mockWorkspace.id,
        mockWorkspace.metadataVersion,
      );
      expect(messageQueueService.add).toHaveBeenCalled();
    });

    it('should soft delete the workspace', async () => {
      const mockWorkspace = {
        id: 'workspace-id',
        metadataVersion: 0,
      } as WorkspaceEntity;

      jest
        .spyOn(workspaceRepository, 'findOne')
        .mockResolvedValue(mockWorkspace);
      jest.spyOn(userWorkspaceRepository, 'find').mockResolvedValue([]);

      await service.deleteWorkspace(mockWorkspace.id, true);

      expect(billingSubscriptionService.deleteSubscriptions).toHaveBeenCalled();

      expect(workspaceRepository.softDelete).toHaveBeenCalledWith({
        id: mockWorkspace.id,
      });
      expect(workspaceRepository.delete).not.toHaveBeenCalled();
    });

    it('should delete the custom domain when hard deleting a workspace with a custom domain', async () => {
      const customDomain = 'custom.example.com';
      const mockWorkspace = {
        id: 'workspace-id',
        metadataVersion: 0,
        customDomain,
      } as WorkspaceEntity;

      jest
        .spyOn(workspaceRepository, 'findOne')
        .mockResolvedValue(mockWorkspace);
      jest.spyOn(userWorkspaceRepository, 'find').mockResolvedValue([]);

      await service.deleteWorkspace(mockWorkspace.id, false);

      expect(dnsManagerService.deleteHostnameSilently).toHaveBeenCalledWith(
        customDomain,
      );
    });

    it('should not delete the custom domain when soft deleting a workspace with a custom domain', async () => {
      const customDomain = 'custom.example.com';
      const mockWorkspace = {
        id: 'workspace-id',
        metadataVersion: 0,
        customDomain,
      } as WorkspaceEntity;

      jest
        .spyOn(workspaceRepository, 'findOne')
        .mockResolvedValue(mockWorkspace);
      jest.spyOn(userWorkspaceRepository, 'find').mockResolvedValue([]);

      await service.deleteWorkspace(mockWorkspace.id, true);

      expect(dnsManagerService.deleteHostnameSilently).not.toHaveBeenCalled();
      expect(workspaceRepository.softDelete).toHaveBeenCalledWith({
        id: mockWorkspace.id,
      });
    });
  });
});
