export type EntityFilterViewMode = 'my-company' | 'group';

export type EntitySelectorButtonProps = {
  Icon: React.ComponentType<{ size: string | number }>;
  disabled?: boolean;
  isActive: boolean;
  label: string;
  onClick: () => void;
};

export type EntitySelectorProps = {
  className?: string;
};
