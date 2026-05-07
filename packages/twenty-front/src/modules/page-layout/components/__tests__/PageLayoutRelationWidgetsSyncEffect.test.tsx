import { isLayoutCustomizationModeEnabledState } from '@/layout-customization/states/isLayoutCustomizationModeEnabledState';
import { useBasePageLayout } from '@/page-layout/hooks/useBasePageLayout';
import { usePageLayoutRelationWidgetConfig } from '@/page-layout/hooks/usePageLayoutRelationWidgetConfig';
import { pageLayoutDraftComponentState } from '@/page-layout/states/pageLayoutDraftComponentState';
import { pageLayoutIsInitializedComponentState } from '@/page-layout/states/pageLayoutIsInitializedComponentState';
import { pageLayoutPersistedComponentState } from '@/page-layout/states/pageLayoutPersistedComponentState';
import { PageLayoutComponentInstanceContext } from '@/page-layout/states/contexts/PageLayoutComponentInstanceContext';
import { PageLayoutRelationWidgetsSyncEffect } from '@/page-layout/components/PageLayoutRelationWidgetsSyncEffect';
import { LayoutRenderingProvider } from '@/ui/layout/contexts/LayoutRenderingContext';
import { render, waitFor } from '@testing-library/react';
import { createStore, Provider as JotaiProvider } from 'jotai';
import { type ReactNode } from 'react';
import {
  FieldDisplayMode,
  PageLayoutTabLayoutMode,
  PageLayoutType,
  WidgetConfigurationType,
  WidgetType,
} from '~/generated-metadata/graphql';
import type { FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import type { PageLayout } from '@/page-layout/types/PageLayout';

jest.mock('@/page-layout/hooks/useBasePageLayout');
jest.mock('@/page-layout/hooks/usePageLayoutRelationWidgetConfig');

const PAGE_LAYOUT_ID = '20202020-f244-4ae0-906b-78958aa07642';

const baseLayout: PageLayout = {
  __typename: 'PageLayout',
  id: PAGE_LAYOUT_ID,
  name: 'Company Record Layout',
  type: PageLayoutType.RECORD_PAGE,
  objectMetadataId: 'company-object-id',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  deletedAt: null,
  defaultTabToFocusOnMobileAndSidePanelId: null,
  tabs: [
    {
      __typename: 'PageLayoutTab',
      applicationId: '',
      id: 'tab-1',
      title: 'Fields',
      isActive: true,
      icon: 'IconList',
      position: 0,
      layoutMode: PageLayoutTabLayoutMode.VERTICAL_LIST,
      pageLayoutId: PAGE_LAYOUT_ID,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
      deletedAt: null,
      widgets: [
        {
          __typename: 'PageLayoutWidget',
          id: 'widget-fields',
          applicationId: '',
          pageLayoutTabId: 'tab-1',
          title: 'Fields',
          isActive: true,
          type: WidgetType.FIELDS,
          objectMetadataId: null,
          gridPosition: {
            __typename: 'GridPosition',
            row: 0,
            column: 0,
            rowSpan: 1,
            columnSpan: 12,
          },
          position: {
            __typename: 'PageLayoutWidgetGridPosition',
            layoutMode: PageLayoutTabLayoutMode.GRID,
            row: 0,
            column: 0,
            rowSpan: 1,
            columnSpan: 12,
          },
          configuration: {
            __typename: 'FieldsConfiguration',
            configurationType: WidgetConfigurationType.FIELDS,
            viewId: null,
          },
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          deletedAt: null,
        },
      ],
    },
  ],
};

const internalEntitiesFieldMetadataItem = {
  id: 'field-internal-entities',
  universalIdentifier: 'field-internal-entities',
  label: 'Internal Entities',
  name: 'internalEntities',
  type: 'RELATION',
  isNullable: true,
  isActive: true,
  isSystem: false,
  isCustom: false,
  defaultValue: null,
  options: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  fromRelationMetadata: null,
  toRelationMetadata: null,
  relationDefinition: null,
  settings: {
    junctionTargetFieldId: 'junction-target-field-id',
  },
} as FieldMetadataItem;

const getWrapper =
  (store = createStore()) =>
  ({ children }: { children: ReactNode }) => (
    <JotaiProvider store={store}>
      <PageLayoutComponentInstanceContext.Provider
        value={{ instanceId: PAGE_LAYOUT_ID }}
      >
        <LayoutRenderingProvider
          value={{
            isInSidePanel: false,
            layoutType: PageLayoutType.RECORD_PAGE,
            targetRecordIdentifier: {
              id: 'record-id',
              targetObjectNameSingular: 'company',
            },
          }}
        >
          {children}
        </LayoutRenderingProvider>
      </PageLayoutComponentInstanceContext.Provider>
    </JotaiProvider>
  );

describe('PageLayoutRelationWidgetsSyncEffect', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (useBasePageLayout as jest.Mock).mockReturnValue(baseLayout);
    (usePageLayoutRelationWidgetConfig as jest.Mock).mockReturnValue({
      relationFieldMetadataItems: [internalEntitiesFieldMetadataItem],
      getFieldDisplayMode: () => FieldDisplayMode.FIELD,
    });
  });

  it('should sync internal entity relation widgets into persisted record layouts', async () => {
    const store = createStore();
    const wrapper = getWrapper(store);

    store.set(isLayoutCustomizationModeEnabledState.atom, false);
    store.set(
      pageLayoutIsInitializedComponentState.atomFamily({
        instanceId: PAGE_LAYOUT_ID,
      }),
      true,
    );
    store.set(
      pageLayoutDraftComponentState.atomFamily({
        instanceId: PAGE_LAYOUT_ID,
      }),
      {
        id: PAGE_LAYOUT_ID,
        name: 'Company Record Layout',
        type: PageLayoutType.RECORD_PAGE,
        objectMetadataId: 'company-object-id',
        tabs: baseLayout.tabs,
        defaultTabToFocusOnMobileAndSidePanelId: null,
      },
    );

    render(
      <PageLayoutRelationWidgetsSyncEffect pageLayoutId={PAGE_LAYOUT_ID} />,
      {
        wrapper,
      },
    );

    await waitFor(() => {
      const persistedLayout = store.get(
        pageLayoutPersistedComponentState.atomFamily({
          instanceId: PAGE_LAYOUT_ID,
        }),
      );

      expect(persistedLayout?.tabs[0]?.widgets).toHaveLength(2);
      expect(persistedLayout?.tabs[0]?.widgets[1]?.configuration).toEqual(
        expect.objectContaining({
          fieldMetadataId: internalEntitiesFieldMetadataItem.id,
          fieldDisplayMode: FieldDisplayMode.FIELD,
        }),
      );
    });
  });
});
