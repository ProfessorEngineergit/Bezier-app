/** A picture with its arrows drawn over it as SVG. */

import { useState } from 'react';
import { arrowShape } from '../format/arrows.js';
import type { Arrow, DocImage } from '../format/article.js';

/** Draws arrows in a 0..1 viewBox; the aspect ratio comes from the element. */
export function ArrowShapes({ arrows, ratio }: { arrows: readonly Arrow[]; ratio: number }) {
  return (
    <>
      {arrows.map((arrow, index) => {
        const { line, head } = arrowShape(arrow, ratio);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: arrows are identified by order
          <g className="doc-arrow" key={index}>
            <line
              className="doc-arrow__line"
              vectorEffect="non-scaling-stroke"
              x1={line.x1}
              x2={line.x2}
              y1={line.y1}
              y2={line.y2}
            />
            <polygon className="doc-arrow__head" points={head} />
          </g>
        );
      })}
    </>
  );
}

export function AnnotatedImage({ image }: { image: DocImage }) {
  // The loaded picture's aspect ratio, so arrowheads are not distorted.
  const [ratio, setRatio] = useState(1.6);
  const [failed, setFailed] = useState(false);
  if (image.src === '' || failed)
    return (
      <figure className="doc-figure">
        <div className="doc-figure__missing">The picture could not be shown.</div>
        {image.alt !== '' && <figcaption>{image.alt}</figcaption>}
      </figure>
    );
  return (
    <figure className="doc-figure">
      <div className="doc-figure__frame">
        <img
          alt={image.alt}
          className="doc-figure__picture"
          draggable={false}
          loading="lazy"
          onError={() => setFailed(true)}
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalHeight > 0) setRatio(naturalWidth / naturalHeight);
          }}
          src={image.src}
        />
        {image.arrows.length > 0 && (
          <svg
            aria-hidden="true"
            className="doc-figure__arrows"
            preserveAspectRatio="none"
            viewBox="0 0 1 1"
          >
            <ArrowShapes arrows={image.arrows} ratio={ratio} />
          </svg>
        )}
      </div>
      {image.alt !== '' && <figcaption>{image.alt}</figcaption>}
    </figure>
  );
}
