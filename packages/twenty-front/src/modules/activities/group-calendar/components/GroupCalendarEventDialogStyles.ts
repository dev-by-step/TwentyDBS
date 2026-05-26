import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

export const StyledForm = styled.form`
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
`;

// Wrapper for non-input field groups (entity picker, audience) that still need a
// label + vertical layout. Plain inputs use Twenty's TextInput/Select instead.
export const StyledField = styled.label`
  color: ${themeCssVariables.font.color.secondary};
  display: flex;
  flex-direction: column;
  font-size: ${themeCssVariables.font.size.sm};
  gap: ${themeCssVariables.spacing[1]};
`;

export const StyledModalTitle = styled.h2`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.lg};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  line-height: ${themeCssVariables.text.lineHeight.md};
  margin: 0;
`;

export const StyledDeleteAction = styled.div`
  margin-right: auto;
`;
