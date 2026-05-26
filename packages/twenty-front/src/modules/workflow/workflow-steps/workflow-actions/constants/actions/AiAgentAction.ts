import { msg } from '@lingui/core/macro';
import { type MessageDescriptor } from '@lingui/core';
import { type WorkflowActionType } from '@/workflow/types/Workflow';

export const AI_AGENT_ACTION: {
  defaultLabel: string | MessageDescriptor;
  type: Extract<WorkflowActionType, 'AI_AGENT'>;
  icon: string;
} = {
  defaultLabel: msg`AI Agent`,
  type: 'AI_AGENT',
  icon: 'IconBrain',
};
