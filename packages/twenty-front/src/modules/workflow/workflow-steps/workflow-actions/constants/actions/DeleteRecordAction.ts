import { msg } from '@lingui/core/macro';
import { type MessageDescriptor } from '@lingui/core';
import { type WorkflowActionType } from '@/workflow/types/Workflow';

export const DELETE_RECORD_ACTION: {
  defaultLabel: string | MessageDescriptor;
  type: Extract<WorkflowActionType, 'DELETE_RECORD'>;
  icon: string;
} = {
  defaultLabel: msg`Delete Record`,
  type: 'DELETE_RECORD',
  icon: 'IconTrash',
};
