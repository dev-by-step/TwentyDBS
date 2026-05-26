import { msg } from '@lingui/core/macro';
import { type MessageDescriptor } from '@lingui/core';
import { type WorkflowActionType } from '@/workflow/types/Workflow';

export const CREATE_RECORD_ACTION: {
  defaultLabel: string | MessageDescriptor;
  type: Extract<WorkflowActionType, 'CREATE_RECORD'>;
  icon: string;
} = {
  defaultLabel: msg`Create Record`,
  type: 'CREATE_RECORD',
  icon: 'IconPlus',
};
