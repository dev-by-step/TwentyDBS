import { msg } from '@lingui/core/macro';
import { type MessageDescriptor } from '@lingui/core';
import { type WorkflowActionType } from '@/workflow/types/Workflow';

export const FIND_RECORDS_ACTION: {
  defaultLabel: string | MessageDescriptor;
  type: Extract<WorkflowActionType, 'FIND_RECORDS'>;
  icon: string;
} = {
  defaultLabel: msg`Search Records`,
  type: 'FIND_RECORDS',
  icon: 'IconSearch',
};
