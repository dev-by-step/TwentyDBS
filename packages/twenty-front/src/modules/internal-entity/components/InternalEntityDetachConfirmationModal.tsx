import { ConfirmationModal } from '@/ui/layout/modal/components/ConfirmationModal';
import { Trans } from '@lingui/react/macro';
import { t } from '@lingui/core/macro';

type InternalEntityDetachConfirmationModalProps = {
  modalInstanceId: string;
  entityLabel?: string;
  onConfirmClick: () => void | Promise<void>;
  onClose?: () => void;
};

export const InternalEntityDetachConfirmationModal = ({
  modalInstanceId,
  entityLabel,
  onConfirmClick,
  onClose,
}: InternalEntityDetachConfirmationModalProps) => {
  return (
    <ConfirmationModal
      modalInstanceId={modalInstanceId}
      title={t`Remove entity`}
      subtitle={
        <Trans>
          This will only remove the link with{' '}
          {entityLabel ? <strong>{entityLabel}</strong> : 'this entity'}.
          <br />
          The Internal Entity record will be kept.
        </Trans>
      }
      onConfirmClick={onConfirmClick}
      onClose={onClose}
      confirmButtonText={t`Remove entity`}
    />
  );
};
