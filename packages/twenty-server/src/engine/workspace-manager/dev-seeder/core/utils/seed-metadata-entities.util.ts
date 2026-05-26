import { type QueryRunner } from 'typeorm';

import {
  CalendarChannelVisibility,
  MessageChannelSyncStage,
  MessageChannelType,
  MessageChannelVisibility,
  MessageFolderPendingSyncAction,
} from 'twenty-shared/types';

import {
  PRIMARY_DEV_WORKSPACE_SHARED_HANDLES,
  PRIMARY_DEV_WORKSPACE_USERS,
} from 'src/engine/workspace-manager/dev-seeder/core/constants/primary-dev-workspace-data.constant';
import { SEED_APPLE_WORKSPACE_ID } from 'src/engine/workspace-manager/dev-seeder/core/constants/seeder-workspaces.constant';
import { USER_WORKSPACE_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/core/utils/seed-user-workspaces.util';
import { CALENDAR_CHANNEL_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/calendar-channel-data-seeds.constant';
import { CONNECTED_ACCOUNT_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/connected-account-data-seeds.constant';
import { MESSAGE_CHANNEL_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/message-channel-data-seeds.constant';
import { MESSAGE_FOLDER_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/message-folder-data-seeds.constant';

type SeedMetadataEntitiesArgs = {
  queryRunner: QueryRunner;
  schemaName: string;
  workspaceId: string;
};

type WorkspaceSeedIds = {
  userWorkspaceIds: {
    TIM: string;
    JONY: string;
    PHIL: string;
    JANE: string;
  };
  connectedAccountIds: typeof CONNECTED_ACCOUNT_DATA_SEED_IDS;
  messageChannelIds: typeof MESSAGE_CHANNEL_DATA_SEED_IDS;
  calendarChannelIds: typeof CALENDAR_CHANNEL_DATA_SEED_IDS;
  messageFolderIds: typeof MESSAGE_FOLDER_DATA_SEED_IDS;
};

const getSeedIds = (): WorkspaceSeedIds => ({
  userWorkspaceIds: {
    TIM: USER_WORKSPACE_DATA_SEED_IDS.TIM,
    JONY: USER_WORKSPACE_DATA_SEED_IDS.JONY,
    PHIL: USER_WORKSPACE_DATA_SEED_IDS.PHIL,
    JANE: USER_WORKSPACE_DATA_SEED_IDS.JANE,
  },
  connectedAccountIds: CONNECTED_ACCOUNT_DATA_SEED_IDS,
  messageChannelIds: MESSAGE_CHANNEL_DATA_SEED_IDS,
  calendarChannelIds: CALENDAR_CHANNEL_DATA_SEED_IDS,
  messageFolderIds: MESSAGE_FOLDER_DATA_SEED_IDS,
});

export const seedMetadataEntities = async ({
  queryRunner,
  schemaName,
  workspaceId,
}: SeedMetadataEntitiesArgs) => {
  await seedConnectedAccounts({ queryRunner, schemaName, workspaceId });
  await seedMessageChannels({ queryRunner, schemaName, workspaceId });
  await seedCalendarChannels({ queryRunner, schemaName, workspaceId });
  await seedMessageFolders({ queryRunner, schemaName, workspaceId });
};

const seedConnectedAccounts = async ({
  queryRunner,
  schemaName,
  workspaceId,
}: SeedMetadataEntitiesArgs) => {
  const ids = getSeedIds();

  const connectedAccounts = [
    {
      id: ids.connectedAccountIds.TIM,
      handle: PRIMARY_DEV_WORKSPACE_USERS.TIM.email,
      provider: 'google',
      userWorkspaceId: ids.userWorkspaceIds.TIM,
      workspaceId,
    },
    {
      id: ids.connectedAccountIds.JONY,
      handle: PRIMARY_DEV_WORKSPACE_USERS.JONY.email,
      provider: 'google',
      userWorkspaceId: ids.userWorkspaceIds.JONY,
      workspaceId,
    },
    {
      id: ids.connectedAccountIds.PHIL,
      handle: PRIMARY_DEV_WORKSPACE_USERS.PHIL.email,
      provider: 'google',
      userWorkspaceId: ids.userWorkspaceIds.PHIL,
      workspaceId,
    },
    {
      id: ids.connectedAccountIds.JANE,
      handle: PRIMARY_DEV_WORKSPACE_USERS.JANE.email,
      provider: 'google',
      userWorkspaceId: ids.userWorkspaceIds.JANE,
      workspaceId,
    },
    {
      id: ids.connectedAccountIds.JANE_DELETABLE,
      handle: PRIMARY_DEV_WORKSPACE_SHARED_HANDLES.ARCHIVE,
      provider: 'google',
      userWorkspaceId: ids.userWorkspaceIds.JANE,
      workspaceId,
    },
  ];

  await queryRunner.manager
    .createQueryBuilder()
    .insert()
    .into(`${schemaName}.connectedAccount`, [
      'id',
      'handle',
      'provider',
      'userWorkspaceId',
      'workspaceId',
    ])
    .orIgnore()
    .values(connectedAccounts)
    .execute();
};

const seedMessageChannels = async ({
  queryRunner,
  schemaName,
  workspaceId,
}: SeedMetadataEntitiesArgs) => {
  const ids = getSeedIds();

  const messageChannels = [
    {
      id: ids.messageChannelIds.TIM,
      handle: PRIMARY_DEV_WORKSPACE_USERS.TIM.email,
      visibility: MessageChannelVisibility.SHARE_EVERYTHING,
      type: MessageChannelType.EMAIL,
      syncStage: MessageChannelSyncStage.MESSAGE_LIST_FETCH_PENDING,
      isContactAutoCreationEnabled: true,
      contactAutoCreationPolicy: 'SENT_AND_RECEIVED',
      messageFolderImportPolicy: 'ALL_FOLDERS',
      excludeNonProfessionalEmails: false,
      excludeGroupEmails: false,
      pendingGroupEmailsAction: 'NONE',
      isSyncEnabled: true,
      connectedAccountId: ids.connectedAccountIds.TIM,
      workspaceId,
    },
    {
      id: ids.messageChannelIds.JONY,
      handle: PRIMARY_DEV_WORKSPACE_USERS.JONY.email,
      visibility: MessageChannelVisibility.SHARE_EVERYTHING,
      type: MessageChannelType.EMAIL,
      syncStage: MessageChannelSyncStage.MESSAGE_LIST_FETCH_PENDING,
      isContactAutoCreationEnabled: true,
      contactAutoCreationPolicy: 'SENT_AND_RECEIVED',
      messageFolderImportPolicy: 'ALL_FOLDERS',
      excludeNonProfessionalEmails: false,
      excludeGroupEmails: false,
      pendingGroupEmailsAction: 'NONE',
      isSyncEnabled: true,
      connectedAccountId: ids.connectedAccountIds.JONY,
      workspaceId,
    },
    {
      id: ids.messageChannelIds.PHIL,
      handle: PRIMARY_DEV_WORKSPACE_USERS.PHIL.email,
      visibility: MessageChannelVisibility.SHARE_EVERYTHING,
      type: MessageChannelType.EMAIL,
      syncStage: MessageChannelSyncStage.MESSAGE_LIST_FETCH_PENDING,
      isContactAutoCreationEnabled: true,
      contactAutoCreationPolicy: 'SENT_AND_RECEIVED',
      messageFolderImportPolicy: 'ALL_FOLDERS',
      excludeNonProfessionalEmails: false,
      excludeGroupEmails: false,
      pendingGroupEmailsAction: 'NONE',
      isSyncEnabled: true,
      connectedAccountId: ids.connectedAccountIds.PHIL,
      workspaceId,
    },
    {
      id: ids.messageChannelIds.JANE,
      handle: PRIMARY_DEV_WORKSPACE_USERS.JANE.email,
      visibility: MessageChannelVisibility.SHARE_EVERYTHING,
      type: MessageChannelType.EMAIL,
      syncStage: MessageChannelSyncStage.MESSAGE_LIST_FETCH_PENDING,
      isContactAutoCreationEnabled: true,
      contactAutoCreationPolicy: 'SENT_AND_RECEIVED',
      messageFolderImportPolicy: 'ALL_FOLDERS',
      excludeNonProfessionalEmails: false,
      excludeGroupEmails: false,
      pendingGroupEmailsAction: 'NONE',
      isSyncEnabled: true,
      connectedAccountId: ids.connectedAccountIds.JANE,
      workspaceId,
    },
    {
      id: ids.messageChannelIds.SUPPORT,
      handle: PRIMARY_DEV_WORKSPACE_SHARED_HANDLES.CONTACT,
      visibility: MessageChannelVisibility.SHARE_EVERYTHING,
      type: MessageChannelType.EMAIL,
      syncStage: MessageChannelSyncStage.MESSAGE_LIST_FETCH_PENDING,
      isContactAutoCreationEnabled: true,
      contactAutoCreationPolicy: 'SENT_AND_RECEIVED',
      messageFolderImportPolicy: 'ALL_FOLDERS',
      excludeNonProfessionalEmails: false,
      excludeGroupEmails: false,
      pendingGroupEmailsAction: 'NONE',
      isSyncEnabled: true,
      connectedAccountId: ids.connectedAccountIds.TIM,
      workspaceId,
    },
    {
      id: ids.messageChannelIds.SALES,
      handle: PRIMARY_DEV_WORKSPACE_SHARED_HANDLES.SALES,
      visibility: MessageChannelVisibility.SHARE_EVERYTHING,
      type: MessageChannelType.EMAIL,
      syncStage: MessageChannelSyncStage.MESSAGE_LIST_FETCH_PENDING,
      isContactAutoCreationEnabled: true,
      contactAutoCreationPolicy: 'SENT_AND_RECEIVED',
      messageFolderImportPolicy: 'ALL_FOLDERS',
      excludeNonProfessionalEmails: false,
      excludeGroupEmails: false,
      pendingGroupEmailsAction: 'NONE',
      isSyncEnabled: true,
      connectedAccountId: ids.connectedAccountIds.TIM,
      workspaceId,
    },
  ];

  await queryRunner.manager
    .createQueryBuilder()
    .insert()
    .into(`${schemaName}.messageChannel`, [
      'id',
      'handle',
      'visibility',
      'type',
      'syncStage',
      'isContactAutoCreationEnabled',
      'contactAutoCreationPolicy',
      'messageFolderImportPolicy',
      'excludeNonProfessionalEmails',
      'excludeGroupEmails',
      'pendingGroupEmailsAction',
      'isSyncEnabled',
      'connectedAccountId',
      'workspaceId',
    ])
    .orIgnore()
    .values(messageChannels)
    .execute();
};

const seedCalendarChannels = async ({
  queryRunner,
  schemaName,
  workspaceId,
}: SeedMetadataEntitiesArgs) => {
  const ids = getSeedIds();

  const calendarChannels = [
    {
      id: ids.calendarChannelIds.TIM,
      handle: PRIMARY_DEV_WORKSPACE_USERS.TIM.email,
      visibility: CalendarChannelVisibility.METADATA,
      syncStage: 'CALENDAR_EVENT_LIST_FETCH_PENDING',
      isContactAutoCreationEnabled: true,
      contactAutoCreationPolicy: 'NONE',
      isSyncEnabled: true,
      connectedAccountId: ids.connectedAccountIds.TIM,
      workspaceId,
    },
    {
      id: ids.calendarChannelIds.JONY,
      handle: PRIMARY_DEV_WORKSPACE_USERS.JONY.email,
      visibility: CalendarChannelVisibility.SHARE_EVERYTHING,
      syncStage: 'CALENDAR_EVENT_LIST_FETCH_PENDING',
      isContactAutoCreationEnabled: true,
      contactAutoCreationPolicy: 'NONE',
      isSyncEnabled: true,
      connectedAccountId: ids.connectedAccountIds.JONY,
      workspaceId,
    },
    {
      id: ids.calendarChannelIds.PHIL,
      handle: PRIMARY_DEV_WORKSPACE_USERS.PHIL.email,
      visibility: CalendarChannelVisibility.METADATA,
      syncStage: 'CALENDAR_EVENT_LIST_FETCH_PENDING',
      isContactAutoCreationEnabled: true,
      contactAutoCreationPolicy: 'NONE',
      isSyncEnabled: true,
      connectedAccountId: ids.connectedAccountIds.PHIL,
      workspaceId,
    },
    {
      id: ids.calendarChannelIds.JANE,
      handle: PRIMARY_DEV_WORKSPACE_USERS.JANE.email,
      visibility: CalendarChannelVisibility.SHARE_EVERYTHING,
      syncStage: 'CALENDAR_EVENT_LIST_FETCH_PENDING',
      isContactAutoCreationEnabled: true,
      contactAutoCreationPolicy: 'NONE',
      isSyncEnabled: true,
      connectedAccountId: ids.connectedAccountIds.JANE,
      workspaceId,
    },
    {
      id: ids.calendarChannelIds.COMPANY_MAIN,
      handle: PRIMARY_DEV_WORKSPACE_SHARED_HANDLES.LEADERSHIP,
      visibility: CalendarChannelVisibility.SHARE_EVERYTHING,
      syncStage: 'CALENDAR_EVENT_LIST_FETCH_PENDING',
      isContactAutoCreationEnabled: true,
      contactAutoCreationPolicy: 'NONE',
      isSyncEnabled: true,
      connectedAccountId: ids.connectedAccountIds.TIM,
      workspaceId,
    },
    {
      id: ids.calendarChannelIds.TEAM_CALENDAR,
      handle: PRIMARY_DEV_WORKSPACE_SHARED_HANDLES.TEAM_CALENDAR,
      visibility: CalendarChannelVisibility.SHARE_EVERYTHING,
      syncStage: 'CALENDAR_EVENT_LIST_FETCH_PENDING',
      isContactAutoCreationEnabled: true,
      contactAutoCreationPolicy: 'NONE',
      isSyncEnabled: true,
      connectedAccountId: ids.connectedAccountIds.TIM,
      workspaceId,
    },
  ];

  await queryRunner.manager
    .createQueryBuilder()
    .insert()
    .into(`${schemaName}.calendarChannel`, [
      'id',
      'handle',
      'visibility',
      'syncStage',
      'isContactAutoCreationEnabled',
      'contactAutoCreationPolicy',
      'isSyncEnabled',
      'connectedAccountId',
      'workspaceId',
    ])
    .orIgnore()
    .values(calendarChannels)
    .execute();
};

const seedMessageFolders = async ({
  queryRunner,
  schemaName,
  workspaceId,
}: SeedMetadataEntitiesArgs) => {
  const ids = getSeedIds();

  const messageFolders = [
    {
      id: ids.messageFolderIds.TIM_INBOX,
      name: 'INBOX',
      isSynced: true,
      isSentFolder: false,
      messageChannelId: ids.messageChannelIds.TIM,
      workspaceId,
      pendingSyncAction: MessageFolderPendingSyncAction.NONE,
    },
    {
      id: ids.messageFolderIds.JONY_INBOX,
      name: 'INBOX',
      isSynced: true,
      isSentFolder: false,
      messageChannelId: ids.messageChannelIds.JONY,
      workspaceId,
      pendingSyncAction: MessageFolderPendingSyncAction.NONE,
    },
    {
      id: ids.messageFolderIds.JANE_INBOX,
      name: 'INBOX',
      isSynced: true,
      isSentFolder: false,
      messageChannelId: ids.messageChannelIds.JANE,
      workspaceId,
      pendingSyncAction: MessageFolderPendingSyncAction.NONE,
    },
    {
      id: ids.messageFolderIds.JANE_SENT,
      name: 'Sent',
      isSynced: true,
      isSentFolder: true,
      messageChannelId: ids.messageChannelIds.JANE,
      workspaceId,
      pendingSyncAction: MessageFolderPendingSyncAction.NONE,
    },
  ];

  await queryRunner.manager
    .createQueryBuilder()
    .insert()
    .into(`${schemaName}.messageFolder`, [
      'id',
      'name',
      'isSynced',
      'isSentFolder',
      'messageChannelId',
      'workspaceId',
      'pendingSyncAction',
    ])
    .orIgnore()
    .values(messageFolders)
    .execute();
};
