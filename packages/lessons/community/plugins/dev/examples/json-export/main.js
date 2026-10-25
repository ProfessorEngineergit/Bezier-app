// Export as JSON: the open model as a formatted file.
// An example plugin: reads the model and offers a file, which the person confirms.

await bezier.commands.add('Export model as JSON', async () => {
  const text = await bezier.project.read();
  if (text === null) {
    await bezier.notify('Open a model first.');
    return;
  }
  const project = JSON.parse(text);
  const name = `${project.meta?.name ?? 'model'}.json`;
  const saved = await bezier.files.save(name, 'application/json', JSON.stringify(project, null, 2));
  if (saved) await bezier.notify(`Saved ${name}.`);
});
