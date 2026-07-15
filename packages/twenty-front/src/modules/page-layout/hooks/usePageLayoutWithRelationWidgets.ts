import { usePageLayoutRelationWidgetConfig } from '@/page-layout/hooks/usePageLayoutRelationWidgetConfig';
import { type PageLayout } from '@/page-layout/types/PageLayout';
import { injectRelationWidgetsIntoLayout } from '@/page-layout/utils/injectRelationWidgetsIntoLayout';
import { useLayoutRenderingContext } from '@/ui/layout/contexts/LayoutRenderingContext';
import { isDefined } from 'twenty-shared/utils';
import { PageLayoutType } from '~/generated-metadata/graphql';

export const usePageLayoutWithRelationWidgets = (
  basePageLayout: PageLayout | undefined,
): PageLayout | undefined => {
  const { targetRecordIdentifier, layoutType } = useLayoutRenderingContext();
  const targetObjectNameSingular =
    targetRecordIdentifier?.targetObjectNameSingular ?? '';

  const { getFieldDisplayMode, relationFieldMetadataItems } =
    usePageLayoutRelationWidgetConfig({
      objectNameSingular: targetObjectNameSingular,
    });

  if (!isDefined(basePageLayout)) {
    return undefined;
  }

  const isRecordPage = layoutType === PageLayoutType.RECORD_PAGE;

  if (!isRecordPage) {
    return basePageLayout;
  }

  return injectRelationWidgetsIntoLayout(
    basePageLayout,
    relationFieldMetadataItems,
    {
      getFieldDisplayMode,
    },
  );
};
