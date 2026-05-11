import { Field, ObjectType } from '@nestjs/graphql';

import { CalendarChannelVisibility } from 'twenty-shared/types';
import { UUIDScalarType } from 'src/engine/api/graphql/workspace-schema-builder/graphql-types/scalars';
import { TimelineCalendarEventParticipantDTO } from 'src/engine/core-modules/calendar/dtos/timeline-calendar-event-participant.dto';

@ObjectType('LinkMetadata')
class LinkMetadataDTO {
  @Field()
  label: string;

  @Field()
  url: string;
}

@ObjectType('LinksMetadata')
export class LinksMetadataDTO {
  @Field()
  primaryLinkLabel: string;

  @Field()
  primaryLinkUrl: string;

  @Field(() => [LinkMetadataDTO], { nullable: true })
  secondaryLinks: LinkMetadataDTO[] | null;
}

@ObjectType('TimelineCalendarEvent')
export class TimelineCalendarEventDTO {
  @Field(() => UUIDScalarType)
  id: string;

  @Field()
  title: string;

  @Field()
  isCanceled: boolean;

  @Field()
  isFullDay: boolean;

  @Field()
  startsAt: Date;

  @Field()
  endsAt: Date;

  @Field({ nullable: true })
  description: string | null;

  @Field({ nullable: true })
  location: string | null;

  @Field({ nullable: true })
  conferenceSolution: string | null;

  @Field(() => LinksMetadataDTO, { nullable: true })
  conferenceLink: LinksMetadataDTO | null;

  @Field(() => [TimelineCalendarEventParticipantDTO], { nullable: true })
  participants: TimelineCalendarEventParticipantDTO[] | null;

  @Field(() => CalendarChannelVisibility)
  visibility: CalendarChannelVisibility;

  @Field({ nullable: true })
  entityColor: string | null;
}
