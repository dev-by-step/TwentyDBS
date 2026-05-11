import { styled } from '@linaria/react';
import { t } from '@lingui/core/macro';

import { GroupCalendarEventsCard } from '@/activities/group-calendar/components/GroupCalendarEventsCard';
import { PageContainer } from '@/ui/layout/page/components/PageContainer';
import { H1Title, H1TitleFontColor } from 'twenty-ui/display';
import { themeCssVariables } from 'twenty-ui/theme-constants';

const StyledPageWrapper = styled(PageContainer)`
  height: 100%;
  overflow: hidden;
`;

const StyledHeader = styled.div`
  padding: ${themeCssVariables.spacing[6]} ${themeCssVariables.spacing[6]}
    ${themeCssVariables.spacing[4]};
`;

const StyledContent = styled.div`
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.md};
  flex: 1;
  margin: 0 ${themeCssVariables.spacing[6]} ${themeCssVariables.spacing[6]};
  overflow: hidden;
`;

export const GroupCalendarPage = () => (
  <StyledPageWrapper>
    <StyledHeader>
      <H1Title
        title={t`Calendrier Groupe`}
        fontColor={H1TitleFontColor.Primary}
      />
    </StyledHeader>
    <StyledContent>
      <GroupCalendarEventsCard />
    </StyledContent>
  </StyledPageWrapper>
);
