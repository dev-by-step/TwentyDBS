import { msg } from '@lingui/core/macro';
import { type MessageDescriptor } from '@lingui/core';
import { type WorkflowActionType } from '@/workflow/types/Workflow';

export const SEND_EMAIL_ACTION: {
  defaultLabel: string | MessageDescriptor;
  type: Extract<WorkflowActionType, 'SEND_EMAIL'>;
  icon: string;
} = {
  defaultLabel: msg`Send Email`,
  type: 'SEND_EMAIL',
  icon: 'IconSend',
};
