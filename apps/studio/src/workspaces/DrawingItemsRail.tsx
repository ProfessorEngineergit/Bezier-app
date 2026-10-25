import './workspace-items-rail.css';
import { ItemsIcon, Rail, type RailGroup } from '@bezier/ui';

const GROUPS: readonly RailGroup[] = [
  { id: 'items', zone: 'top', items: [{ id: 'items', label: 'Items', icon: <ItemsIcon /> }] },
];

export function DrawingItemsRail({
  open,
  onToggle,
  label = 'Drawing items controls',
}: {
  open: boolean;
  onToggle: () => void;
  label?: string;
}) {
  return (
    <div className="dwg-items-rail" data-open={String(open)}>
      <Rail
        side="left"
        groups={GROUPS}
        activeId={open ? 'items' : null}
        onActivate={onToggle}
        ariaLabel={label}
      />
    </div>
  );
}
