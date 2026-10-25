/**
 * ProseMirror node views for figures and keys. A figure renders with its arrows as readers see it,
 * with an editable caption and hover actions; a key renders as keycaps from the active keymap.
 * Plain DOM, since React should not render inside contenteditable text.
 */

import type { Node } from 'prosemirror-model';
import { TextSelection } from 'prosemirror-state';
import type { EditorView, NodeView } from 'prosemirror-view';
import { arrowShape } from '../format/arrows.js';
import type { DocImage } from '../format/article.js';

const SVG = 'http://www.w3.org/2000/svg';

export interface PictureHost {
  /** The picture for a key, or undefined if missing. */
  picture(key: string): DocImage | undefined;
  /** Updates a picture's alt text from its caption. */
  setAlt(key: string, alt: string): void;
  editArrows(key: string): void;
  replace(key: string): void;
}

function drawArrows(svg: SVGSVGElement, image: DocImage, ratio: number): void {
  svg.replaceChildren(
    ...image.arrows.map((arrow) => {
      const { line, head } = arrowShape(arrow, ratio);
      const group = document.createElementNS(SVG, 'g');
      group.setAttribute('class', 'doc-arrow');
      const stroke = document.createElementNS(SVG, 'line');
      stroke.setAttribute('class', 'doc-arrow__line');
      stroke.setAttribute('vector-effect', 'non-scaling-stroke');
      stroke.setAttribute('x1', String(line.x1));
      stroke.setAttribute('y1', String(line.y1));
      stroke.setAttribute('x2', String(line.x2));
      stroke.setAttribute('y2', String(line.y2));
      const tip = document.createElementNS(SVG, 'polygon');
      tip.setAttribute('class', 'doc-arrow__head');
      tip.setAttribute('points', head);
      group.append(stroke, tip);
      return group;
    }),
  );
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'wiki-figure__action';
  element.textContent = label;
  // Prevent mousedown from moving the selection out of the figure.
  element.addEventListener('mousedown', (event) => event.preventDefault());
  element.addEventListener('click', onClick);
  return element;
}

export class FigureView implements NodeView {
  dom: HTMLElement;
  private node: Node;
  private readonly img: HTMLImageElement;
  private readonly svg: SVGSVGElement;
  private readonly caption: HTMLInputElement;
  private readonly missing: HTMLElement;
  private ratio = 1.6;

  constructor(
    node: Node,
    private readonly view: EditorView,
    private readonly getPos: () => number | undefined,
    private readonly host: PictureHost,
  ) {
    this.node = node;
    this.dom = document.createElement('figure');
    this.dom.className = 'doc-figure wiki-figure';
    this.dom.contentEditable = 'false';

    const frame = document.createElement('div');
    frame.className = 'doc-figure__frame';
    this.img = document.createElement('img');
    this.img.className = 'doc-figure__picture';
    this.img.draggable = false;
    this.img.addEventListener('load', () => {
      if (this.img.naturalHeight > 0) this.ratio = this.img.naturalWidth / this.img.naturalHeight;
      this.render();
    });
    this.svg = document.createElementNS(SVG, 'svg');
    this.svg.setAttribute('class', 'doc-figure__arrows');
    this.svg.setAttribute('viewBox', '0 0 1 1');
    this.svg.setAttribute('preserveAspectRatio', 'none');
    this.svg.setAttribute('aria-hidden', 'true');
    this.missing = document.createElement('div');
    this.missing.className = 'doc-figure__missing';
    this.missing.textContent = 'This picture is not here any more. Remove it, or replace it.';

    const actions = document.createElement('div');
    actions.className = 'wiki-figure__actions';
    actions.append(
      button('Arrows', () => this.host.editArrows(this.key)),
      button('Replace', () => this.host.replace(this.key)),
      button('Remove', () => this.remove()),
    );
    frame.append(this.img, this.svg, this.missing, actions);

    this.caption = document.createElement('input');
    this.caption.className = 'wiki-figure__caption';
    this.caption.placeholder = 'What the picture shows';
    this.caption.maxLength = 200;
    this.caption.setAttribute('aria-label', 'What the picture shows');
    this.caption.addEventListener('input', () => this.host.setAlt(this.key, this.caption.value));
    // Enter in the caption continues in a new paragraph below the figure.
    this.caption.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      event.preventDefault();
      const pos = this.getPos();
      if (pos === undefined) return;
      const after = pos + this.node.nodeSize;
      const { state } = this.view;
      const paragraph = state.schema.nodes.paragraph?.create();
      if (paragraph === undefined) return;
      const tr = state.tr.insert(after, paragraph);
      this.view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1))));
      this.view.focus();
    });

    this.dom.append(frame, this.caption);
    this.render();
  }

  private get key(): string {
    return String(this.node.attrs.key);
  }

  /** Re-renders after the picture, its arrows or its caption change. */
  render(): void {
    const image = this.host.picture(this.key);
    const there = image !== undefined && image.src !== '';
    this.dom.toggleAttribute('data-missing', !there);
    if (there && this.img.getAttribute('src') !== image.src) this.img.src = image.src;
    if (!there) this.img.removeAttribute('src');
    if (image !== undefined) {
      this.img.alt = image.alt;
      drawArrows(this.svg, image, this.ratio);
      if (document.activeElement !== this.caption) this.caption.value = image.alt;
    }
  }

  private remove(): void {
    const pos = this.getPos();
    if (pos === undefined) return;
    this.view.dispatch(this.view.state.tr.delete(pos, pos + this.node.nodeSize));
    this.view.focus();
  }

  update(node: Node): boolean {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  selectNode(): void {
    this.dom.classList.add('is-selected');
  }

  deselectNode(): void {
    this.dom.classList.remove('is-selected');
  }

  /** Keeps ProseMirror from handling events on the caption and buttons. */
  stopEvent(event: Event): boolean {
    const target = event.target as HTMLElement | null;
    return target !== null && (target === this.caption || target.closest('button') !== null);
  }

  ignoreMutation(): boolean {
    return true;
  }
}

export class KeyView implements NodeView {
  dom: HTMLElement;

  constructor(node: Node, keyOf: (action: string) => readonly string[] | null) {
    this.dom = document.createElement('span');
    this.dom.className = 'wiki-key';
    const caps = keyOf(String(node.attrs.action));
    if (caps === null) {
      this.dom.textContent = 'no key set';
      this.dom.classList.add('wiki-key--none');
    } else
      for (const cap of caps) {
        const kbd = document.createElement('kbd');
        kbd.textContent = cap;
        this.dom.append(kbd);
      }
    this.dom.title = `The key of ${String(node.attrs.action)}`;
  }

  ignoreMutation(): boolean {
    return true;
  }
}
