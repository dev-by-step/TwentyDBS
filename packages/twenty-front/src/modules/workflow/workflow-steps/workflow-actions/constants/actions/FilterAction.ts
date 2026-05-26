import { msg } from '@lingui/core/macro';
import { type MessageDescriptor } from '@lingui/core';
import { type WorkflowActionType } from '@/workflow/types/Workflow';

export const FILTER_ACTION: {
  defaultLabel: string | MessageDescriptor;
  type: Extract<WorkflowActionType, 'FILTER'>;
  icon: string;
} = {
  defaultLabel: msg`Filter`,
  type: 'FILTER',
  icon: 'IconFilter',
};
