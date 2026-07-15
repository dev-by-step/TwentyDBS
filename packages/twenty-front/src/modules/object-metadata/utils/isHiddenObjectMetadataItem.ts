import { HIDDEN_OBJECT_METADATA_NAMES } from '@/object-metadata/constants/HiddenObjectMetadataNames';

export const isHiddenObjectMetadataItem = ({
  nameSingular,
}: {
  nameSingular: string;
}) => HIDDEN_OBJECT_METADATA_NAMES.has(nameSingular);
