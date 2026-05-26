import { msg } from '@lingui/core/macro';
import { type MessageDescriptor } from '@lingui/core';
import { type WorkflowActionType } from '@/workflow/types/Workflow';

export const FORM_ACTION: {
  defaultLabel: string | MessageDescriptor;
  type: Extract<WorkflowActionType, 'FORM'>;
  icon: string;
} = {
  defaultLabel: msg`Form`,
  type: 'FORM',
  icon: 'IconForms',
};
