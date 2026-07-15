import { type MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { type WorkflowRunStatus } from '@/workflow/types/Workflow';
import { type TagColor } from 'twenty-ui/components';

export const getWorkflowRunStatusTagProps = ({
  workflowRunStatus,
}: {
  workflowRunStatus: WorkflowRunStatus;
}): { color: TagColor; text: MessageDescriptor } => {
  if (workflowRunStatus === 'NOT_STARTED') {
    return { color: 'gray', text: msg`Not started` };
  }
  if (workflowRunStatus === 'RUNNING') {
    return { color: 'yellow', text: msg`Running` };
  }
  if (workflowRunStatus === 'COMPLETED') {
    return { color: 'green', text: msg`Completed` };
  }
  if (workflowRunStatus === 'ENQUEUED') {
    return { color: 'blue', text: msg`Enqueued` };
  }
  if (workflowRunStatus === 'STOPPING') {
    return { color: 'orange', text: msg`Stopping` };
  }
  if (workflowRunStatus === 'STOPPED') {
    return { color: 'gray', text: msg`Stopped` };
  }
  return { color: 'red', text: msg`Failed` };
};
