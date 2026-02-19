import {
  addLayer,
  findObjectById,
  getState,
  moveLayerDown,
  moveLayerUp,
  renameLayer,
  reorderLayers,
  removeObject,
  renameObjectId,
  selectObject,
  setActiveLayer,
  setTool,
  toggleLayerVisibility,
  updateObjectLayer,
  upsertObject
} from './state.js';
import { getObjectBounds } from './renderer.js';

const byId = (id) => document.getElementById(id);
let layerOptionsSignature = '';
let layerDragState = {
  draggingLayerId: null,
  fromIndex: -1,
  overIndex: -1,
  dropSide: 'after'
};
let editingLayerId = null;

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

const getSelectionBounds = (objects) => {
  const bounds = objects.map((obj) => getObjectBounds(obj));
  return {
    width: Math.round(Math.max(...bounds.map((entry) => entry.maxX)) - Math.min(...bounds.map((entry) => entry.minX))),
    height: Math.round(Math.max(...bounds.map((entry) => entry.maxY)) - Math.min(...bounds.map((entry) => entry.minY)))
  };
};

const ensureLayerOptions = () => {
  const { map } = getState();
  const layerSelect = refs.propertiesForm.elements.layerId;
  const nextLayerOptionsSignature = map.layers.map((layer) => `${layer.id}:${layer.name}`).join('|');
  if (nextLayerOptionsSignature === layerOptionsSignature) return;

  layerOptionsSignature = nextLayerOptionsSignature;
  layerSelect.innerHTML = '';
  map.layers.forEach((layer) => {
    const option = document.createElement('option');
    option.value = layer.id;
    option.textContent = layer.name;
    layerSelect.append(option);
  });
};

const resetLayerDragState = () => {
  layerDragState = {
    draggingLayerId: null,
    fromIndex: -1,
    overIndex: -1,
    dropSide: 'after'
  };
};

const fillSingleSelectionForm = (selected) => {
  const form = refs.propertiesForm;
  const isCircle = selected.type === 'circle';
  const isRectLike = selected.type === 'square' || selected.type === 'image';

  form.elements.type.value = selected.type === 'square' ? 'rectangle' : selected.type;
  form.elements.id.value = selected.id;
  form.elements.x.value = Math.round(Number(selected.x) || 0);
  form.elements.y.value = Math.round(Number(selected.y) || 0);
  form.elements.radiusX.value = Math.round(Number(selected.radiusX) || Number(selected.radius) || 30);
  form.elements.radiusY.value = Math.round(Number(selected.radiusY) || Number(selected.radius) || 30);
  form.elements.width.value = Math.round(Number(selected.width) || Number(selected.size) || 50);
  form.elements.height.value = Math.round(Number(selected.height) || Number(selected.size) || 50);
  form.elements.scale.value = Number(selected.scale) || 1;
  form.elements.rotate.value = Number(selected.rotate) || 0;
  form.elements.layerId.value = selected.layerId;

  form.querySelector('[data-field-group="radius"]').hidden = !isCircle;
  form.querySelector('[data-field-group="size"]').hidden = !isRectLike;
};

