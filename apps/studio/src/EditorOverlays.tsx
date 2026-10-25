/**
 * Overlays drawn over the editor by other parts of the app: lessons being recorded or followed,
 * plugin UI, and the assistant's view of the editor.
 */

import { LessonsOverlay } from '@bezier/lessons';
import { AutomationLayer } from './automation/AutomationLayer.js';
import { PluginLayer, type PluginLayerProps } from './plugins/PluginLayer.js';

export function EditorOverlays(props: PluginLayerProps) {
  return (
    <>
      <LessonsOverlay lessons={props.lessons} />
      <PluginLayer {...props} />
      <AutomationLayer say={props.say} selected={props.selected} />
    </>
  );
}
