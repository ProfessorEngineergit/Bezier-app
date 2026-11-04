/**
 * The parts library: a sheet over the model for the one moment of choosing a part. Pictures first,
 * as they are what people recognise a screw by. The foot of the sheet says what will happen and
 * holds the one thing to press: pick a part, pick a size, Add.
 */

import { fastenerLengths } from '@bezier/core';
import { CrossIcon } from '@bezier/ui';
import { useEffect, useRef, useState } from 'react';
import { NUTS_AND_WASHERS, SCREWS, type StandardPart, sizesOf, usualLength } from './catalog.js';
import type { OwnPart } from './own-parts.js';
import './parts-library.css';
import type { ServerPart } from './server-parts.js';

export interface PartsLibraryProps {
  /** A flat face is selected: a part goes there, and can bring its hole. */
  onFace: boolean;
  own: readonly OwnPart[];
  server: { address: string; parts: readonly ServerPart[]; failed: string | null };
  onClose: () => void;
  onAddStandard: (part: StandardPart, size: string, length: number, withHole: boolean) => void;
  onAddOwn: (part: OwnPart) => void;
  onAddServer: (part: ServerPart) => void;
  onImport: (files: readonly File[]) => void;
  onRemoveOwn: (part: OwnPart) => void;
  onConnect: (address: string) => void;
}

type Picked =
  | { from: 'standard'; part: StandardPart }
  | { from: 'own'; part: OwnPart }
  | { from: 'server'; part: ServerPart };

function Card({
  name,
  note,
  picture,
  picked,
  onPick,
  onAdd,
  onRemove,
}: {
  name: string;
  note?: string;
  picture: string | null;
  picked: boolean;
  onPick: () => void;
  onAdd: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="part-card" data-picked={picked ? '' : undefined}>
      <button onClick={onPick} onDoubleClick={onAdd} type="button">
        <span className="part-card__picture">
          {picture === null ? (
            <span aria-hidden="true" className="part-card__initial">
              {name.charAt(0)}
            </span>
          ) : (
            <img alt="" draggable={false} src={picture} />
          )}
        </span>
        <span className="part-card__name">{name}</span>
        {note !== undefined && <span className="part-card__note">{note}</span>}
      </button>
      {onRemove !== undefined && (
        <button
          aria-label={`Remove ${name}`}
          className="part-card__remove"
          onClick={onRemove}
          type="button"
        >
          <CrossIcon />
        </button>
      )}
    </div>
  );
}

