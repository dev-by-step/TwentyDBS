import { type QueryRunner } from 'typeorm';

import { USER_WORKSPACE_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/core/utils/seed-user-workspaces.util';

const agentChatThreadTableName = 'agentChatThread';

export const AGENT_DATA_SEED_IDS = {
  DEFAULT_AGENT: '20202020-0000-4000-8000-000000000001',
};

export const AGENT_CHAT_THREAD_DATA_SEED_IDS = {
  DEFAULT_THREAD: '20202020-0000-4000-8000-000000000011',
};

type SeedChatThreadsArgs = {
  queryRunner: QueryRunner;
  schemaName: string;
  workspaceId: string;
};

const seedChatThreads = async ({
  queryRunner,
  schemaName,
  workspaceId,
}: SeedChatThreadsArgs) => {
  const now = new Date();

  await queryRunner.manager
    .createQueryBuilder()
    .insert()
    .into(`${schemaName}.${agentChatThreadTableName}`, [
      'id',
      'workspaceId',
      'userWorkspaceId',
      'createdAt',
      'updatedAt',
    ])
    .orIgnore()
    .values([
      {
        id: AGENT_CHAT_THREAD_DATA_SEED_IDS.DEFAULT_THREAD,
        workspaceId,
        // userWorkspaceId is NOT NULL: must reference a real seeded
        // userWorkspace row (owner of the default chat thread), not an
        // empty string.
        userWorkspaceId: USER_WORKSPACE_DATA_SEED_IDS.JONY,
        createdAt: now,
        updatedAt: now,
      },
    ])
    .execute();

  return AGENT_CHAT_THREAD_DATA_SEED_IDS.DEFAULT_THREAD;
};

type SeedChatMessagesArgs = {
  queryRunner: QueryRunner;
  schemaName: string;
  workspaceId: string;
  threadId: string;
};

const seedChatMessages = async ({
  queryRunner,
  schemaName,
  workspaceId,
  threadId,
}: SeedChatMessagesArgs) => {
  const messageIds = [
    '20202020-0000-4000-8000-000000000021',
    '20202020-0000-4000-8000-000000000022',
    '20202020-0000-4000-8000-000000000023',
    '20202020-0000-4000-8000-000000000024',
  ];
  const turnIds = [
    '20202020-0000-4000-8000-000000000061',
    '20202020-0000-4000-8000-000000000062',
  ];
  const now = new Date();
  const baseTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const messages = [
    {
      id: messageIds[0],
      workspaceId,
      threadId,
      turnId: turnIds[0],
      role: 'user' as const,
      createdAt: new Date(baseTime.getTime()),
    },
    {
      id: messageIds[1],
      workspaceId,
      threadId,
      turnId: turnIds[0],
      role: 'assistant' as const,
      createdAt: new Date(baseTime.getTime() + 5 * 60 * 1000),
    },
    {
      id: messageIds[2],
      workspaceId,
      threadId,
      turnId: turnIds[1],
      role: 'user' as const,
      createdAt: new Date(baseTime.getTime() + 10 * 60 * 1000),
    },
    {
      id: messageIds[3],
      workspaceId,
      threadId,
      turnId: turnIds[1],
      role: 'assistant' as const,
      createdAt: new Date(baseTime.getTime() + 15 * 60 * 1000),
    },
  ];

  const turns = turnIds.map((id, index) => ({
    id,
    workspaceId,
    threadId,
    createdAt: messages[index * 2].createdAt,
  }));

  const messageParts = [];
  for (const m of messages) {
    messageParts.push({
      id: `20202020-0000-4000-8000-00000000004${messages.indexOf(m) + 1}`,
      workspaceId,
      messageId: m.id,
      orderIndex: 0,
      type: 'text',
      textContent: '',
      createdAt: m.createdAt,
    });
  }

  const agentTurnTableName = 'agentTurn';
  const agentMessageTableName = 'agentMessage';
  const agentMessagePartTableName = 'agentMessagePart';

  await queryRunner.manager
    .createQueryBuilder()
    .insert()
    .into(`${schemaName}.${agentTurnTableName}`, [
      'id',
      'workspaceId',
      'threadId',
      'createdAt',
    ])
    .orIgnore()
    .values(turns)
    .execute();

  await queryRunner.manager
    .createQueryBuilder()
    .insert()
    .into(`${schemaName}.${agentMessageTableName}`, [
      'id',
      'workspaceId',
      'threadId',
      'turnId',
      'role',
      'createdAt',
    ])
    .orIgnore()
    .values(messages)
    .execute();

  await queryRunner.manager
    .createQueryBuilder()
    .insert()
    .into(`${schemaName}.${agentMessagePartTableName}`, [
      'id',
      'workspaceId',
      'messageId',
      'orderIndex',
      'type',
      'textContent',
      'createdAt',
    ])
    .orIgnore()
    .values(messageParts)
    .execute();
};

type SeedAgentsArgs = {
  queryRunner: QueryRunner;
  schemaName: string;
  workspaceId: string;
};

export const seedAgents = async ({
  queryRunner,
  schemaName,
  workspaceId,
}: SeedAgentsArgs) => {
  const threadId = await seedChatThreads({
    queryRunner,
    schemaName,
    workspaceId,
  });

  await seedChatMessages({
    queryRunner,
    schemaName,
    workspaceId,
    threadId,
  });
};
