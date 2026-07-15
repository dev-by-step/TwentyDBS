import { msg } from '@lingui/core/macro';
import { type MessageDescriptor } from '@lingui/core';
import { type WorkflowActionType } from '@/workflow/types/Workflow';

export const DELAY_ACTION: {
  defaultLabel: string | MessageDescriptor;
  type: Extract<WorkflowActionType, 'DELAY'>;
  icon: string;
} = {
  defaultLabel: msg`Delay`,
  type: 'DELAY',
  icon: 'IconPlayerPause',
};
