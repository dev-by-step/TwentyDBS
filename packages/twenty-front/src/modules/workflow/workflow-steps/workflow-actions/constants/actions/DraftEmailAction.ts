import { msg } from '@lingui/core/macro';
import { type MessageDescriptor } from '@lingui/core';
import { type WorkflowActionType } from '@/workflow/types/Workflow';

export const DRAFT_EMAIL_ACTION: {
  defaultLabel: string | MessageDescriptor;
  type: Extract<WorkflowActionType, 'DRAFT_EMAIL'>;
  icon: string;
} = {
  defaultLabel: msg`Draft Email`,
  type: 'DRAFT_EMAIL',
  icon: 'IconMailPlus',
};
