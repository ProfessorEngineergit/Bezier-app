/**
 * Files written by `bezier-plugin new`: manifest, a working main.js, editor types and a README.
 * Three templates for the common plugin kinds.
 */

import type {
  Permission,
  PluginManifest,
} from '../../lessons/community/plugins/format/manifest.js';

export const TEMPLATES = {
  command: 'a command that reads the model and says something about it',
  panel: 'a panel beside the model that shows the model as data',
  exporter: 'a command that saves the model in a format of your own',
} as const;

export type Template = keyof typeof TEMPLATES;

const PERMISSIONS: Record<Template, Permission[]> = {
  command: ['project:read', 'ui:command'],
  panel: ['project:read', 'ui:panel', 'ui:command'],
  exporter: ['project:read', 'files:export', 'ui:command'],
};

const CODE: Record<Template, string> = {
  command: `// Runs when Bezier starts the plugin. Add commands here; they appear under the plugin's name.

await bezier.commands.add('Count the steps', async () => {
  const model = await bezier.model.read();
  if (model === null) {
    await bezier.notify('Open a model first.');
    return;
  }
  const failed = model.steps.filter((step) => step.state !== 'ok').length;
  await bezier.notify(\`\${model.steps.length} steps, \${failed} not building.\`);
});
`,
  panel: `// A panel is an ordinary page: draw into document.body. Bezier's colours are CSS variables.

const list = document.createElement('dl');
document.body.append(list);

function row(label, value) {
  const term = document.createElement('dt');
  const detail = document.createElement('dd');
  term.textContent = label;
  detail.textContent = String(value);
  detail.style.margin = '0 0 var(--pad-sm)';
  detail.style.fontWeight = '600';
  list.append(term, detail);
}

await bezier.commands.add('Show the model as data', async () => {
  const model = await bezier.model.read();
  list.replaceChildren();
  if (model === null) row('Model', 'none open');
  else {
    row('Name', model.name);
    row('Steps', model.steps.length);
    row('Bodies', model.bodies.length);
    if (model.bounds) row('Size (mm)', model.bounds.size.join(' × '));
  }
  await bezier.panel.show('Model as data');
});
`,
  exporter: `// Saves the model's steps as CSV. The person confirms the file in Bezier's own dialog.

await bezier.commands.add('Export the steps as CSV', async () => {
  const model = await bezier.model.read();
  if (model === null) {
    await bezier.notify('Open a model first.');
    return;
  }
  const rows = [['id', 'type', 'name', 'state'], ...model.steps.map((s) => [s.id, s.type, s.name, s.state])];
  const csv = rows.map((cells) => cells.map((cell) => \`"\${String(cell).replaceAll('"', '""')}"\`).join(',')).join('\\n');
  const saved = await bezier.files.save(\`\${model.name}.csv\`, 'text/csv', csv);
  if (saved) await bezier.notify('Saved.');
});
`,
};

export function scaffold(id: string, template: Template): Record<string, string> {
  const name = id.split('.').at(-1) ?? id;
  const manifest: PluginManifest = {
    format: 'bezier-plugin',
    version: 1,
    api: 1,
    id,
    name: name.charAt(0).toUpperCase() + name.slice(1).replaceAll('-', ' '),
    description: `${TEMPLATES[template].charAt(0).toUpperCase()}${TEMPLATES[template].slice(1)}.`,
    pluginVersion: '0.1.0',
    permissions: PERMISSIONS[template],
  };
  return {
    'plugin.json': `${JSON.stringify(manifest, null, 2)}\n`,
    'main.js': CODE[template],
    'jsconfig.json': `${JSON.stringify({ compilerOptions: { checkJs: true, target: 'ES2022' }, include: ['main.js', 'bezier.d.ts'] }, null, 2)}\n`,
    'README.md': `# ${manifest.name}\n\n${manifest.description}\n\n## Develop\n\n\`\`\`bash\nnpx bezier-plugin dev     # then Bezier: Settings, Community, Writing a plugin, Load\nnpx bezier-plugin check   # what the store's review will say\nnpx bezier-plugin pack    # the .bezierplugin to publish\n\`\`\`\n`,
  };
}
