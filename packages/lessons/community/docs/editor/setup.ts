/**
 * Editor behaviour: Markdown input rules ("## ", "1. ", "> ", **bold**), keymaps, undo and the drop
 * cursor. Also the commands the menus use, so keys and buttons share one implementation.
 */

import {
  baseKeymap,
  chainCommands,
  exitCode,
  setBlockType,
  toggleMark,
} from 'prosemirror-commands';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { history, redo, undo } from 'prosemirror-history';
import {
  InputRule,
  inputRules,
  textblockTypeInputRule,
  undoInputRule,
  wrappingInputRule,
} from 'prosemirror-inputrules';
import { keymap } from 'prosemirror-keymap';
import type { MarkType } from 'prosemirror-model';
import { liftListItem, splitListItem, wrapInList } from 'prosemirror-schema-list';
import type { Command, EditorState, Plugin } from 'prosemirror-state';
import { schema } from './schema.js';

const { nodes, marks } = schema;

/** An input rule that applies a mark for Markdown syntax such as `**words**`. */
function markRule(pattern: RegExp, type: MarkType): InputRule {
  return new InputRule(pattern, (state, match, start, end) => {
    const text = match[1];
    if (text === undefined || text === '') return null;
    const tr = state.tr.insertText(text, start, end);
    tr.addMark(start, start + text.length, type.create());
    tr.removeStoredMark(type);
    return tr;
  });
}

function rules(): Plugin {
  return inputRules({
    rules: [
      textblockTypeInputRule(/^##\s$/, nodes.heading, { level: 2 }),
      textblockTypeInputRule(/^###\s$/, nodes.heading, { level: 3 }),
      wrappingInputRule(/^1[.)]\s$/, nodes.ordered_list),
      wrappingInputRule(/^[-*]\s$/, nodes.bullet_list),
      textblockTypeInputRule(/^>\s$/, nodes.note),
      textblockTypeInputRule(/^```$/, nodes.code_block),
      markRule(/\*\*([^*]+)\*\*$/, marks.strong),
      markRule(/(?<![*\w])\*([^*\s][^*]*)\*$/, marks.em),
      markRule(/`([^`]+)`$/, marks.code),
    ],
  });
}

/** Enter splits a list item, or ends the list when the item is empty. */
const listEnter: Command = (state, dispatch) =>
  splitListItem(nodes.list_item)(state, dispatch) || liftListItem(nodes.list_item)(state, dispatch);

export function plugins(): Plugin[] {
  return [
    rules(),
    keymap({
      'Mod-z': undo,
      'Mod-y': redo,
      'Shift-Mod-z': redo,
      Backspace: undoInputRule,
      'Mod-b': toggleMark(marks.strong),
      'Mod-i': toggleMark(marks.em),
      'Mod-e': toggleMark(marks.code),
      'Shift-Mod-7': wrapInList(nodes.ordered_list),
      'Shift-Mod-8': wrapInList(nodes.bullet_list),
      'Shift-Ctrl-0': setBlockType(nodes.paragraph),
      'Shift-Ctrl-2': setBlockType(nodes.heading, { level: 2 }),
      'Shift-Ctrl-3': setBlockType(nodes.heading, { level: 3 }),
      Enter: listEnter,
      'Mod-Enter': chainCommands(exitCode),
    }),
    keymap(baseKeymap),
    history(),
    dropCursor({ color: 'var(--text)', width: 2 }),
    gapCursor(),
  ];
}

/** The block type at the cursor, for the menus' active state. */
export function blockAt(state: EditorState): string {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type === nodes.ordered_list) return 'ordered';
    if (node.type === nodes.bullet_list) return 'bullets';
  }
  const parent = $from.parent;
  if (parent.type === nodes.heading) return parent.attrs.level === 3 ? 'h3' : 'h2';
  if (parent.type === nodes.note) return 'note';
  if (parent.type === nodes.code_block) return 'code';
  return 'paragraph';
}

export function isMarkOn(state: EditorState, type: MarkType): boolean {
  const { from, $from, to, empty } = state.selection;
  if (empty) return type.isInSet(state.storedMarks ?? $from.marks()) !== undefined;
  return state.doc.rangeHasMark(from, to, type);
}

/** Sets the block type at the cursor, or toggles back to a paragraph. */
export function setBlock(kind: string): Command {
  return (state, dispatch, view) => {
    // Lift out of the list first so a step becomes a heading, not a heading inside a step.
    const inList = ['ordered', 'bullets'].includes(blockAt(state));
    if (inList && kind !== blockAt(state)) {
      if (!liftListItem(nodes.list_item)(state, dispatch, view)) return false;
      if (view === undefined) return true;
      return setBlock(kind)(view.state, view.dispatch, view);
    }
    switch (kind) {
      case 'h2':
        return setBlockType(nodes.heading, { level: 2 })(state, dispatch);
      case 'h3':
        return setBlockType(nodes.heading, { level: 3 })(state, dispatch);
      case 'note':
        return setBlockType(nodes.note)(state, dispatch);
      case 'code':
        return setBlockType(nodes.code_block)(state, dispatch);
      case 'ordered':
        return wrapInList(nodes.ordered_list)(state, dispatch);
      case 'bullets':
        return wrapInList(nodes.bullet_list)(state, dispatch);
      default:
        return setBlockType(nodes.paragraph)(state, dispatch);
    }
  };
}

export { marks, nodes, toggleMark };
