import { isDefined } from 'twenty-shared/utils';

import { COMPANY_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/company-data-seeds.constant';
import { INTERNAL_ENTITY_DEMO_RECORDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/internal-entity-demo-records.constant';
import { PERSON_DATA_SEED_IDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/person-data-seeds.constant';
import { WORKSPACE_MEMBER_DATA_SEEDS } from 'src/engine/workspace-manager/dev-seeder/data/constants/workspace-member-data-seeds.constant';

type OpportunityDataSeed = {
  id: string;
  name: string;
  amountAmountMicros: number;
  amountCurrencyCode: string;
  closeDate: Date;
  stage: string;
  position: number;
  pointOfContactId: string;
  companyId: string;
  ownerId: string;
  createdBySource: string;
  createdByWorkspaceMemberId: string;
  createdByName: string;
  updatedBySource: string;
  updatedByWorkspaceMemberId: string;
  updatedByName: string;
};

export const OPPORTUNITY_DATA_SEED_COLUMNS: (keyof OpportunityDataSeed)[] = [
  'id',
  'name',
  'amountAmountMicros',
  'amountCurrencyCode',
  'closeDate',
  'stage',
  'position',
  'pointOfContactId',
  'companyId',
  'ownerId',
  'createdBySource',
  'createdByWorkspaceMemberId',
  'createdByName',
  'updatedBySource',
  'updatedByWorkspaceMemberId',
  'updatedByName',
];

const GENERATE_OPPORTUNITY_IDS = (): Record<string, string> => {
  const OPPORTUNITY_IDS: Record<string, string> = {};

  for (let INDEX = 1; INDEX <= 50; INDEX++) {
    const HEX_INDEX = INDEX.toString(16).padStart(4, '0');

    OPPORTUNITY_IDS[`ID_${INDEX}`] =
      `50505050-${HEX_INDEX}-4e7c-8001-123456789abc`;
  }

  return OPPORTUNITY_IDS;
};

export const OPPORTUNITY_DATA_SEED_IDS = GENERATE_OPPORTUNITY_IDS();

// Curated opportunity names for a shared B2B CRM used across internal entities.
const OPPORTUNITY_TEMPLATES = [
  { name: 'Atlas CRM Rollout', amount: 2500000, stage: 'PROPOSAL' },
  { name: 'Orbis Data Platform Migration', amount: 1800000, stage: 'MEETING' },
  { name: 'Groupe Sales Hub Deployment', amount: 3200000, stage: 'NEW' },
  { name: 'Shared Calendar Governance', amount: 450000, stage: 'SCREENING' },
  {
    name: 'Multi-entity Permissions Rollout',
    amount: 890000,
    stage: 'PROPOSAL',
  },
  { name: 'Contact Repository Cleanup', amount: 670000, stage: 'MEETING' },
  { name: 'Workspace Analytics Dashboard', amount: 320000, stage: 'NEW' },
  {
    name: 'Customer 360 Data Model',
    amount: 1200000,
    stage: 'CUSTOMER',
  },
  {
    name: 'Pipeline Forecasting Automation',
    amount: 180000,
    stage: 'PROPOSAL',
  },
  { name: 'Executive Reporting Pack', amount: 950000, stage: 'MEETING' },
  { name: 'Lead Routing Rules Setup', amount: 85000, stage: 'NEW' },
  {
    name: 'Opportunity Review Workflow',
    amount: 2100000,
    stage: 'SCREENING',
  },
  { name: 'Group Calendar Adoption Plan', amount: 780000, stage: 'PROPOSAL' },
  { name: 'Entity-level Access Audit', amount: 1500000, stage: 'MEETING' },
  { name: 'Internal Entity Directory', amount: 620000, stage: 'NEW' },
  { name: 'Client Onboarding Automation', amount: 95000, stage: 'CUSTOMER' },
  { name: 'RevOps Process Mapping', amount: 430000, stage: 'PROPOSAL' },
  {
    name: 'Cross-entity Opportunity Sharing',
    amount: 75000,
    stage: 'SCREENING',
  },
  { name: 'Commercial Data Quality Sprint', amount: 540000, stage: 'MEETING' },
  { name: 'Shared Inbox Governance', amount: 125000, stage: 'NEW' },
  {
    name: 'Procurement Workflow Digitization',
    amount: 380000,
    stage: 'PROPOSAL',
  },
  {
    name: 'Key Account Steering Toolkit',
    amount: 45000,
    stage: 'CUSTOMER',
  },
  {
    name: 'Multi-brand Contact Unification',
    amount: 1600000,
    stage: 'MEETING',
  },
  {
    name: 'Sales Compensation Reporting',
    amount: 850000,
    stage: 'SCREENING',
  },
  { name: 'Business Review Automation', amount: 65000, stage: 'NEW' },
  {
    name: 'Forecast Reliability Initiative',
    amount: 155000,
    stage: 'PROPOSAL',
  },
  { name: 'Support Queue Routing', amount: 290000, stage: 'MEETING' },
  {
    name: 'Partner Pipeline Tracking',
    amount: 720000,
    stage: 'CUSTOMER',
  },
  { name: 'Calendar Privacy Hardening', amount: 1350000, stage: 'PROPOSAL' },
  { name: 'CRM Mobile Rollout', amount: 210000, stage: 'SCREENING' },
  {
    name: 'KPI Scorecard Standardization',
    amount: 85000,
    stage: 'NEW',
  },
  { name: 'Customer Success Handover Flow', amount: 180000, stage: 'MEETING' },
  {
    name: 'Entity Manager Training Program',
    amount: 490000,
    stage: 'PROPOSAL',
  },
  { name: 'Shared Meeting Notes Workspace', amount: 320000, stage: 'CUSTOMER' },
  { name: 'Renewal Risk Monitoring', amount: 750000, stage: 'MEETING' },
  { name: 'Bid Desk Workflow Design', amount: 280000, stage: 'SCREENING' },
  { name: 'Referral Tracking Setup', amount: 195000, stage: 'NEW' },
  {
    name: 'Executive Deal Review Cadence',
    amount: 340000,
    stage: 'PROPOSAL',
  },
  { name: 'Contract Approval Workflow', amount: 2800000, stage: 'MEETING' },
  {
    name: 'Group Activity Timeline',
    amount: 120000,
    stage: 'CUSTOMER',
  },
  { name: 'Account Segmentation Model', amount: 580000, stage: 'PROPOSAL' },
  {
    name: 'Duplicate Detection Program',
    amount: 165000,
    stage: 'SCREENING',
  },
  { name: 'Stakeholder Mapping Sprint', amount: 95000, stage: 'NEW' },
  {
    name: 'Sales Playbook Migration',
    amount: 420000,
    stage: 'MEETING',
  },
  {
    name: 'Revenue Attribution Cleanup',
    amount: 350000,
    stage: 'PROPOSAL',
  },
  {
    name: 'Marketing to Sales Handoff',
    amount: 75000,
    stage: 'CUSTOMER',
  },
  {
    name: 'Calendar Visibility Pilot',
    amount: 1100000,
    stage: 'MEETING',
  },
  { name: 'Entity-based Territory Design', amount: 240000, stage: 'SCREENING' },
  { name: 'Portfolio Steering Dashboard', amount: 680000, stage: 'NEW' },
  {
    name: 'Group CRM Stabilization',
    amount: 1950000,
    stage: 'PROPOSAL',
  },
];

const GENERATE_OPPORTUNITY_SEEDS = (): OpportunityDataSeed[] => {
  const OPPORTUNITY_SEEDS: OpportunityDataSeed[] = [];
  const COMPANY_RECORD_COUNT = INTERNAL_ENTITY_DEMO_RECORDS.length;

  for (let INDEX = 1; INDEX <= 50; INDEX++) {
    const TEMPLATE_INDEX = (INDEX - 1) % OPPORTUNITY_TEMPLATES.length;
    const TEMPLATE = OPPORTUNITY_TEMPLATES[TEMPLATE_INDEX];
    const DAYS_AHEAD = Math.floor(Math.random() * 90) + 1;
    const CLOSE_DATE = new Date();

    CLOSE_DATE.setDate(CLOSE_DATE.getDate() + DAYS_AHEAD);

    const demoRecord =
      INTERNAL_ENTITY_DEMO_RECORDS[(INDEX - 1) % COMPANY_RECORD_COUNT];

    if (!isDefined(demoRecord)) {
      throw new Error(`Missing demo company mapping for opportunity ${INDEX}`);
    }
    const cycleIndex = Math.floor((INDEX - 1) / COMPANY_RECORD_COUNT);
    const opportunityWorkspaceMemberIds =
      demoRecord.opportunityWorkspaceMemberIds ?? [demoRecord.workspaceMemberId];
    const workspaceMemberId =
      opportunityWorkspaceMemberIds[
        cycleIndex % opportunityWorkspaceMemberIds.length
      ];
    const workspaceMember = WORKSPACE_MEMBER_DATA_SEEDS.find(
      (workspaceMember) => workspaceMember.id === workspaceMemberId,
    );
    const workspaceMemberName = isDefined(workspaceMember)
      ? `${workspaceMember?.nameFirstName} ${workspaceMember?.nameLastName}`
      : 'Unknown';
    const contact =
      demoRecord.contacts[cycleIndex % demoRecord.contacts.length];

    if (!isDefined(contact)) {
      throw new Error(
        `Missing demo contact for company ${demoRecord.companyName}`,
      );
    }

    const rawSeed: OpportunityDataSeed = {
      id: OPPORTUNITY_DATA_SEED_IDS[`ID_${INDEX}`],
      name: TEMPLATE.name,
      amountAmountMicros: TEMPLATE.amount * 1000000,
      amountCurrencyCode: 'USD',
      closeDate: CLOSE_DATE,
      stage: TEMPLATE.stage,
      position: INDEX,
      pointOfContactId: PERSON_DATA_SEED_IDS[contact.seedKey],
      companyId: COMPANY_DATA_SEED_IDS[demoRecord.companySeedKey],
      ownerId: workspaceMemberId,
      createdBySource: 'MANUAL',
      updatedBySource: 'MANUAL',
      createdByWorkspaceMemberId: workspaceMemberId,
      createdByName: workspaceMemberName,
      updatedByWorkspaceMemberId: workspaceMemberId,
      updatedByName: workspaceMemberName,
    };

    const opportunityDataSeedWithSQLColumnOrder: OpportunityDataSeed =
      Object.fromEntries(
        OPPORTUNITY_DATA_SEED_COLUMNS.map((column) => [
          column,
          rawSeed[column as keyof OpportunityDataSeed],
        ]),
      ) as OpportunityDataSeed;

    OPPORTUNITY_SEEDS.push(opportunityDataSeedWithSQLColumnOrder);
  }

  return OPPORTUNITY_SEEDS;
};

export const OPPORTUNITY_DATA_SEEDS = GENERATE_OPPORTUNITY_SEEDS();
