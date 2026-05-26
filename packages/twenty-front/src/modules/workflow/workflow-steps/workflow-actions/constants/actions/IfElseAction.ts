import { msg } from '@lingui/core/macro';
import { type MessageDescriptor } from '@lingui/core';
import { type WorkflowActionType } from '@/workflow/types/Workflow';

export const IF_ELSE_ACTION: {
  defaultLabel: string | MessageDescriptor;
  type: Extract<WorkflowActionType, 'IF_ELSE'>;
  icon: string;
} = {
  defaultLabel: msg`If/else`,
  type: 'IF_ELSE',
  icon: 'IconArrowsSplit',
};
