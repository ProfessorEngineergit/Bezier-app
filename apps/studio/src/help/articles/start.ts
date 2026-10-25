import { define } from '../define.js';

export const START = [
  define({
    id: 'community',
    gate: 'alpha',
    title: 'Community: the wiki, lessons and plugins',
    area: 'Learn and Community',
    summary:
      'Read and improve the wiki, and browse lessons and plugins other people share, without an account.',
    keywords:
      'community store lessons plugins docs wiki download install share server extension marketplace leaderboard write article improve address points',
    body: `Community is part of the alpha channel, which opens with an invitation code: see [Updates](doc:settings-updates). On stable and beta the same page is the wiki alone, see [the wiki](doc:wiki).

Community is the page in the sidebar of the start page, after Learn. It has four parts, chosen at the top: Wiki, Lessons, Plugins and Leaderboard. It opens on the Wiki.

![](image:docs)

## Wiki

These pages are the wiki. The articles that come with Bezier need no store and no network. Type in the search above the list to narrow it, or click an article to read it. Ctrl or Cmd and K finds an article from anywhere. See [search](doc:search).

Press **Collapse** to take the wiki off the page into a window that floats over the app. It stays open when you open a project, so an article can sit beside the model it is about. Drag it by its bar, size it from its corner, and press **Expand** on the start page to put it back.

## Writing in the wiki

Press **Edit** on an article, or **New article** above the list. You write on the article as it will read: type **/** at the start of a line for headings, steps, notes, pictures and keys, and select words to make them bold or a link. Drop or paste a picture anywhere, then press **Arrows** on it to point at what matters. Turn on **Show Markdown** to see and edit the same article as text beside it.

**Publish** puts your version live for everyone at once, as on Wikipedia. Every version is kept: **History** on an article lists them, and any one can be put back. Publishing needs a token from whoever runs the store, asked for the first time you publish.

## Lessons, Plugins and Leaderboard

These three come from a store, and the store is off until you turn it on. Bezier's own store does not have an address yet, so until you give one, each of the three says that Bezier Community opens with the launch.

![](image:lessons)

If you run a store of your own, or someone gives you the address of theirs:

1. Press Community settings on the page, or open Settings and choose Community. See [open Settings](doc:open-settings).
2. Under Another store, type the Store address and press Use.
3. Turn on Show what other people share, or press Turn on Community on the page. Bezier asks the store what it has. Nothing of yours is sent, and there is no account to make.

Then:

- **Lessons**: press Download on a lesson, then Open. It is on the Learn page from then on. See [learn](doc:learn).
- **Plugins**: press Install, read what the plugin may do, and confirm with Install. Installed plugins are listed at the top of the page, where each can be switched off or removed. Remove asks once.

> Only a store you choose is asked. A report button on each lesson and plugin tells the store's owner about one that should not be there.`,
    shots: {
      docs: 'The Community page, open on the Wiki',
      lessons: 'Lessons before a store is turned on',
    },
    settings: ['community'],
    places: ['community'],
  }),
  define({
    id: 'wiki',
    title: 'The wiki',
    area: 'Learn and Community',
    summary:
      'Every article of Bezier in one place: search it, read it, keep it open beside a model.',
    keywords:
      'wiki docs help articles manual documentation search read float collapse expand command k',
    body: `The wiki is these pages. The articles come with Bezier, so they need no network and no account.

1. Open **Wiki** in the sidebar of the start page.
2. Type in the search above the list to narrow it, or click an article to read it. Ctrl or Cmd and K finds an article from anywhere, also inside a project. See [search](doc:search).
3. Press **Collapse** to take the wiki off the page into a window that floats over the app. It stays open when you open a project, so an article can sit beside the model it is about. Drag it by its bar, size it from its corner, and press **Expand** on the start page to put it back.

> Writing and changing articles, and the community's lessons, plugins and leaderboard, are on the alpha channel. See [Updates](doc:settings-updates).`,
    places: ['wiki'],
  }),
] as const;
