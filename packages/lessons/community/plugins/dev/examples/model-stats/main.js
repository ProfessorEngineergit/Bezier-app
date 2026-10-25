// Model statistics: what the open model is made of, counted.
// An example plugin: reads the model, shows a panel, adds one command.

const list = document.createElement('dl');
const heading = document.createElement('p');
heading.style.color = 'var(--text-dim)';
document.body.append(heading, list);

function row(label, value) {
  const term = document.createElement('dt');
  const detail = document.createElement('dd');
  term.textContent = label;
  detail.textContent = String(value);
  detail.style.margin = '0 0 var(--pad-sm)';
  detail.style.fontWeight = '600';
  list.append(term, detail);
}

async function refresh() {
  list.replaceChildren();
  const text = await bezier.project.read();
  if (text === null) {
    heading.textContent = 'No model is open.';
    return;
  }
  const project = JSON.parse(text);
  const features = Array.isArray(project.features) ? project.features : [];
  const sketches = features.filter((feature) => feature.type === 'sketch');
  const elements = sketches.reduce(
    (sum, sketch) => sum + (sketch.params?.sketch?.primitives?.length ?? 0),
    0,
  );
  heading.textContent = project.meta?.name ?? 'Untitled';
  row('Features', features.length);
  row('Sketches', sketches.length);
  row('Sketch elements', elements);
  row('Size', `${Math.ceil(text.length / 1000)} KB`);
}

await bezier.commands.add('Show model statistics', async () => {
  await refresh();
  await bezier.panel.show('Model statistics');
});
