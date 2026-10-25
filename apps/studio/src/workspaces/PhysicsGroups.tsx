/**
 * Physics drawing settings in Drawings' inspector: which pictures are on the sheet and their
 * layout, the side column, and notes. Size, title block, branding and export are set as for every
 * sheet.
 */

import { Group, Segment, Toggle } from './DrawingInspector.js';
import type { PhysicsContent } from './physics-sheets.js';

export function PhysicsGroups({
  content,
  onChange,
}: {
  content: PhysicsContent;
  onChange: (patch: Partial<PhysicsContent>) => void;
}) {
  return (
    <>
      <Group title="Pictures">
        <Segment
          label="Layout"
          onChange={(layout) => onChange({ layout })}
          options={[
            ['grid', 'Grid'],
            ['feature', 'One large'],
          ]}
          value={content.layout}
        />
        {content.layout === 'feature' && (
          <Segment
            label="Large picture"
            onChange={(main) => onChange({ main })}
            options={content.views.map((view, index) => [index, view.label] as const)}
            value={content.main}
          />
        )}
        {content.views.map((view, index) => (
          <Toggle
            checked={view.shown}
            key={view.label}
            label={view.label}
            onChange={(shown) =>
              onChange({ views: content.views.map((v, i) => (i === index ? { ...v, shown } : v)) })
            }
          />
        ))}
      </Group>
      <Group title="Beside the pictures">
        <Toggle
          checked={content.show.legend}
          label="Colour scale"
          onChange={(legend) => onChange({ show: { ...content.show, legend } })}
        />
        <Toggle
          checked={content.show.readings}
          label="Result"
          onChange={(readings) => onChange({ show: { ...content.show, readings } })}
        />
        <Toggle
          checked={content.show.setup}
          label="Setup"
          onChange={(setup) => onChange({ show: { ...content.show, setup } })}
        />
        <Toggle
          checked={content.show.notes}
          label="Notes"
          onChange={(notes) => onChange({ show: { ...content.show, notes } })}
        />
        <label className="dwg-text">
          <span>Notes</span>
          <textarea
            onChange={(event) => onChange({ notes: event.target.value })}
            placeholder="What was checked, and what it means"
            rows={4}
            value={content.notes}
          />
        </label>
      </Group>
    </>
  );
}
