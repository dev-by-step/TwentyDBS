import { type FieldMetadataItem } from '@/object-metadata/types/FieldMetadataItem';
import { type PageLayout } from '@/page-layout/types/PageLayout';
import { type PageLayoutWidget } from '@/page-layout/types/PageLayoutWidget';
import { DYNAMIC_RELATION_WIDGET_ID_PREFIX } from '@/page-layout/utils/isDynamicRelationWidget';
import { isFieldWidget } from '@/page-layout/widgets/field/utils/isFieldWidget';
import { isDefined } from 'twenty-shared/utils';
import {
  FieldDisplayMode,
  PageLayoutTabLayoutMode,
  WidgetConfigurationType,
  WidgetType,
} from '~/generated-metadata/graphql';

const getRelationFieldWidgetToInsert = (
  field: FieldMetadataItem,
  tabId: string,
  fieldDisplayMode: FieldDisplayMode,
): PageLayoutWidget => ({
  __typename: 'PageLayoutWidget' as const,
  id: `${DYNAMIC_RELATION_WIDGET_ID_PREFIX}${field.id}-${field.label}`,
  applicationId: '',
  pageLayoutTabId: tabId,
  title: field.label,
  isActive: true,
  type: WidgetType.FIELD,
  objectMetadataId: null,
  gridPosition: {
    __typename: 'GridPosition' as const,
    row: 0,
    column: 0,
    rowSpan: 1,
    columnSpan: 12,
  },
  position: {
    __typename: 'PageLayoutWidgetGridPosition' as const,
    layoutMode: PageLayoutTabLayoutMode.GRID,
    row: 0,
    column: 0,
    rowSpan: 1,
    columnSpan: 12,
  },
  configuration: {
    __typename: 'FieldConfiguration' as const,
    configurationType: WidgetConfigurationType.FIELD,
    fieldMetadataId: field.id,
    fieldDisplayMode,
  },
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  deletedAt: null,
});

const getRelationFieldWidgetsToInsert = (
  relationFields: FieldMetadataItem[],
  tabId: string,
  getFieldDisplayMode: (
    field: FieldMetadataItem,
  ) => FieldDisplayMode | undefined,
): PageLayoutWidget[] => {
  return relationFields.map((field) =>
    getRelationFieldWidgetToInsert(
      field,
      tabId,
      getFieldDisplayMode(field) ?? FieldDisplayMode.CARD,
    ),
  );
};

export const injectRelationWidgetsIntoLayout = (
  layout: PageLayout,
  relationFieldMetadataItems: FieldMetadataItem[],
  {
    getFieldDisplayMode = () => FieldDisplayMode.CARD,
  }: {
    getFieldDisplayMode?: (
      field: FieldMetadataItem,
    ) => FieldDisplayMode | undefined;
  } = {},
): PageLayout => {
  if (relationFieldMetadataItems.length === 0) {
    return layout;
  }

  const firstTab = layout.tabs[0];
  if (!isDefined(firstTab)) {
    return layout;
  }

  const existingFieldWidgetFieldMetadataIds = new Set(
    layout.tabs
      .flatMap((tab) => tab.widgets)
      .flatMap((widget) =>
        isFieldWidget(widget) ? [widget.configuration.fieldMetadataId] : [],
      ),
  );

  const relationFieldMetadataItemsToInject = relationFieldMetadataItems.filter(
    (fieldMetadataItem) =>
      !existingFieldWidgetFieldMetadataIds.has(fieldMetadataItem.id),
  );

  if (relationFieldMetadataItemsToInject.length === 0) {
    return layout;
  }

  const relationWidgets = getRelationFieldWidgetsToInsert(
    relationFieldMetadataItemsToInject,
    firstTab.id,
    getFieldDisplayMode,
  );

  return {
    ...layout,
    tabs: layout.tabs.map((tab) => {
      if (tab.id === firstTab.id) {
        const firstFieldsWidgetIndex = tab.widgets.findIndex(
          (widget) => widget.type === WidgetType.FIELDS,
        );

        if (firstFieldsWidgetIndex === -1) {
          return {
            ...tab,
            widgets: [...tab.widgets, ...relationWidgets],
          };
        }

        // TODO: This note widget repositioning logic is temporary and will be deleted soon.
        // We need this to ensure the note editor is displayed before record relations,
        // matching the behavior of the old show page.
        const noteWidgetIndex = tab.widgets.findIndex(
          (widget) => widget.type === WidgetType.NOTES,
        );

        const widgetsBeforeRelation = tab.widgets.slice(
          0,
          firstFieldsWidgetIndex + 1,
        );
        const widgetsAfterRelation =
          noteWidgetIndex === -1
            ? tab.widgets.slice(firstFieldsWidgetIndex + 1)
            : [
                ...tab.widgets.slice(
                  firstFieldsWidgetIndex + 1,
                  noteWidgetIndex,
                ),
                ...tab.widgets.slice(noteWidgetIndex + 1),
              ];

        const noteWidget =
          noteWidgetIndex !== -1 ? [tab.widgets[noteWidgetIndex]] : [];

        return {
          ...tab,
          widgets: [
            ...widgetsBeforeRelation,
            ...relationWidgets,
            ...noteWidget,
            ...widgetsAfterRelation,
          ],
        };
      }
      return tab;
    }),
  };
};
