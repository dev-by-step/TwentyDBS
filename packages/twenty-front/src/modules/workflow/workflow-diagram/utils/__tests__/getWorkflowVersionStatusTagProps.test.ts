import { type WorkflowVersionStatus } from '@/workflow/types/Workflow';
import { getWorkflowVersionStatusTagProps } from '@/workflow/workflow-diagram/utils/getWorkflowVersionStatusTagProps';

describe('getWorkflowVersionStatusTagProps', () => {
  it('should return gray color and "Archived" text for ARCHIVED status', () => {
    const result = getWorkflowVersionStatusTagProps({
      workflowVersionStatus: 'ARCHIVED',
    });

    expect(result).toMatchInlineSnapshot(`
{
  "color": "gray",
  "text": {
    "id": "Archived",
    "message": "Archived",
    "values": {},
  },
}
`);
  });

  it('should return yellow color and "Draft" text for DRAFT status', () => {
    const result = getWorkflowVersionStatusTagProps({
      workflowVersionStatus: 'DRAFT',
    });

    expect(result).toMatchInlineSnapshot(`
{
  "color": "yellow",
  "text": {
    "id": "Draft",
    "message": "Draft",
    "values": {},
  },
}
`);
  });

  it('should return green color and "Active" text for ACTIVE status', () => {
    const result = getWorkflowVersionStatusTagProps({
      workflowVersionStatus: 'ACTIVE',
    });

    expect(result).toMatchInlineSnapshot(`
{
  "color": "green",
  "text": {
    "id": "Active",
    "message": "Active",
    "values": {},
  },
}
`);
  });

  it('should return gray color and "Deactivated" text for DEACTIVATED status', () => {
    const result = getWorkflowVersionStatusTagProps({
      workflowVersionStatus: 'DEACTIVATED',
    });

    expect(result).toMatchInlineSnapshot(`
{
  "color": "gray",
  "text": {
    "id": "Deactivated",
    "message": "Deactivated",
    "values": {},
  },
}
`);
  });

  it('should return gray color and "Deactivated" text for any unknown status (default case)', () => {
    const result = getWorkflowVersionStatusTagProps({
      workflowVersionStatus: 'UNKNOWN_STATUS' as WorkflowVersionStatus,
    });

    expect(result).toMatchInlineSnapshot(`
{
  "color": "gray",
  "text": {
    "id": "Deactivated",
    "message": "Deactivated",
    "values": {},
  },
}
`);
  });
});
