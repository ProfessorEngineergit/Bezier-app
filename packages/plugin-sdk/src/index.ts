/**
 * @bezier/plugin-sdk: the building blocks of `bezier-plugin`, for tools that need the same steps
 * without the CLI (plugin tests, editor extensions). Types for the `bezier` object are in
 * ../bezier.d.ts.
 */

export { devServer } from './dev-server.js';
export { type Checked, checkFolder } from './folder.js';
export { scaffold, TEMPLATES, type Template } from './templates.js';
