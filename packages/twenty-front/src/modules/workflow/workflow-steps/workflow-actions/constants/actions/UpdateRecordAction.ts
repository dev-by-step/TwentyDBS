import { msg } from '@lingui/core/macro';
import { type MessageDescriptor } from '@lingui/core';
import { type WorkflowActionType } from '@/workflow/types/Workflow';

export const UPDATE_RECORD_ACTION: {
  defaultLabel: string | MessageDescriptor;
  type: Extract<WorkflowActionType, 'UPDATE_RECORD'>;
  icon: string;
} = {
  defaultLabel: msg`Update Record`,
  type: 'UPDATE_RECORD',
  icon: 'IconReload',
};
