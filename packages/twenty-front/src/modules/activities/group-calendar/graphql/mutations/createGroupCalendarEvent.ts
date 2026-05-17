import { gql } from '@apollo/client';

export const createGroupCalendarEvent = gql`
  mutation CreateGroupCalendarEvent($input: CreateGroupCalendarEventInput!) {
    createGroupCalendarEvent(input: $input)
  }
`;
