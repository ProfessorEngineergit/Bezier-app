/**
 * Vault members and roles, inviting (link or id), read-only links, and leaving. Removing a member
 * rotates the vault key, so later writes are sealed with a key they never had; what they already
 * have, they keep, and the page says so.
 */

import {
  createViewLink,
  listViewLinks,
  type Member,
  type Role,
  type VaultHandle,
  type ViewLink,
  withdrawViewLink,
} from '@bezier/sync';
import { useEffect, useRef, useState } from 'react';
import { Group, Row } from '../PrefsControls.js';
import { useCollab } from './CollabProvider.js';

const ROLES: readonly (readonly [Role, string])[] = [
  ['reader', 'Can view'],
  ['writer', 'Can edit'],
  ['admin', 'Admin'],
];

export function VaultPeople({
  vault,
  members,
  onChanged,
}: {
  vault: VaultHandle;
  members: readonly Member[];
  onChanged: () => void;
}) {
  const collab = useCollab();
  const collabRef = useRef(collab);
  collabRef.current = collab;
  const me = collab.identity?.userId;
  const isAdmin = vault.role === 'admin';
  const canWrite = vault.role !== 'reader';
  const [role, setRole] = useState<Role>('writer');
  const [invite, setInvite] = useState<string | null>(null);
  const [addId, setAddId] = useState('');
  const [label, setLabel] = useState('');
  const [view, setView] = useState<string | null>(null);
  const [views, setViews] = useState<readonly ViewLink[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `tick` is the trigger to read again
  useEffect(() => {
    if (!canWrite) return;
    let live = true;
    listViewLinks(collabRef.current.vaultClient().conn, vault)
      .then((v) => live && setViews(v))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [vault, canWrite, tick]);

  const act = async (action: () => Promise<unknown>) => {
    setProblem(null);
    try {
      await action();
      setTick((n) => n + 1);
      onChanged();
      await collabRef.current.refresh();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : String(error));
    }
  };
  const client = () => collabRef.current.vaultClient();
  const nameOf = (m: Member) =>
    m.userId === me ? 'You' : (m.name ?? `Someone (${m.userId.slice(0, 6)})`);

  return (
    <div className="collab-people">
      {problem !== null && (
        <p className="collab-problem" role="alert">
          {problem}
        </p>
      )}
      <Group label="People">
        {members.map((m) => (
          <Row
            key={m.userId}
            label={nameOf(m)}
            note={`Since ${new Date(m.addedAt).toLocaleDateString()}`}
          >
            <span className="collab-inline">
              <select
                aria-label={`Role of ${nameOf(m)}`}
                className="prefs-select"
                disabled={!isAdmin || m.userId === me}
                onChange={(event) =>
                  void act(() => client().share(vault, m.userId, event.target.value as Role))
                }
                value={m.role}
              >
                {ROLES.map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
              {isAdmin && m.userId !== me && (
                <button
                  className="prefs-button prefs-button--danger"
                  data-testid="remove-member"
                  onClick={() => void act(() => client().removeMember(vault, m.userId))}
                  type="button"
                >
                  Remove
                </button>
              )}
            </span>
          </Row>
        ))}
      </Group>
      {isAdmin && (
        <Group
          label="Invite"
          note="Send the link through a channel you trust. Whoever opens it can join; the server cannot read the key inside it. One use, valid for seven days."
        >
          <Row label="Invite link">
            <span className="collab-inline">
              <select
                aria-label="Invite as"
                className="prefs-select"
                onChange={(event) => setRole(event.target.value as Role)}
                value={role}
              >
                {ROLES.map(([value, text]) => (
                  <option key={value} value={value}>
                    {text}
                  </option>
                ))}
              </select>
              <button
                className="prefs-button"
                data-testid="make-invite"
                onClick={() =>
                  void act(async () => setInvite((await client().invite(vault, role)).link))
                }
                type="button"
              >
                Make link
              </button>
            </span>
          </Row>
          {invite !== null && <LinkRow link={invite} testid="invite-link" />}
          <Row
            label="Someone already on the server"
            note="Their id, from their Collaboration settings."
          >
            <span className="collab-inline">
              <input
                aria-label="Their id"
                className="prefs-select collab-field"
                onChange={(event) => setAddId(event.target.value.trim().toLowerCase())}
                placeholder="32 characters"
                value={addId}
              />
              <button
                className="prefs-button"
                disabled={!/^[0-9a-f]{32}$/.test(addId)}
                onClick={() =>
                  void act(async () => {
                    await client().share(vault, addId, role);
                    setAddId('');
                  })
                }
                type="button"
              >
                Add
              </button>
            </span>
          </Row>
        </Group>
      )}
      {canWrite && (
        <Group
          label="Read-only links"
          note="Whoever has the link can look at every project in this vault and change none. It stops working when withdrawn, after 30 days, or when the vault’s key changes."
        >
          <Row label="New link">
            <span className="collab-inline">
              <input
                aria-label="What the link is for"
                className="prefs-select collab-field"
                onChange={(event) => setLabel(event.target.value)}
                placeholder="For the client"
                value={label}
              />
              <button
                className="prefs-button"
                data-testid="make-view-link"
                disabled={label.trim() === ''}
                onClick={() =>
                  void act(async () => {
                    const made = await createViewLink(client().conn, vault, {
                      label: label.trim(),
                    });
                    setView(made.link);
                    setLabel('');
                  })
                }
                type="button"
              >
                Make link
              </button>
            </span>
          </Row>
          {view !== null && <LinkRow link={view} testid="view-link" />}
          {views.map((v) => (
            <Row
              key={v.id}
              label={v.label || 'A read-only link'}
              note={`Until ${new Date(v.expiresAt).toLocaleDateString()}`}
            >
              <button
                className="prefs-button prefs-button--danger"
                onClick={() => void act(() => withdrawViewLink(client().conn, vault, v.id))}
                type="button"
              >
                Withdraw
              </button>
            </Row>
          ))}
        </Group>
      )}
      <Group label="Leave">
        <Row label="Leave this vault" note="Someone has to invite you again to come back.">
          <button
            className="prefs-button prefs-button--danger"
            onClick={() => void act(() => client().removeMember(vault, me ?? '', false))}
            type="button"
          >
            Leave
          </button>
        </Row>
      </Group>
    </div>
  );
}

function LinkRow({ link, testid }: { link: string; testid: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Row label="Link">
      <span className="collab-inline">
        <input
          aria-label="Link"
          className="prefs-select collab-field collab-field--wide"
          data-testid={testid}
          readOnly
          value={link}
        />
        <button
          className="prefs-button"
          onClick={() => void navigator.clipboard.writeText(link).then(() => setCopied(true))}
          type="button"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </span>
    </Row>
  );
}
