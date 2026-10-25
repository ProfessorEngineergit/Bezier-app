/**
 * What a folder opens into while a project is dragged over it: its first few projects plus an
 * empty slot where the dragged one will go. The dragged card settles into the slot
 * (`card-drag.ts` finds it by `data-landing`), so dropping only confirms what is shown.
 *
 * Over the folder the project is already in, the card settles onto its own thumbnail instead.
 */

import { PartIcon } from '@bezier/ui';

export interface TrayItem {
  id: string;
  /** Thumbnail object URL, if any. */
  thumbnail?: string;
}

/** How many of a folder's projects are shown inside it. */
export const TRAY_SHOWN = 3;

export function FolderDropTray({
  items,
  count,
  carried,
  arriving,
  here,
}: {
  /** The first projects in the folder, newest first. */
  items: readonly TrayItem[];
  count: number;
  /** The project being dragged, if any. */
  carried: string | undefined;
  /** The project just dropped into this folder, shown in the slot the dragged card fills. */
  arriving: TrayItem | undefined;
  /** The dragged project is already in this folder. */
  here: boolean;
}) {
  const more = count - items.length;
  return (
    <div aria-hidden="true" className="library-folder__well">
      <div className="library-folder__tray" data-here={here ? '' : undefined}>
        {!here && (
          <span
            className="library-folder__slot"
            data-filled={arriving === undefined ? undefined : ''}
            data-landing=""
          >
            {arriving !== undefined && <Picture item={arriving} />}
          </span>
        )}
        {items
          .filter((item) => item.id !== arriving?.id)
          .map((item) => (
            <span
              className="library-folder__mini"
              // Already here: the card settles onto its own thumbnail.
              data-landing={here && item.id === carried ? '' : undefined}
              key={item.id}
            >
              <Picture item={item} />
            </span>
          ))}
        <small>
          {here ? 'Already in this folder' : count === 0 ? 'Empty' : more > 0 ? `+${more}` : ''}
        </small>
      </div>
    </div>
  );
}

function Picture({ item }: { item: TrayItem }) {
  return item.thumbnail === undefined ? (
    <PartIcon />
  ) : (
    <img alt="" draggable={false} src={item.thumbnail} />
  );
}
