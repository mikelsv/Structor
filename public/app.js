import { createNewMap, loadMapFromDisk, saveMapToDisk } from './js/fileManager.js';
import { bindCanvasInteractions } from './js/interactions.js';
import { render } from './js/renderer.js';
import { getState } from './js/state.js';
import {
  attachLayerCreationPrompt,
  bindPropertiesForm,
  bindToolbar,
  refs,
  renderConnections,
  renderLayers,
  renderProperties
} from './js/ui.js';

const redraw = () => {
  const stateBackground = getState().map.background;
  render(refs.canvas);
  renderLayers();
  renderProperties();
  renderConnections();
  if (refs.backgroundPath.dataset.lastStateValue !== stateBackground) {
    if (document.activeElement !== refs.backgroundPath) {
      refs.backgroundPath.value = stateBackground;
    }
    refs.backgroundPath.dataset.lastStateValue = stateBackground;
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
