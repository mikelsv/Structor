import { createNewMap, loadMapFromFile, saveMapToFile } from './fileManager.js';
import { bindCanvasInteractions } from './interactions.js';
import { render } from './renderer.js';
import { getState } from './state.js';
import {
  attachLayerCreationPrompt,
  bindPropertiesForm,
  bindToolbar,
  refs,
  renderConnections,
  renderLayers,
  renderProperties
} from './ui.js';

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
  onSave: () => saveMapToFile(),
  onLoad: () => refs.fileInput.click()
});

bindPropertiesForm();
bindCanvasInteractions(refs.canvas);

refs.fileInput.addEventListener('change', async (event) => {
  const [file] = event.target.files || [];
  if (!file) return;
  try {
    await loadMapFromFile(file);
  } catch (error) {
    alert(`Cannot load map: ${error.message}`);
  }
  event.target.value = '';
});

redraw();
