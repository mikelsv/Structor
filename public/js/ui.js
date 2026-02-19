import {
  addLayer,
  findObjectById,
  getState,
  moveLayerDown,
  moveLayerUp,
  removeObject,
  renameObjectId,
  selectObject,
  setActiveLayer,
  setTool,
  toggleLayerVisibility,
  updateObjectLayer,
  upsertObject
} from './state.js';

const byId = (id) => document.getElementById(id);

export const refs = {
  canvas: byId('editor-canvas'),
  layersList: byId('layers-list'),
  connectionsList: byId('connections-list'),
  propertiesForm: byId('properties-form'),
  selectionState: byId('selection-state'),
  hint: byId('editor-hint'),
  mapPath: byId('map-path')
};

const getToolLabel = (tool) => ({
  select: 'Select',
  'create-circle': 'Create Circle',
  'create-square': 'Create Square',
  'create-connection': 'Create Connection'
}[tool] || tool);

export const bindToolbar = ({ onAddLayer, onNewMap, onSave, onLoad }) => {
  document.querySelectorAll('[data-tool]').forEach((button) => {
    button.addEventListener('click', () => {
      const tool = button.dataset.tool;
      setTool(tool);
      document.querySelectorAll('[data-tool]').forEach((entry) => entry.classList.toggle('active', entry === button));
      refs.hint.textContent = `Tool: ${getToolLabel(tool)}.`;
    });
  });

  byId('add-layer').addEventListener('click', onAddLayer);
  byId('new-map').addEventListener('click', onNewMap);
  byId('save-map').addEventListener('click', onSave);
  byId('load-map').addEventListener('click', onLoad);
};

export const renderLayersUI = () => {
  const { map, activeLayerId } = getState();
  refs.layersList.innerHTML = '';

  map.layers.forEach((layer, index) => {
    const item = document.createElement('li');
    item.className = `layer-item ${activeLayerId === layer.id ? 'active' : ''}`;
    item.addEventListener('click', () => setActiveLayer(layer.id));

    const nameButton = document.createElement('button');
    nameButton.type = 'button';
    nameButton.textContent = layer.id;
    nameButton.addEventListener('click', (event) => {
      event.stopPropagation();
      setActiveLayer(layer.id);
    });

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.textContent = layer.visible ? 'Hide' : 'Show';
    toggleButton.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleLayerVisibility(layer.id);
    });

    const upButton = document.createElement('button');
    upButton.type = 'button';
    upButton.textContent = '↑';
    upButton.disabled = index === 0;
    upButton.addEventListener('click', (event) => {
      event.stopPropagation();
      moveLayerUp(layer.id);
    });

    const downButton = document.createElement('button');
    downButton.type = 'button';
    downButton.textContent = '↓';
    downButton.disabled = index === map.layers.length - 1;
    downButton.addEventListener('click', (event) => {
      event.stopPropagation();
      moveLayerDown(layer.id);
    });

    const count = document.createElement('span');
    count.textContent = `${layer.objects.length}`;

    item.append(nameButton, toggleButton, upButton, downButton, count);
    refs.layersList.append(item);
  });
};

export const renderLayers = renderLayersUI;

export const renderConnections = () => {
  const { map } = getState();
  const visibleObjectIds = new Set(
    map.layers.filter((layer) => layer.visible).flatMap((layer) => layer.objects.map((obj) => obj.id))
  );
  refs.connectionsList.innerHTML = '';
  for (const conn of map.connections.filter((entry) => visibleObjectIds.has(entry.from) && visibleObjectIds.has(entry.to))) {
    const item = document.createElement('li');
    item.textContent = `${conn.from} → ${conn.to}`;
    refs.connectionsList.append(item);
  }
};

export const renderProperties = () => {
  const { selectedObjectId, selectedObjectIds, map } = getState();
  const selected = selectedObjectId ? findObjectById(selectedObjectId) : null;

  const form = refs.propertiesForm;
  const layerSelect = form.elements.layerId;
  layerSelect.innerHTML = '';
  map.layers.forEach((layer) => {
    const option = document.createElement('option');
    option.value = layer.id;
    option.textContent = layer.id;
    layerSelect.append(option);
  });

  if (!selected) {
    refs.selectionState.textContent = selectedObjectIds.length ? `${selectedObjectIds.length} selected` : 'Nothing selected';
    form.hidden = true;
    return;
  }

  refs.selectionState.textContent = `Selected: ${selected.id} (${selected.type})`;
  form.hidden = false;
  form.elements.id.value = selected.id;
  form.elements.x.value = selected.x;
  form.elements.y.value = selected.y;
  form.elements.radius.value = selected.radius ?? '';
  form.elements.size.value = selected.size ?? '';
  form.elements.layerId.value = selected.layerId;

  form.querySelector('[data-field="radius"]').hidden = selected.type !== 'circle';
  form.querySelector('[data-field="size"]').hidden = selected.type !== 'square';
};

export const bindPropertiesForm = () => {
  refs.propertiesForm.addEventListener('input', (event) => {
    const selected = findObjectById(getState().selectedObjectId);
    if (!selected) return;
    if (event.target?.name === 'layerId') return;

    const form = event.currentTarget;
    const updated = {
      ...selected,
      id: form.elements.id.value.trim() || selected.id,
      x: Number(form.elements.x.value),
      y: Number(form.elements.y.value),
      layerId: selected.layerId
    };

    if (selected.type === 'circle') updated.radius = Math.max(1, Number(form.elements.radius.value) || selected.radius);
    if (selected.type === 'square') updated.size = Math.max(2, Number(form.elements.size.value) || selected.size);

    if (updated.id !== selected.id) {
      const success = renameObjectId(selected.id, updated.id);
      if (!success) {
        form.elements.id.value = selected.id;
        return;
      }
      selectObject(updated.id);
    }
    upsertObject(updated);
  });

  refs.propertiesForm.elements.layerId.addEventListener('change', (event) => {
    const objectId = getState().selectedObjectId;
    if (!objectId) return;
    updateObjectLayer(objectId, event.target.value);
  });

  byId('delete-object').addEventListener('click', () => {
    const id = getState().selectedObjectId;
    if (id) removeObject(id);
  });
};

export const attachLayerCreationPrompt = () => {
  const name = prompt('Layer id', `layer_${Date.now()}`);
  if (!name) return;
  addLayer(name.trim());
};
