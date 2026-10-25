/** Export the actual sheet vectors; no screenshot is inserted into the PDF. */
import { download, save } from './download.js';
import { drawingPdfFont } from './drawing-pdf-font.js';
import { compactImages } from './pdf-images.js';

export async function exportDrawingPdf(
  svg: SVGSVGElement,
  width: number,
  height: number,
  name: string,
) {
  const [{ jsPDF }] = await Promise.all([import('jspdf'), import('svg2pdf.js')]);
  // Compressed: the page's own drawing streams are text and shrink well.
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: [width, height],
    compress: true,
  });
  const clean = svg.cloneNode(true) as SVGSVGElement;
  await drawingPdfFont(pdf, svg, clean);
  for (const control of clean.querySelectorAll('[data-no-export]')) control.remove();
  await compactImages(clean);
  await pdf.svg(clean, { x: 0, y: 0, width, height });
  // Not `pdf.save`: that reaches for the browser's own download path, which on the desktop hands
  // the file to the shell and not to our save panel.
  await save(pdf.output('blob'), `${name}.pdf`, 'application/pdf');
}

/** SVG screen coordinates are converted to DXF's upward Y axis in paper millimetres. */
export function exportDrawingDxf(svg: SVGSVGElement, height: number, name: string) {
  const rows: (string | number)[] = [
    0,
    'SECTION',
    2,
    'HEADER',
    9,
    '$ACADVER',
    1,
    'AC1027',
    9,
    '$INSUNITS',
    70,
    4,
    0,
    'ENDSEC',
    0,
    'SECTION',
    2,
    'TABLES',
    0,
    'TABLE',
    2,
    'LTYPE',
    70,
    2,
    0,
    'LTYPE',
    2,
    'CONTINUOUS',
    70,
    0,
    3,
    'Solid line',
    72,
    65,
    73,
    0,
    40,
    0,
    0,
    'LTYPE',
    2,
    'HIDDEN',
    70,
    0,
    3,
    'Hidden edges',
    72,
    65,
    73,
    2,
    40,
    3,
    49,
    2,
    74,
    0,
    49,
    -1,
    74,
    0,
    0,
    'ENDTAB',
    0,
    'ENDSEC',
    0,
    'SECTION',
    2,
    'ENTITIES',
  ];
  const point = svg.createSVGPoint();
  const rootInverse = svg.getCTM()?.inverse();
  if (!rootInverse) throw new Error('The drawing is not visible.');
  for (const element of svg.querySelectorAll<SVGGeometryElement>('polyline,path,line,rect')) {
    if (element.closest('[data-no-export]') || element.hasAttribute('data-dimension-mask'))
      continue;
    const matrix = element.getCTM();
    if (!matrix) continue;
    const transform = rootInverse.multiply(matrix);
    const length = element.getTotalLength();
    const count = element.tagName === 'line' ? 1 : Math.max(2, Math.ceil(length / 0.1));
    const source: number[] = [];
    if (element.tagName === 'polyline')
      source.push(
        ...(element.getAttribute('points') ?? '')
          .trim()
          .split(/[\s,]+/)
          .map(Number),
      );
    else if (element.tagName === 'rect') {
      const x = Number(element.getAttribute('x') ?? 0);
      const y = Number(element.getAttribute('y') ?? 0);
      const w = Number(element.getAttribute('width') ?? 0);
      const h = Number(element.getAttribute('height') ?? 0);
      source.push(x, y, x + w, y, x + w, y + h, x, y + h, x, y);
    } else
      for (let i = 0; i <= count; i++) {
        const p = element.getPointAtLength((length * i) / count);
        source.push(p.x, p.y);
      }
    const coords: number[] = [];
    for (let i = 0; i < source.length; i += 2) {
      point.x = source[i] ?? 0;
      point.y = source[i + 1] ?? 0;
      const q = point.matrixTransform(transform);
      coords.push(q.x, height - q.y);
    }
    rows.push(
      0,
      'LWPOLYLINE',
      8,
      element.getAttribute('stroke-dasharray') ? 'HIDDEN' : 'VISIBLE',
      6,
      element.getAttribute('stroke-dasharray') ? 'HIDDEN' : 'CONTINUOUS',
      370,
      Math.round(Number.parseFloat(getComputedStyle(element).strokeWidth || '.25') * 100),
      90,
      coords.length / 2,
      70,
      0,
    );
    for (let i = 0; i < coords.length; i += 2)
      rows.push(10, coords[i] ?? 0, 20, coords[i + 1] ?? 0);
  }
  for (const el of svg.querySelectorAll('text')) {
    const matrix = el.getCTM();
    if (!matrix || el.closest('[data-no-export]')) continue;
    point.x = Number(el.getAttribute('x') ?? 0);
    point.y = Number(el.getAttribute('y') ?? 0);
    const transform = rootInverse.multiply(matrix);
    const q = point.matrixTransform(transform);
    rows.push(
      0,
      'TEXT',
      8,
      'ANNOTATIONS',
      50,
      (-Math.atan2(transform.b, transform.a) * 180) / Math.PI,
      10,
      q.x,
      20,
      height - q.y,
      40,
      Number(el.getAttribute('font-size') ?? 3),
      72,
      el.getAttribute('text-anchor') === 'middle' ? 1 : 0,
      11,
      q.x,
      21,
      height - q.y,
      1,
      (el.textContent ?? '').replace(/[\r\n]/g, ' '),
    );
  }
  rows.push(0, 'ENDSEC', 0, 'EOF');
  download(rows.join('\n'), `${name}.dxf`, 'application/dxf');
}
