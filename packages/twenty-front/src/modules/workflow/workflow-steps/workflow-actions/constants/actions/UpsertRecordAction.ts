import { msg } from '@lingui/core/macro';
import { type MessageDescriptor } from '@lingui/core';
import { type WorkflowActionType } from '@/workflow/types/Workflow';

export const UPSERT_RECORD_ACTION: {
  defaultLabel: string | MessageDescriptor;
  type: Extract<WorkflowActionType, 'UPSERT_RECORD'>;
  icon: string;
} = {
  defaultLabel: msg`Create or Update Record`,
  type: 'UPSERT_RECORD',
  icon: 'IconPencilPlus',
};