export function PartsLibrary({
  onFace,
  own,
  server,
  onClose,
  onAddStandard,
  onAddOwn,
  onAddServer,
  onImport,
  onRemoveOwn,
  onConnect,
}: PartsLibraryProps) {
  const first = SCREWS[0] as StandardPart;
  const [picked, setPicked] = useState<Picked>({ from: 'standard', part: first });
  const [size, setSize] = useState('M5');
  const [length, setLength] = useState(usualLength(first, 'M5'));
  const [withHole, setWithHole] = useState(true);
  const [address, setAddress] = useState(server.address);
  const files = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  /** A size the part's standard does not have moves to the nearest it does. */
  const pick = (part: StandardPart) => {
    const sizes: readonly string[] = sizesOf(part);
    const fits = sizes.includes(size) ? size : (sizes[0] ?? size);
    setPicked({ from: 'standard', part });
    setSize(fits);
    setLength(usualLength(part, fits));
  };

  const add = (choice: Picked = picked) => {
    if (choice.from === 'standard') onAddStandard(choice.part, size, length, onFace && withHole);
    else if (choice.from === 'own') onAddOwn(choice.part);
    else onAddServer(choice.part);
    onClose();
  };

  const standard = (part: StandardPart) => (
    <Card
      key={part.kind}
      name={part.name}
      note={part.standard}
      onAdd={() => add({ from: 'standard', part })}
      onPick={() => pick(part)}
      picked={picked.from === 'standard' && picked.part.kind === part.kind}
      picture={part.picture}
    />
  );

  const destination = onFace ? 'On the selected face' : 'At the origin';

  return (
    <div className="parts-scrim" onPointerDown={onClose}>
      <section
        aria-label="Parts library"
        className="parts-sheet"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <header className="parts-sheet__head">
          <h2>Library</h2>
          <button aria-label="Close" className="parts-sheet__close" onClick={onClose} type="button">
            <CrossIcon />
          </button>
        </header>

        <div className="parts-sheet__scroll">
          <h3>Screws</h3>
          <div className="parts-grid">{SCREWS.map(standard)}</div>

          <h3>Nuts and washers</h3>
          <div className="parts-grid">{NUTS_AND_WASHERS.map(standard)}</div>

          <h3>Your parts</h3>
          <div className="parts-grid">
            {own.map((part) => (
              <Card
                key={part.id}
                name={part.name}
                onAdd={() => add({ from: 'own', part })}
                onPick={() => setPicked({ from: 'own', part })}
                onRemove={() => onRemoveOwn(part)}
                picked={picked.from === 'own' && picked.part.id === part.id}
                picture={part.picture}
              />
            ))}
            <div className="part-card part-card--add">
              <button onClick={() => files.current?.click()} type="button">
                <span aria-hidden="true" className="part-card__picture">
                  <span className="part-card__plus" />
                </span>
                <span className="part-card__name">Add your own</span>
                <span className="part-card__note">A STEP file and a picture</span>
              </button>
              <input
                accept=".step,.stp,.png,.jpg,.jpeg,.webp"
                aria-label="Add your own part"
                hidden
                multiple
                onChange={(event) => {
                  onImport([...(event.target.files ?? [])]);
                  event.target.value = '';
                }}
                ref={files}
                type="file"
              />
            </div>
          </div>

          <h3>From a server</h3>
          {server.parts.length > 0 && (
            <div className="parts-grid">
              {server.parts.map((part) => (
                <Card
                  key={part.model}
                  name={part.name}
                  onAdd={() => add({ from: 'server', part })}
                  onPick={() => setPicked({ from: 'server', part })}
                  picked={picked.from === 'server' && picked.part.model === part.model}
                  picture={part.picture}
                />
              ))}
            </div>
          )}
          <form
            className="parts-server"
            onSubmit={(event) => {
              event.preventDefault();
              onConnect(address);
            }}
          >
            <input
              aria-label="Parts server address"
              onChange={(event) => setAddress(event.target.value)}
              placeholder="https://parts.your-server.org"
              spellCheck={false}
              type="url"
              value={address}
            />
            <button type="submit">Connect</button>
          </form>
          {server.failed !== null && <p className="parts-server__failed">{server.failed}</p>}
        </div>

        <footer className="parts-sheet__foot">
          {picked.from === 'standard' && (
            <>
              <fieldset className="parts-sizes">
                <legend>Size</legend>
                {sizesOf(picked.part).map((name) => (
                  <label data-on={name === size ? '' : undefined} key={name}>
                    <input
                      checked={name === size}
                      name="parts-size"
                      onChange={() => {
                        if (picked.from !== 'standard') return;
                        setSize(name);
                        setLength(usualLength(picked.part, name));
                      }}
                      type="radio"
                    />
                    {name}
                  </label>
                ))}
              </fieldset>
              {picked.part.long && (
                <label className="parts-length">
                  <span>Length</span>
                  <span>
                    {length}
                    <small>mm</small>
                    <select
                      aria-label="Length"
                      onChange={(event) => setLength(Number(event.target.value))}
                      value={length}
                    >
                      {fastenerLengths(picked.part.kind, size).map((option) => (
                        <option key={option} value={option}>
                          {option} mm
                        </option>
                      ))}
                    </select>
                  </span>
                </label>
              )}
            </>
          )}
          <div className="parts-sheet__action">
            {picked.from === 'standard' && onFace ? (
              <label className="parts-hole">
                <input
                  checked={withHole}
                  onChange={(event) => setWithHole(event.target.checked)}
                  type="checkbox"
                />
                With its hole
              </label>
            ) : (
              <span className="parts-sheet__where">{destination}</span>
            )}
            <button className="parts-sheet__add" onClick={() => add()} type="button">
              Add
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
