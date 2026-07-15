import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { type WorkflowVersionStatus } from '@/workflow/types/Workflow';
import { type TagColor } from 'twenty-ui/components';

export const getWorkflowVersionStatusTagProps = ({
  workflowVersionStatus,
}: {
  workflowVersionStatus: WorkflowVersionStatus;
}): { color: TagColor; text: MessageDescriptor } => {
  if (workflowVersionStatus === 'ARCHIVED') {
    return { color: 'gray', text: msg`Archived` };
  }
  if (workflowVersionStatus === 'DRAFT') {
    return { color: 'yellow', text: msg`Draft` };
  }
  if (workflowVersionStatus === 'ACTIVE') {
    return { color: 'green', text: msg`Active` };
  }
  return { color: 'gray', text: msg`Deactivated` };
};
