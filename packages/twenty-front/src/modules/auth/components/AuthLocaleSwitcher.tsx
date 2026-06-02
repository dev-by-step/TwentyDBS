import { styled } from '@linaria/react';
import { APP_LOCALES } from 'twenty-shared/translations';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { dynamicActivate } from '~/utils/i18n/dynamicActivate';
import { dateLocaleState } from '~/localization/states/dateLocaleState';
import { useAtomState } from '@/ui/utilities/state/jotai/hooks/useAtomState';
import { getDateFnsLocale } from '@/ui/field/display/utils/getDateFnsLocale';
import { enUS } from 'date-fns/locale';

type SwitchableLocale = (typeof APP_LOCALES)['en'] | (typeof APP_LOCALES)['fr-FR'];

const StyledContainer = styled.div`
  align-items: center;
  display: inline-flex;
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.pill};
  overflow: hidden;
  padding: 2px;
`;

const StyledOption = styled.button<{ active: boolean }>`
  background: ${({ active }) =>
    active
      ? themeCssVariables.background.primary
      : 'transparent'};
  border: none;
  border-radius: ${themeCssVariables.border.radius.pill};
  color: ${({ active }) =>
    active
      ? themeCssVariables.font.color.primary
      : themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-family: inherit;
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${({ active }) =>
    active
      ? themeCssVariables.font.weight.medium
      : themeCssVariables.font.weight.regular};
  padding: ${themeCssVariables.spacing[1]} ${themeCssVariables.spacing[3]};
`;

const persistLocale = (locale: SwitchableLocale) => {
  try {
    localStorage.setItem('locale', locale);
  } catch {
    // localStorage may be unavailable (Safari private mode); fail silently.
  }
};

export const AuthLocaleSwitcher = () => {
  const [dateLocale, setDateLocale] = useAtomState(dateLocaleState);
  const currentLocale: SwitchableLocale =
    dateLocale.locale === APP_LOCALES['fr-FR']
      ? APP_LOCALES['fr-FR']
      : APP_LOCALES.en;

  const switchTo = async (nextLocale: SwitchableLocale) => {
    if (nextLocale === currentLocale) {
      return;
    }

    persistLocale(nextLocale);
    await dynamicActivate(nextLocale);
    const dateFnsLocale = await getDateFnsLocale(nextLocale);

    setDateLocale({
      locale: nextLocale,
      localeCatalog: dateFnsLocale || enUS,
    });
  };

  return (
    <StyledContainer role="group" aria-label="Language">
      <StyledOption
        type="button"
        active={currentLocale === APP_LOCALES.en}
        onClick={() => switchTo(APP_LOCALES.en)}
        aria-pressed={currentLocale === APP_LOCALES.en}
      >
        EN
      </StyledOption>
      <StyledOption
        type="button"
        active={currentLocale === APP_LOCALES['fr-FR']}
        onClick={() => switchTo(APP_LOCALES['fr-FR'])}
        aria-pressed={currentLocale === APP_LOCALES['fr-FR']}
      >
        FR
      </StyledOption>
    </StyledContainer>
  );
};
