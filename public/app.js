import { createNewMap, loadMapFromDisk, saveMapToDisk } from './js/fileManager.js';
import { bindCanvasInteractions } from './js/interactions.js';
import { render } from './js/renderer.js';
import { findObjectById, getState } from './js/state.js';
import {
  attachLayerCreationPrompt,
  bindPropertiesForm,
  bindToolbar,
  refs,
  renderConnections,
  renderLayers,
  renderProperties
} from './js/ui.js';

const getUiSignature = () => {
  const { map, activeLayerId, selectedObjectId, selectedObjectIds, cursor } = getState();
  const selected = selectedObjectId ? findObjectById(selectedObjectId) : null;
  const layerSignature = map.layers
    .map((layer) => `${layer.id}:${layer.visible ? 1 : 0}:${layer.objects.length}`)
    .join('|');
  const selectedSignature = selected
    ? `${selected.id}:${selected.layerId}:${selected.x}:${selected.y}:${selected.radiusX ?? ''}:${selected.radiusY ?? ''}:${selected.width ?? ''}:${selected.height ?? ''}:${selected.scale ?? 1}:${selected.rotate ?? 0}`
    : `none:${selectedObjectIds.join(',')}`;

  return `${activeLayerId}#${layerSignature}#${selectedSignature}#${map.connections.length}#${cursor.worldX}:${cursor.worldY}`;
};

let prevUiSignature = '';

const redraw = () => {
  render(refs.canvas);

  const nextUiSignature = getUiSignature();
  if (nextUiSignature !== prevUiSignature) {
    prevUiSignature = nextUiSignature;
    renderLayers();
    renderProperties();
    renderConnections();
  }

  requestAnimationFrame(redraw);
};

bindToolbar({
  onAddLayer: attachLayerCreationPrompt,
  onNewMap: () => createNewMap(),
  onSave: async () => {
    try {
      await saveMapToDisk(refs.mapPath.value.trim());
      alert('Map saved successfully.');
    } catch (error) {
      alert(`Cannot save map: ${error.message}`);
    }
  },
  onLoad: async () => {
    try {
      await loadMapFromDisk(refs.mapPath.value.trim());
    } catch (error) {
      alert(`Cannot load map: ${error.message}`);
    }
  }
});

bindPropertiesForm();
bindCanvasInteractions(refs.canvas);

redraw();
