import { msg } from '@lingui/core/macro';
import { type MessageDescriptor } from '@lingui/core';
import { type WorkflowActionType } from '@/workflow/types/Workflow';

export const CODE_ACTION: {
  defaultLabel: string | MessageDescriptor;
  type: Extract<WorkflowActionType, 'CODE'>;
  icon: string;
} = {
  defaultLabel: msg`Code - Logic Function`,
  type: 'CODE',
  icon: 'IconCode',
};
