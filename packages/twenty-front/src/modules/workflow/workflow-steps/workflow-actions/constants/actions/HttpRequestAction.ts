import { msg } from '@lingui/core/macro';
import { type MessageDescriptor } from '@lingui/core';
import { type WorkflowActionType } from '@/workflow/types/Workflow';

export const HTTP_REQUEST_ACTION: {
  defaultLabel: string | MessageDescriptor;
  type: Extract<WorkflowActionType, 'HTTP_REQUEST'>;
  icon: string;
} = {
  defaultLabel: msg`HTTP Request`,
  type: 'HTTP_REQUEST',
  icon: 'IconWorld',
};
