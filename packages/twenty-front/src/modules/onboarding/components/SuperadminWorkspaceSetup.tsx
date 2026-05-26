import { useMutation } from '@apollo/client/react';
import { styled } from '@linaria/react';
import { useEffect, useMemo, useState } from 'react';

import { SubTitle } from '@/auth/components/SubTitle';
import { currentUserState } from '@/auth/states/currentUserState';
import { currentWorkspaceMemberState } from '@/auth/states/currentWorkspaceMemberState';
import { Title } from '@/auth/components/Title';
import { WORKSPACE_MEMBER_ENTITY_MEMBERSHIP_OBJECT_NAME } from '@/activities/group-calendar/constants/CalendarEventAudience';
import { INTERNAL_ENTITY_OBJECT_NAME_SINGULAR } from '@/internal-entity/constants/InternalEntityObjectNameSingular';
import { navigationMenuItemsSelector } from '@/navigation-menu-item/common/states/navigationMenuItemsSelector';
import { useCreateManyNavigationMenuItems } from '@/navigation-menu-item/common/hooks/useCreateManyNavigationMenuItems';
import { useDeleteManyNavigationMenuItems } from '@/navigation-menu-item/common/hooks/useDeleteManyNavigationMenuItems';
import { useUpdateManyNavigationMenuItems } from '@/navigation-menu-item/common/hooks/useUpdateManyNavigationMenuItems';
import { objectMetadataItemsSelector } from '@/object-metadata/states/objectMetadataItemsSelector';
import { type EnrichedObjectMetadataItem } from '@/object-metadata/types/EnrichedObjectMetadataItem';
import { useCreateOneRecord } from '@/object-record/hooks/useCreateOneRecord';
import { useDeleteManyRecords } from '@/object-record/hooks/useDeleteManyRecords';
import { useFindManyRecords } from '@/object-record/hooks/useFindManyRecords';
import { BASE_INTERNAL_ENTITY_SETUP } from '@/onboarding/constants/baseInternalEntitySetup';
import { COMPLETE_SUPERADMIN_WORKSPACE_SETUP } from '@/onboarding/graphql/mutations/completeSuperadminWorkspaceSetup';
import {
  ONBOARDING_SUPERADMIN_WORKSPACE_SETUP_PENDING,
  ONBOARDING_SUPERADMIN_WORKSPACE_SETUP_STATE,
} from '@/onboarding/constants/superadminWorkspaceSetupUserVarKeys';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';
import { TextInput } from '@/ui/input/components/TextInput';
import { useAtomStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomStateValue';
import { useSetAtomState } from '@/ui/utilities/state/jotai/hooks/useSetAtomState';
import { Trans, useLingui } from '@lingui/react/macro';
import { isDefined } from 'twenty-shared/utils';
import { Checkbox, LightIconButton, MainButton } from 'twenty-ui/input';
import { ModalContent } from 'twenty-ui/layout';
import { H2Title, IconArrowDown, IconArrowUp } from 'twenty-ui/display';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import {
  type NavigationMenuItem,
  NavigationMenuItemType,
} from '~/generated-metadata/graphql';

type InternalEntityRecord = {
  __typename: string;
  id: string;
  name: string;
  color?: string | null;
};

type WorkspaceMemberEntityMembershipRecord = {
  __typename: string;
  id: string;
  workspaceMemberId: string;
  internalEntityId: string;
};

type SavedEntityState = {
  id?: string;
  name?: string;
  website?: string | null;
  headcount?: number | null;
  isMember?: boolean;
};

type SavedSetupState = {
  entities?: SavedEntityState[];
  selectedObjectMetadataIds?: string[];
};

type EntityDraft = {
  id?: string;
  name: string;
  website: string;
  headcount: string;
  isMember: boolean;
};

type ModuleOption = {
  objectMetadataId: string;
  nameSingular: string;
  label: string;
};

const STARTUP_MODULE_PRIORITY = [
  'workspaceMember',
  'person',
  'company',
  'opportunity',
  'task',
  'note',
  'project',
  'calendarEvent',
  'messageThread',
  'workflow',
] as const;

const StyledContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[8]};
  overflow-y: auto;
  padding: ${themeCssVariables.spacing[8]} 0;
  width: 100%;
