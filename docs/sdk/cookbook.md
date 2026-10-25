# Cookbook

Short recipes. Each is a whole `main.js` for the permissions listed above it.

## Warn about steps that do not build · `project:read`, `ui:command`

```js
await bezier.commands.add('Check the history', async () => {
  const model = await bezier.model.read();
  if (model === null) return bezier.notify('Open a model first.');
  const broken = model.steps.filter((step) => step.state !== 'ok' && step.state !== 'suppressed');
  await bezier.notify(broken.length === 0 ? 'Every step builds.' : `${broken[0].name}: ${broken[0].message}`);
});
```

## Bounding box for a quote · `project:read`, `ui:panel`, `ui:command`

```js
const out = document.createElement('p');
document.body.append(out);
await bezier.commands.add('Stock size', async () => {
  const model = await bezier.model.read();
  const size = model?.bounds?.size.map((mm) => Math.ceil(mm + 2));
  out.textContent = size ? `Stock: ${size.join(' × ')} mm (1 mm each side)` : 'Nothing to measure.';
  await bezier.panel.show('Stock size');
});
```

## Remember a choice · `storage`, `ui:command`

```js
let unit = (await bezier.storage.get('unit')) ?? 'mm';
await bezier.commands.add('Toggle report unit', async () => {
  unit = unit === 'mm' ? 'in' : 'mm';
  await bezier.storage.set('unit', unit);
  await bezier.notify(`Reports in ${unit}.`);
});
```

## Export a format of your own · `project:read`, `files:export`, `ui:command`

```js
await bezier.commands.add('Export variables as JSON', async () => {
  const model = await bezier.model.read();
  if (model === null) return;
  const saved = await bezier.files.save(`${model.name}-variables.json`, 'application/json',
    JSON.stringify(model.variables, null, 2));
  if (saved) await bezier.notify('Saved.');
});
```

## Make a part from numbers · `project:create`, `ui:command`

Generators write project text and open it as a new project. Start from a project you exported
with `project.read()`, change its parameters, and open the result:

```js
await bezier.commands.add('Washer M8', async () => {
  const template = await (await fetch('https://parts.example.org/washer.json')).text(); // needs network
  await bezier.project.create(template.replaceAll('"inner": 4', '"inner": 4.2'), 'Washer M8');
});
```

## Look like Bezier

```js
document.body.innerHTML = '<button>Run</button>';
Object.assign(document.querySelector('button').style, {
  background: 'var(--accent)', color: 'var(--text-on-accent)', border: '0',
  borderRadius: 'var(--radius-control)', padding: 'var(--pad-sm) var(--pad)', font: 'inherit',
});
```
