/*
 * Progressive enhancement: plays the film inline and, on the download page, lists builds from
 * releases.json with this computer's platform first. Pages work without it.
 */

for (const button of document.querySelectorAll('[data-film]')) {
  button.addEventListener('click', () => {
    const film = button.closest('.film');
    const video = document.createElement('video');
    video.src = button.dataset.film;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    video.setAttribute('aria-label', 'The Bezier intro film');
    film.replaceChildren(video);
    video.focus();
  });
}

const PLATFORMS = {
  macos: { name: 'macOS', note: 'Runs in the system’s WebKit view. Apple silicon and Intel.' },
  windows: {
    name: 'Windows',
    note: 'Windows 10 and 11, with WebView2 (already on most machines).',
  },
  linux: { name: 'Linux', note: 'WebKitGTK. AppImage runs anywhere; .deb and .rpm install it.' },
};

const KINDS = {
  dmg: 'Disk image (.dmg)',
  msi: 'Installer (.msi)',
  exe: 'Setup (.exe)',
  appimage: 'AppImage',
  deb: 'Debian, Ubuntu (.deb)',
  rpm: 'Fedora, openSUSE (.rpm)',
};

function thisComputer() {
  const platform = (navigator.userAgentData?.platform ?? navigator.platform ?? '').toLowerCase();
  const agent = navigator.userAgent.toLowerCase();
  if (platform.includes('mac') || agent.includes('mac os')) return 'macos';
  if (platform.includes('win') || agent.includes('windows')) return 'windows';
  if (platform.includes('linux') || agent.includes('linux')) return 'linux';
  return null;
}

const size = (bytes) => (bytes > 0 ? ` · ${(bytes / 1e6).toFixed(0)} MB` : '');

function link(file, accent) {
  const a = document.createElement('a');
  a.className = accent ? 'button button--accent button--large' : 'button';
  a.href = file.url;
  a.textContent = KINDS[file.kind] ?? file.name;
  const small = document.createElement('small');
  small.textContent = `${file.arch ? ` ${file.arch}` : ''}${size(file.size)}`;
  a.append(small);
  return a;
}

function render(root, releases) {
  const release = releases.stable;
  const yours = thisComputer();
  const status = root.querySelector('[data-status]');
  const list = root.querySelector('[data-platforms]');
  const primary = root.querySelector('[data-primary]');
  list.replaceChildren();
  primary.replaceChildren();
  if (!release) {
    status.textContent = 'The first release is on its way. Until then, Bezier runs in the browser.';
    return;
  }
  const date = release.date
    ? new Date(release.date).toLocaleDateString('en', { dateStyle: 'long' })
    : '';
  status.innerHTML = '';
  status.append(
    `Bezier ${release.version}${date ? `, ${date}` : ''}. `,
    Object.assign(document.createElement('a'), { href: release.notes, textContent: 'What is new' }),
    '.',
  );
  const order = ['macos', 'windows', 'linux'].sort((a, b) =>
    a === yours ? -1 : b === yours ? 1 : 0,
  );
  for (const id of order) {
    const files = release.files.filter((file) => file.platform === id);
    const card = document.createElement('div');
    card.className = 'platform';
    if (id === yours) card.dataset.yours = '';
    const title = document.createElement('h3');
    title.textContent = PLATFORMS[id].name + (id === yours ? ' · this computer' : '');
    const note = document.createElement('p');
    note.textContent = PLATFORMS[id].note;
    const box = document.createElement('div');
    box.className = 'files';
    if (files.length === 0) box.append('Not in this release.');
    for (const file of files) box.append(link(file, false));
    card.append(title, note, box);
    list.append(card);
  }
  const mine = release.files.filter((file) => file.platform === yours);
  if (mine[0]) primary.append(link(mine[0], true));
}

const download = document.querySelector('[data-download]');
if (download) {
  fetch('/releases.json', { cache: 'no-cache' })
    .then((response) => (response.ok ? response.json() : { stable: null }))
    .catch(() => ({ stable: null }))
    .then((releases) => render(download, releases));
}
