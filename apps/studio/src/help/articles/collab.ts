import { define } from '../define.js';

export const COLLAB = [
  define({
    id: 'collaboration',
    gate: 'alpha',
    title: 'Work on one model together',
    area: 'Learn and Community',
    summary: 'Share a project through a server you run, and work in it at the same time as others.',
    keywords:
      'collaboration share team together live sync server vault invite multiuser realtime simultaneous coworker',
    body: `Several people open the same project and see each other's changes as they are made, the way a shared document works. Everyone keeps a full copy on their own machine, so you can keep working without a connection.

Bezier runs no server for you. You run one, or someone gives you access to theirs. What it stores is encrypted before it leaves your machine, so it cannot read your models.

## Turn it on

1. Open Settings, Collaboration, and switch it on.
2. Connect to a server. Choose one of three ways: create an account with the server's address and its enrollment code, join with an invite link, or restore an account from a backup file.
3. Type your name and this machine's name. Others see both, so "Alice on Workshop PC" tells them where you are.

![](image:settings)

Back up your identity once you are connected. It is a file with a passphrase; without it, no one can give you back access to what was shared with you.

## Share a project

1. On the start page, open the menu of a project and choose **Share**.
2. Choose where it goes: on its own, or into a vault you already have. A vault is a group of shared projects with the same people.
3. Press Share. Then invite people: make an invite link and send it, or add someone who is already on the server by their id.

![](image:share)

Each person can **view**, **edit** or **administer** the vault. A read-only link lets someone look without an account.

## Work in it together

A shared project is in everyone's list of projects, marked Shared. Open it like any other. At the top of the model a small bar says **Live** and names who else is in the project, and on which machine.

![](image:live)

Two people changing different things both keep their changes. If both change the very same thing at once, the later change wins. Without a connection, the bar says Offline and your changes wait on your machine until it is back.

## When you do not like a change

Press the bar. It lists the latest changes with who made them.

- **Go back to before** sets the model to how it was before that change. That is a change of your own, so everyone sees it, and Undo brings it back.
- **Branch from before** starts a project of its own from that point, so you can try something else without disturbing the others.

![](image:changes)

On a branch, **Merge** brings what the branch changed into the project it came from, and **Discard branch** throws it away.

> The setup files and a guide for running your own server are in Settings, Collaboration, under Run a server.`,
    shots: {
      settings: 'Settings, Collaboration, switched on and not yet connected',
      share: 'The Share dialog of a project',
      live: 'The bar that says Live and who else is in the project',
      changes: 'The list of changes, with going back and branching',
    },
    settings: ['collaboration'],
    places: ['collaboration', 'shared-projects'],
  }),
] as const;