export const renderPropertiesPanel = (selectedObjects) => {
  ensureLayerOptions();
  const { cursor } = getState();
  const form = refs.propertiesForm;

  if (!selectedObjects.length) {
    refs.selectionState.textContent = `Cursor: worldX ${cursor.worldX}, worldY ${cursor.worldY}`;
    form.hidden = true;
    return;
  }

  if (selectedObjects.length > 1) {
    const bounds = getSelectionBounds(selectedObjects);
    refs.selectionState.textContent = `Selected: ${selectedObjects.length} | Bounding box: ${bounds.width} × ${bounds.height}`;
    form.hidden = true;
    return;
  }

  refs.selectionState.textContent = `Selected: ${selectedObjects[0].id} (${selectedObjects[0].type})`;
  form.hidden = false;
  fillSingleSelectionForm(selectedObjects[0]);
};

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
    if (!layer.visible) item.classList.add('is-hidden');
    item.dataset.layerId = layer.id;
    item.dataset.index = String(index);
    item.addEventListener('click', () => setActiveLayer(layer.id));

    const main = document.createElement('div');
    main.className = 'layer-main';
    main.draggable = true;

    main.addEventListener('click', (event) => {
      event.stopPropagation();
      setActiveLayer(layer.id);
    });

    main.addEventListener('dragstart', (event) => {
      if (main.dataset.editing === '1' || editingLayerId) {
        event.preventDefault();
        return;
      }

      const dragEvent = event;
      layerDragState.draggingLayerId = layer.id;
      layerDragState.fromIndex = index;
      layerDragState.overIndex = index;
      layerDragState.dropSide = 'after';
      item.classList.add('dragging');
      dragEvent.dataTransfer.effectAllowed = 'move';
      dragEvent.dataTransfer.setData('text/plain', layer.id);
    });

    main.addEventListener('dragend', () => {
      if (editingLayerId) return;
      resetLayerDragState();
      renderLayersUI();
    });

    const nameButton = document.createElement('button');
    nameButton.type = 'button';
    nameButton.className = 'layer-name';
    nameButton.textContent = layer.name;

    const enterEditMode = () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'layer-name-input';
      input.value = layer.name;
      editingLayerId = layer.id;
      main.dataset.editing = '1';
      main.draggable = false;
      main.replaceChild(input, nameButton);
      input.focus();
      input.select();

      let isHandled = false;
      const commit = () => {
        if (isHandled) return;
        isHandled = true;
        editingLayerId = null;
        delete main.dataset.editing;
        main.draggable = true;
        const success = renameLayer(layer.id, input.value);
        if (!success) {
          renderLayersUI();
          return;
        }
        renderLayersUI();
      };
      const cancel = () => {
        if (isHandled) return;
        isHandled = true;
        editingLayerId = null;
        delete main.dataset.editing;
        main.draggable = true;
        renderLayersUI();
      };

      input.addEventListener('mousedown', (event) => {
        event.stopPropagation();
      });
      input.addEventListener('mousemove', (event) => {
        event.stopPropagation();
      });
      input.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Enter') {
          event.preventDefault();
          commit();
        }
        if (event.key === 'Escape') {
          event.preventDefault();
          cancel();
        }
      });
      input.addEventListener('blur', commit);
    };

    nameButton.addEventListener('dblclick', (event) => {
      event.stopPropagation();
      enterEditMode();
    });

    main.append(nameButton);

    const toggleButton = document.createElement('button');
    toggleButton.type = 'button';
    toggleButton.className = 'layer-visibility';
    toggleButton.textContent = layer.visible ? 'Hide' : 'Show';
    toggleButton.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleLayerVisibility(layer.id);
    });

    item.addEventListener('dragover', (event) => {
      event.preventDefault();
      if (!layerDragState.draggingLayerId || editingLayerId) return;
      const bounds = item.getBoundingClientRect();
      const offsetY = event.clientY - bounds.top;
      layerDragState.overIndex = index;
      layerDragState.dropSide = offsetY < bounds.height / 2 ? 'before' : 'after';
      item.classList.toggle('drop-before', layerDragState.dropSide === 'before');
      item.classList.toggle('drop-after', layerDragState.dropSide === 'after');
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drop-before', 'drop-after');
    });

    item.addEventListener('drop', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (layerDragState.fromIndex < 0 || layerDragState.overIndex < 0 || editingLayerId) return;

      let toIndex = layerDragState.overIndex;
      if (layerDragState.dropSide === 'after') toIndex += 1;
      if (layerDragState.fromIndex < toIndex) toIndex -= 1;

      const changed = reorderLayers(layerDragState.fromIndex, toIndex);
      item.classList.remove('drop-before', 'drop-after');
      if (changed) {
        renderLayersUI();
      }
    });

    const arrows = document.createElement('div');
    arrows.className = 'layer-arrows';

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
    count.className = 'layer-count';
    count.textContent = `${layer.objects.length}`;

    arrows.append(upButton, downButton);
    item.append(main, toggleButton, arrows, count);
    refs.layersList.append(item);
  });
};

export const renderLayers = renderLayersUI;

export const renderConnections = () => {
  const { map } = getState();
  refs.connectionsList.innerHTML = '';
  for (const layer of map.layers) {
    if (!layer.visible) continue;
    for (const conn of layer.connections || []) {
      const item = document.createElement('li');
      item.textContent = `${conn.from} → ${conn.to}`;
      refs.connectionsList.append(item);
    }
  }
};

export const renderProperties = () => {
  const { selectedObjectIds } = getState();
  const selectedObjects = selectedObjectIds.map((id) => findObjectById(id)).filter(Boolean);
  renderPropertiesPanel(selectedObjects);
};

export const bindPropertiesForm = () => {
  refs.propertiesForm.addEventListener('input', (event) => {
    const selected = findObjectById(getState().selectedObjectId);
    if (!selected) return;
    if (event.target?.name === 'layerId' || event.target?.name === 'type') return;

    const form = event.currentTarget;
    const updated = {
      ...selected,
      id: form.elements.id.value.trim() || selected.id,
      x: Number(form.elements.x.value),
      y: Number(form.elements.y.value),
      scale: Math.max(0.05, Number(form.elements.scale.value) || 1),
      rotate: Number(form.elements.rotate.value) || 0,
      layerId: selected.layerId
    };

    if (selected.type === 'circle') {
      updated.radiusX = Math.max(1, Number(form.elements.radiusX.value) || Number(selected.radiusX) || Number(selected.radius) || 30);
      updated.radiusY = Math.max(1, Number(form.elements.radiusY.value) || Number(selected.radiusY) || Number(selected.radius) || 30);
      updated.radius = Math.max(updated.radiusX, updated.radiusY);
    }

    if (selected.type === 'square' || selected.type === 'image') {
      const minSize = selected.type === 'image' ? 8 : 2;
      updated.width = Math.max(minSize, Number(form.elements.width.value) || Number(selected.width) || Number(selected.size) || 50);
      updated.height = Math.max(minSize, Number(form.elements.height.value) || Number(selected.height) || Number(selected.size) || 50);
      if (selected.type === 'square') updated.size = Math.max(updated.width, updated.height);
    }

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
  const name = prompt('Layer name', `Layer ${Date.now()}`);
  if (!name) return;
  addLayer(name.trim());
};
