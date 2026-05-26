import { type WorkflowRunStatus } from '@/workflow/types/Workflow';
import { getWorkflowRunStatusTagProps } from '@/workflow/workflow-diagram/utils/getWorkflowRunStatusTagProps';

describe('getWorkflowRunStatusTagProps', () => {
  it('should return gray color and "Not started" text for NOT_STARTED status', () => {
    const result = getWorkflowRunStatusTagProps({
      workflowRunStatus: 'NOT_STARTED',
    });

    expect(result).toMatchInlineSnapshot(`
{
  "color": "gray",
  "text": {
    "id": "Not started",
    "message": "Not started",
    "values": {},
  },
}
`);
  });

  it('should return yellow color and "Running" text for RUNNING status', () => {
    const result = getWorkflowRunStatusTagProps({
      workflowRunStatus: 'RUNNING',
    });

    expect(result).toMatchInlineSnapshot(`
{
  "color": "yellow",
  "text": {
    "id": "Running",
    "message": "Running",
    "values": {},
  },
}
`);
  });

  it('should return green color and "Completed" text for COMPLETED status', () => {
    const result = getWorkflowRunStatusTagProps({
      workflowRunStatus: 'COMPLETED',
    });

    expect(result).toMatchInlineSnapshot(`
{
  "color": "green",
  "text": {
    "id": "Completed",
    "message": "Completed",
    "values": {},
  },
}
`);
  });

  it('should return blue color and "Enqueued" text for ENQUEUED status', () => {
    const result = getWorkflowRunStatusTagProps({
      workflowRunStatus: 'ENQUEUED',
    });

    expect(result).toMatchInlineSnapshot(`
{
  "color": "blue",
  "text": {
    "id": "Enqueued",
    "message": "Enqueued",
    "values": {},
  },
}
`);
  });

  it('should return red color and "Failed" text for FAILED status', () => {
    const result = getWorkflowRunStatusTagProps({
      workflowRunStatus: 'FAILED',
    });

    expect(result).toMatchInlineSnapshot(`
{
  "color": "red",
  "text": {
    "id": "Failed",
    "message": "Failed",
    "values": {},
  },
}
`);
  });

  it('should return red color and "Failed" text for any unknown status (default case)', () => {
    const result = getWorkflowRunStatusTagProps({
      workflowRunStatus: 'UNKNOWN_STATUS' as WorkflowRunStatus,
    });

    expect(result).toMatchInlineSnapshot(`
{
  "color": "red",
  "text": {
    "id": "Failed",
    "message": "Failed",
    "values": {},
  },
}
`);
  });
});