`;

const StyledSection = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
`;

const StyledEntityCard = styled.div`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[4]};
  padding: ${themeCssVariables.spacing[4]};
`;

const StyledEntityHeader = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  justify-content: space-between;
`;

const StyledEntityName = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.md};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledCheckboxRow = styled.label`
  align-items: center;
  cursor: pointer;
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
`;

const StyledCheckboxLabel = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const StyledTwoColumns = styled.div`
  display: grid;
  gap: ${themeCssVariables.spacing[3]};
  grid-template-columns: repeat(2, minmax(0, 1fr));

  @media (max-width: 768px) {
    grid-template-columns: minmax(0, 1fr);
  }
`;

const StyledModuleList = styled.div`
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const StyledModuleRow = styled.div`
  align-items: center;
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[3]} ${themeCssVariables.spacing[4]};

  &:last-child {
    border-bottom: none;
  }
`;

const StyledModuleOrderList = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledModuleOrderRow = styled.div`
  align-items: center;
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  justify-content: space-between;
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledModuleOrderActions = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledActionRow = styled.div`
  display: flex;
  gap: ${themeCssVariables.spacing[3]};
  justify-content: space-between;
`;

const StyledPrimaryAction = styled.div`
  width: 220px;
`;

const StyledHint = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const parseSavedSetupState = (value: unknown): SavedSetupState | null => {
  if (!isRecord(value)) {
    return null;
  }

  return {
    entities: Array.isArray(value.entities)
      ? value.entities.filter(isRecord).map((entity) => ({
          id: typeof entity.id === 'string' ? entity.id : undefined,
          name: typeof entity.name === 'string' ? entity.name : undefined,
          website: typeof entity.website === 'string' ? entity.website : null,
          headcount:
            typeof entity.headcount === 'number' ? entity.headcount : null,
          isMember: entity.isMember === true,
        }))
      : undefined,
    selectedObjectMetadataIds: Array.isArray(value.selectedObjectMetadataIds)
      ? value.selectedObjectMetadataIds.filter(
          (objectMetadataId): objectMetadataId is string =>
            typeof objectMetadataId === 'string',
        )
      : undefined,
  };
};

const resolveModuleOptions = (
  objectMetadataItems: EnrichedObjectMetadataItem[],
): ModuleOption[] => {
  const objectMetadataByName = new Map(
    objectMetadataItems.map((objectMetadataItem) => [
      objectMetadataItem.nameSingular,
      objectMetadataItem,
    ]),
  );

  return STARTUP_MODULE_PRIORITY.flatMap((objectName) => {
    const objectMetadataItem = objectMetadataByName.get(objectName);

    if (!isDefined(objectMetadataItem)) {
      return [];
    }

    return [
      {
        objectMetadataId: objectMetadataItem.id,
        nameSingular: objectMetadataItem.nameSingular,
        label:
          objectMetadataItem.nameSingular === 'workspaceMember'
            ? 'Team'
            : objectMetadataItem.labelPlural,
      },
    ];
  });
};

export const SuperadminWorkspaceSetup = () => {
  const { t } = useLingui();
  const { enqueueErrorSnackBar, enqueueSuccessSnackBar } = useSnackBar();
  const currentUser = useAtomStateValue(currentUserState);
  const currentWorkspaceMember = useAtomStateValue(currentWorkspaceMemberState);
  const objectMetadataItems = useAtomStateValue(objectMetadataItemsSelector);
  const navigationMenuItems = useAtomStateValue(navigationMenuItemsSelector);
  const setCurrentUser = useSetAtomState(currentUserState);
  const { createManyNavigationMenuItems } = useCreateManyNavigationMenuItems();
  const { updateManyNavigationMenuItems } = useUpdateManyNavigationMenuItems();
  const { deleteManyNavigationMenuItems } = useDeleteManyNavigationMenuItems();
  const { createOneRecord: createInternalEntity } =
    useCreateOneRecord<InternalEntityRecord>({
      objectNameSingular: INTERNAL_ENTITY_OBJECT_NAME_SINGULAR,
      recordGqlFields: { id: true, name: true, color: true },
    });
  const { createOneRecord: createWorkspaceMemberEntityMembership } =
    useCreateOneRecord<WorkspaceMemberEntityMembershipRecord>({
      objectNameSingular: WORKSPACE_MEMBER_ENTITY_MEMBERSHIP_OBJECT_NAME,
      recordGqlFields: {
        id: true,
        workspaceMemberId: true,
        internalEntityId: true,
      },
    });
  const { deleteManyRecords: deleteWorkspaceMemberEntityMemberships } =
    useDeleteManyRecords({
      objectNameSingular: WORKSPACE_MEMBER_ENTITY_MEMBERSHIP_OBJECT_NAME,
    });
  const [completeSuperadminWorkspaceSetupMutation] = useMutation(
    COMPLETE_SUPERADMIN_WORKSPACE_SETUP,
  );

  const savedSetupState = useMemo(
    () =>
      parseSavedSetupState(
        currentUser?.userVars?.[ONBOARDING_SUPERADMIN_WORKSPACE_SETUP_STATE],
      ),
    [currentUser?.userVars],
  );

  const moduleOptions = useMemo(
    () => resolveModuleOptions(objectMetadataItems),
    [objectMetadataItems],
  );

  const { records: internalEntities = [], loading: isInternalEntitiesLoading } =
    useFindManyRecords<InternalEntityRecord>({
      objectNameSingular: INTERNAL_ENTITY_OBJECT_NAME_SINGULAR,
      recordGqlFields: { id: true, name: true, color: true },
      limit: 100,
    });

  const { records: memberships = [], loading: isMembershipsLoading } =
    useFindManyRecords<WorkspaceMemberEntityMembershipRecord>({
      objectNameSingular: WORKSPACE_MEMBER_ENTITY_MEMBERSHIP_OBJECT_NAME,
      recordGqlFields: {
        id: true,
        workspaceMemberId: true,
        internalEntityId: true,
      },
      filter: {
        workspaceMemberId: { eq: currentWorkspaceMember?.id ?? '' },
      },
      limit: 100,
      skip: !isDefined(currentWorkspaceMember),
    });

  const [entityDrafts, setEntityDrafts] = useState<EntityDraft[]>([]);
  const [selectedModuleIds, setSelectedModuleIds] = useState<string[]>([]);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (
      isInitialized ||
      isInternalEntitiesLoading ||
      isMembershipsLoading ||
      !isDefined(currentWorkspaceMember)
    ) {
      return;
    }

    const membershipEntityIds = new Set(
      memberships.map((membership) => membership.internalEntityId),
    );
    const savedEntities = savedSetupState?.entities ?? [];
    const baseDrafts = BASE_INTERNAL_ENTITY_SETUP.map((baseEntity) => {
      const existingEntity = internalEntities.find(
        (internalEntity) => internalEntity.name === baseEntity.name,
      );
      const savedEntity =
        savedEntities.find((saved) => saved.id === existingEntity?.id) ??
        savedEntities.find((saved) => saved.name === baseEntity.name);

      return {
        id: existingEntity?.id,
        name: baseEntity.name,
        website: savedEntity?.website ?? '',
        headcount:
          typeof savedEntity?.headcount === 'number'
            ? String(savedEntity.headcount)
            : '',
        isMember:
          savedEntity?.isMember ??
          membershipEntityIds.has(existingEntity?.id ?? ''),
      } satisfies EntityDraft;
    });

    const persistedSelection = (
      savedSetupState?.selectedObjectMetadataIds ?? []
    ).filter((objectMetadataId) =>
      moduleOptions.some(
        (moduleOption) => moduleOption.objectMetadataId === objectMetadataId,
      ),
    );

    const existingWorkspaceModuleIds = moduleOptions
      .filter((moduleOption) =>
        navigationMenuItems.some(
          (navigationMenuItem) =>
            navigationMenuItem.type === NavigationMenuItemType.OBJECT &&
            navigationMenuItem.userWorkspaceId == null &&
            navigationMenuItem.targetObjectMetadataId ===
              moduleOption.objectMetadataId,
        ),
      )
      .map((moduleOption) => moduleOption.objectMetadataId);

    setEntityDrafts(baseDrafts);
    setSelectedModuleIds(
      persistedSelection.length > 0
        ? persistedSelection
        : existingWorkspaceModuleIds,
    );
    setIsInitialized(true);
  }, [
    currentWorkspaceMember,
    internalEntities,
    isInitialized,
    isInternalEntitiesLoading,
    isMembershipsLoading,
    memberships,
    moduleOptions,
    navigationMenuItems,
    savedSetupState,
  ]);

  const moduleOptionsById = useMemo(
    () =>
      new Map(
        moduleOptions.map((moduleOption) => [
          moduleOption.objectMetadataId,
          moduleOption,
        ]),
      ),
    [moduleOptions],
  );

  const selectedModuleOptions = selectedModuleIds
    .map((selectedModuleId) => moduleOptionsById.get(selectedModuleId))
    .filter(isDefined);

  const canSubmit =
    entityDrafts.some((entityDraft) => entityDraft.isMember) && !isSaving;

  const updateEntityDraft = (
    entityName: string,
    patch: Partial<EntityDraft>,
  ) => {
    setEntityDrafts((currentDrafts) =>
      currentDrafts.map((entityDraft) =>
        entityDraft.name === entityName
          ? { ...entityDraft, ...patch }
          : entityDraft,
      ),
    );
  };

  const toggleModuleSelection = (
    objectMetadataId: string,
    checked: boolean,
  ) => {
    setSelectedModuleIds((currentSelectedModuleIds) => {
      if (checked) {
        if (currentSelectedModuleIds.includes(objectMetadataId)) {
          return currentSelectedModuleIds;
        }

        return [...currentSelectedModuleIds, objectMetadataId];
      }

      return currentSelectedModuleIds.filter(
        (selectedModuleId) => selectedModuleId !== objectMetadataId,
      );
    });
  };

  const moveSelectedModule = (objectMetadataId: string, direction: -1 | 1) => {
    setSelectedModuleIds((currentSelectedModuleIds) => {
      const currentIndex = currentSelectedModuleIds.indexOf(objectMetadataId);

      if (currentIndex < 0) {
        return currentSelectedModuleIds;
      }

      const nextIndex = currentIndex + direction;

      if (nextIndex < 0 || nextIndex >= currentSelectedModuleIds.length) {
        return currentSelectedModuleIds;
      }

      const reorderedModuleIds = [...currentSelectedModuleIds];
      const [movedModuleId] = reorderedModuleIds.splice(currentIndex, 1);

      reorderedModuleIds.splice(nextIndex, 0, movedModuleId);

      return reorderedModuleIds;
    });
  };

  const syncWorkspaceNavigationMenu = async (
    nextSelectedModuleIds: string[],
  ) => {
    const selectedModuleIdSet = new Set(nextSelectedModuleIds);
    const supportedModuleIdSet = new Set(
      moduleOptions.map((moduleOption) => moduleOption.objectMetadataId),
    );
    const workspaceLevelItems = navigationMenuItems.filter(
      (navigationMenuItem) => navigationMenuItem.userWorkspaceId == null,
    );
    const supportedWorkspaceItems = workspaceLevelItems.filter(
      (navigationMenuItem) =>
        navigationMenuItem.type === NavigationMenuItemType.OBJECT &&
        isDefined(navigationMenuItem.targetObjectMetadataId) &&
        supportedModuleIdSet.has(navigationMenuItem.targetObjectMetadataId),
    );

    const itemsByObjectMetadataId = new Map<string, NavigationMenuItem[]>();

    for (const navigationMenuItem of supportedWorkspaceItems) {
      const objectMetadataId = navigationMenuItem.targetObjectMetadataId;

      if (!isDefined(objectMetadataId)) {
        continue;
      }

      const existingItems = itemsByObjectMetadataId.get(objectMetadataId) ?? [];

      existingItems.push(navigationMenuItem);
      itemsByObjectMetadataId.set(objectMetadataId, existingItems);
    }

    const navigationMenuItemIdsToDelete = supportedWorkspaceItems
      .filter((navigationMenuItem) => {
        const objectMetadataId = navigationMenuItem.targetObjectMetadataId;

        if (!isDefined(objectMetadataId)) {
          return false;
        }

        const itemsForObject =
          itemsByObjectMetadataId.get(objectMetadataId) ?? [];
        const duplicateItems = itemsForObject.slice(1).map((item) => item.id);

        return (
          !selectedModuleIdSet.has(objectMetadataId) ||
          duplicateItems.includes(navigationMenuItem.id)
        );
      })
      .map((navigationMenuItem) => navigationMenuItem.id);

    if (navigationMenuItemIdsToDelete.length > 0) {
      await deleteManyNavigationMenuItems(navigationMenuItemIdsToDelete);
    }

    const survivingItems = supportedWorkspaceItems.filter(
      (navigationMenuItem) =>
        !navigationMenuItemIdsToDelete.includes(navigationMenuItem.id),
    );
    const basePosition =
      survivingItems.length > 0
        ? Math.min(
            ...survivingItems.map(
              (navigationMenuItem) => navigationMenuItem.position,
            ),
          )
        : workspaceLevelItems.length > 0
          ? Math.max(
              ...workspaceLevelItems.map(
                (navigationMenuItem) => navigationMenuItem.position,
              ),
            ) + 1
          : 0;

    const workspaceItemByObjectMetadataId = new Map(
      survivingItems
        .filter(
          (
            navigationMenuItem,
          ): navigationMenuItem is NavigationMenuItem & {
            targetObjectMetadataId: string;
          } => isDefined(navigationMenuItem.targetObjectMetadataId),
        )
        .map((navigationMenuItem) => [
          navigationMenuItem.targetObjectMetadataId,
          navigationMenuItem,
        ]),
    );

    const navigationMenuItemsToCreate = nextSelectedModuleIds
      .filter(
        (objectMetadataId) =>
          !workspaceItemByObjectMetadataId.has(objectMetadataId),
      )
      .map((objectMetadataId, index) => ({
        type: NavigationMenuItemType.OBJECT,
        targetObjectMetadataId: objectMetadataId,
        position: basePosition + index,
      }));

    if (navigationMenuItemsToCreate.length > 0) {
      await createManyNavigationMenuItems(navigationMenuItemsToCreate);
    }

    const navigationMenuItemsToUpdate = nextSelectedModuleIds.flatMap(
      (objectMetadataId, index) => {
        const existingNavigationMenuItem =
          workspaceItemByObjectMetadataId.get(objectMetadataId);

        if (
          !isDefined(existingNavigationMenuItem) ||
          existingNavigationMenuItem.position === basePosition + index
        ) {
          return [];
        }

        return [
          {
            id: existingNavigationMenuItem.id,
            update: {
              position: basePosition + index,
            },
          },
        ];
      },
    );

    if (navigationMenuItemsToUpdate.length > 0) {
      await updateManyNavigationMenuItems(navigationMenuItemsToUpdate);
    }
  };

  const handleSubmit = async () => {
    if (!isDefined(currentWorkspaceMember)) {
      enqueueErrorSnackBar({ message: t`Workspace member not loaded yet.` });

      return;
    }

    const normalizedDrafts = entityDrafts
      .map((entityDraft) => ({
        ...entityDraft,
        website: entityDraft.website.trim(),
        headcount: entityDraft.headcount.trim(),
      }))
      .filter((entityDraft) =>
        BASE_INTERNAL_ENTITY_SETUP.some(
          (baseEntity) => baseEntity.name === entityDraft.name,
        ),
      );

    if (normalizedDrafts.length === 0) {
      enqueueErrorSnackBar({
        message: t`No base internal entity is available for setup.`,
      });

      return;
    }

    if (!normalizedDrafts.some((entityDraft) => entityDraft.isMember)) {
      enqueueErrorSnackBar({
        message: t`Select at least one entity you belong to.`,
      });

      return;
    }

    setIsSaving(true);

    try {
      const createdEntities = await Promise.all(
        normalizedDrafts
          .filter((entityDraft) => !isDefined(entityDraft.id))
          .map(async (entityDraft) => ({
            name: entityDraft.name,
            record: await createInternalEntity({
              id: BASE_INTERNAL_ENTITY_SETUP.find(
                (b) => b.name === entityDraft.name,
              )?.id,
              name: entityDraft.name,
            }),
          })),
      );

      const createdEntityByName = new Map(
        createdEntities.map((createdEntity) => [
          createdEntity.name,
          createdEntity.record,
        ]),
      );

      const persistedEntityState = normalizedDrafts.map((entityDraft) => {
        const persistedId =
          entityDraft.id ?? createdEntityByName.get(entityDraft.name)?.id;

        if (!isDefined(persistedId)) {
          throw new Error(
            `Missing persisted entity id for ${entityDraft.name}`,
          );
        }

        return {
          id: persistedId,
          name: entityDraft.name,
          website: entityDraft.website || null,
          headcount:
            entityDraft.headcount.length > 0
              ? Number.parseInt(entityDraft.headcount, 10)
              : null,
          isMember: entityDraft.isMember,
        };
      });

      const desiredMembershipEntityIds = new Set(
        persistedEntityState
          .filter((entityState) => entityState.isMember)
          .map((entityState) => entityState.id),
      );

      const existingMembershipByEntityId = new Map(
        memberships.map((membership) => [
          membership.internalEntityId,
          membership,
        ]),
      );

      await Promise.all(
        persistedEntityState
          .filter(
            (entityState) =>
              entityState.isMember &&
              !existingMembershipByEntityId.has(entityState.id),
          )
          .map((entityState) =>
            createWorkspaceMemberEntityMembership({
              workspaceMemberId: currentWorkspaceMember.id,
              internalEntityId: entityState.id,
            }),
          ),
      );

      const membershipIdsToDelete = memberships
        .filter(
          (membership) =>
            !desiredMembershipEntityIds.has(membership.internalEntityId),
        )
        .map((membership) => membership.id);

      if (membershipIdsToDelete.length > 0) {
        await deleteWorkspaceMemberEntityMemberships({
          recordIdsToDelete: membershipIdsToDelete,
        });
      }

      await syncWorkspaceNavigationMenu(selectedModuleIds);

      await completeSuperadminWorkspaceSetupMutation({
        variables: {
          input: {
            entities: persistedEntityState,
            selectedObjectMetadataIds: selectedModuleIds,
          },
        },
      });

      setCurrentUser((currentValue) => {
        if (!isDefined(currentValue)) {
          return currentValue;
        }

        return {
          ...currentValue,
          userVars: {
            ...currentValue.userVars,
            [ONBOARDING_SUPERADMIN_WORKSPACE_SETUP_PENDING]: false,
            [ONBOARDING_SUPERADMIN_WORKSPACE_SETUP_STATE]: {
              entities: persistedEntityState,
              selectedObjectMetadataIds: selectedModuleIds,
            },
          },
        };
      });

      enqueueSuccessSnackBar({
        message: t`Workspace setup saved.`,
      });
    } catch (error) {
      enqueueErrorSnackBar({
        message:
          error instanceof Error
            ? error.message
            : t`Failed to save workspace setup.`,
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isInitialized) {
    return (
      <ModalContent isVerticallyCentered isHorizontallyCentered>
        <Title>
          <Trans>Set up your workspace</Trans>
        </Title>
        <SubTitle>
          <Trans>Loading your internal entities and workspace modules.</Trans>
        </SubTitle>
      </ModalContent>
    );
  }

  return (
    <ModalContent isVerticallyCentered isHorizontallyCentered>
      <Title>
        <Trans>Set up your workspace</Trans>
      </Title>
      <SubTitle>
        <Trans>
          Select the entity or entities you belong to and the startup modules to
          expose in the workplace.
        </Trans>
      </SubTitle>
      <StyledContent>
        <StyledSection>
          <H2Title
            title={t`Internal entities`}
            description={t`Review the four base entities, fill in their details, and select the ones you actually belong to.`}
          />
          {entityDrafts.map((entityDraft) => (
            <StyledEntityCard key={entityDraft.name}>
              <StyledEntityHeader>
                <StyledEntityName>{entityDraft.name}</StyledEntityName>
              </StyledEntityHeader>
              <StyledCheckboxRow>
                <Checkbox
                  checked={entityDraft.isMember}
                  onChange={(event) =>
                    updateEntityDraft(entityDraft.name, {
                      isMember: event.target.checked,
                    })
                  }
                  aria-label={t`I belong to this entity`}
                />
                <StyledCheckboxLabel>
                  <Trans>I belong to this entity</Trans>
                </StyledCheckboxLabel>
              </StyledCheckboxRow>
              <StyledTwoColumns>
                <TextInput
                  label={t`Website`}
                  value={entityDraft.website}
                  onChange={(nextValue) =>
                    updateEntityDraft(entityDraft.name, {
                      website: nextValue,
                    })
                  }
                  placeholder={t`https://example.com`}
                  fullWidth
                />
              </StyledTwoColumns>
              <TextInput
                label={t`Team size`}
                value={entityDraft.headcount}
                type="number"
                onChange={(nextValue) =>
                  updateEntityDraft(entityDraft.name, {
                    headcount: nextValue,
                  })
                }
                placeholder={t`25`}
                fullWidth
              />
            </StyledEntityCard>
          ))}
        </StyledSection>

        <StyledSection>
          <H2Title
            title={t`Workspace modules`}
            description={t`Pick the startup modules to keep visible in the workplace.`}
          />
          <StyledModuleList>
            {moduleOptions.map((moduleOption) => (
              <StyledModuleRow key={moduleOption.objectMetadataId}>
                <StyledCheckboxRow>
                  <Checkbox
                    checked={selectedModuleIds.includes(
                      moduleOption.objectMetadataId,
                    )}
                    onChange={(event) =>
                      toggleModuleSelection(
                        moduleOption.objectMetadataId,
                        event.target.checked,
                      )
                    }
                    aria-label={moduleOption.label}
                  />
                  <StyledCheckboxLabel>
                    {moduleOption.label}
                  </StyledCheckboxLabel>
                </StyledCheckboxRow>
              </StyledModuleRow>
            ))}
          </StyledModuleList>
          <StyledHint>
            <Trans>
              The checked modules become workspace-level navigation items.
            </Trans>
          </StyledHint>
        </StyledSection>

        {selectedModuleOptions.length > 0 && (
          <StyledSection>
            <H2Title
              title={t`Menu order`}
              description={t`Adjust the order of the selected modules in the workspace menu.`}
            />
            <StyledModuleOrderList>
              {selectedModuleOptions.map((moduleOption, index) => (
                <StyledModuleOrderRow key={moduleOption.objectMetadataId}>
                  <StyledCheckboxLabel>
                    {moduleOption.label}
                  </StyledCheckboxLabel>
                  <StyledModuleOrderActions>
                    <LightIconButton
                      title={t`Move up`}
                      Icon={IconArrowUp}
                      accent="tertiary"
                      disabled={index === 0}
                      onClick={() =>
                        moveSelectedModule(moduleOption.objectMetadataId, -1)
                      }
                    />
                    <LightIconButton
                      title={t`Move down`}
                      Icon={IconArrowDown}
                      accent="tertiary"
                      disabled={index === selectedModuleOptions.length - 1}
                      onClick={() =>
                        moveSelectedModule(moduleOption.objectMetadataId, 1)
                      }
                    />
                  </StyledModuleOrderActions>
                </StyledModuleOrderRow>
              ))}
            </StyledModuleOrderList>
          </StyledSection>
        )}
      </StyledContent>
      <StyledActionRow>
        <StyledHint>
          <Trans>
            Once this step is saved, onboarding continues with team invites.
          </Trans>
        </StyledHint>
        <StyledPrimaryAction>
          <MainButton
            title={t`Continue`}
            onClick={handleSubmit}
            disabled={!canSubmit}
            fullWidth
          />
        </StyledPrimaryAction>
      </StyledActionRow>
    </ModalContent>
  );
};
