import { msg } from '@lingui/core/macro';
import { type MessageDescriptor } from '@lingui/core';
import { type WorkflowActionType } from '@/workflow/types/Workflow';

export const ITERATOR_ACTION: {
  defaultLabel: string | MessageDescriptor;
  type: Extract<WorkflowActionType, 'ITERATOR'>;
  icon: string;
} = {
  defaultLabel: msg`Iterator`,
  type: 'ITERATOR',
  icon: 'IconRepeat',
};
