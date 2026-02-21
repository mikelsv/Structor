import {
  addLayer,
  findObjectById,
  findSelectableById,
  getState,
  moveLayerDown,
  moveLayerUp,
  renameLayer,
  reorderLayers,
  removeConnection,
  removeObject,
  renameObjectId,
  selectObject,
  setActiveLayer,
  setTool,
  toggleLayerVisibility,
  updateObjectLayer,
  upsertObject
} from './state.js';
import { history, pushHistory, getConnectionSnapshot } from './history.js';
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
let lastHistoryAutoScrollKey = '';

const panelVisibility = {
  connections: true,
  history: true
};

const syncPanelToggleButtons = () => {
  if (refs.connectionsToggle) refs.connectionsToggle.textContent = panelVisibility.connections ? 'Hide' : 'Show';
  if (refs.historyToggle) refs.historyToggle.textContent = panelVisibility.history ? 'Hide' : 'Show';
  if (refs.connectionsContent) refs.connectionsContent.hidden = !panelVisibility.connections;
  if (refs.historyContent) refs.historyContent.hidden = !panelVisibility.history;
};

const bindSidePanelToggles = () => {
  refs.connectionsToggle?.addEventListener('click', () => {
    panelVisibility.connections = !panelVisibility.connections;
    syncPanelToggleButtons();
  });
  refs.historyToggle?.addEventListener('click', () => {
    panelVisibility.history = !panelVisibility.history;
    syncPanelToggleButtons();
  });
  syncPanelToggleButtons();
};

export const refs = {
  canvas: byId('editor-canvas'),
  layersList: byId('layers-list'),
  connectionsList: byId('connections-list'),
  propertiesForm: byId('properties-form'),
  selectionState: byId('selection-state'),
  hint: byId('editor-hint'),
  mapPath: byId('map-path'),
  historyList: byId('history-list'),
  connectionsToggle: byId('toggle-connections'),
  historyToggle: byId('toggle-history'),
  connectionsContent: byId('connections-content'),
  historyContent: byId('history-content')
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

const fillConnectionForm = (connection) => {
  const form = refs.propertiesForm;
  form.elements.type.value = 'connection';
  form.elements.id.value = connection.id;
  form.elements.x.value = connection.fromId;
  form.elements.y.value = connection.toId;
  form.elements.radiusX.value = '';
  form.elements.radiusY.value = '';
  form.elements.width.value = '';
  form.elements.height.value = '';
  form.elements.scale.value = '';
  form.elements.rotate.value = '';
  form.elements.layerId.value = connection.layerId;
  form.querySelector('[data-field-group="radius"]').hidden = true;
  form.querySelector('[data-field-group="size"]').hidden = true;
};

export const clearPropertiesPanel = () => {
  const form = refs.propertiesForm;
  form.elements.type.value = '';
  form.elements.id.value = '';
  form.elements.x.value = '';
  form.elements.y.value = '';
  form.elements.radiusX.value = '';
  form.elements.radiusY.value = '';
  form.elements.width.value = '';
  form.elements.height.value = '';
  form.elements.scale.value = '';
  form.elements.rotate.value = '';
  form.elements.layerId.value = '';
  form.hidden = true;
};

export const updatePropertiesPanel = (selectedObject) => {
  ensureLayerOptions();
  const { cursor } = getState();
  const form = refs.propertiesForm;

  if (!selectedObject) {
    refs.selectionState.textContent = `Cursor: worldX ${cursor.worldX}, worldY ${cursor.worldY}`;
    clearPropertiesPanel();
    return;
  }

  refs.selectionState.textContent = `Selected: ${selectedObject.id} (${selectedObject.type})`;
  form.hidden = false;

  if (selectedObject.type === 'connection') {
    fillConnectionForm(selectedObject);
    return;
  }

  fillSingleSelectionForm(selectedObject);
};

export const renderPropertiesPanel = (selectedObjects) => {
  if (!selectedObjects.length) {
    updatePropertiesPanel(null);
    return;
  }

  if (selectedObjects.length > 1) {
    const geometricSelection = selectedObjects.filter((entry) => entry.type !== 'connection');
    if (geometricSelection.length) {
      const bounds = getSelectionBounds(geometricSelection);
      refs.selectionState.textContent = `Selected: ${selectedObjects.length} | Bounding box: ${bounds.width} × ${bounds.height}`;
    } else {
      refs.selectionState.textContent = `Selected: ${selectedObjects.length}`;
    }
    refs.propertiesForm.hidden = true;
    return;
  }

  updatePropertiesPanel(selectedObjects[0]);
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
  bindSidePanelToggles();
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

      const fromIndex = layerDragState.fromIndex;
      const changed = reorderLayers(fromIndex, toIndex);
      item.classList.remove('drop-before', 'drop-after');
      if (changed) {
        pushHistory('changeLayerOrder', { fromIndex, toIndex }, { label: `Reorder layer ${layer.name}` });
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
      const fromIndex = index;
      const changed = moveLayerUp(layer.id);
      if (changed) pushHistory('changeLayerOrder', { fromIndex, toIndex: fromIndex - 1 }, { label: `Reorder layer ${layer.name}` });
    });

    const downButton = document.createElement('button');
    downButton.type = 'button';
    downButton.textContent = '↓';
    downButton.disabled = index === map.layers.length - 1;
    downButton.addEventListener('click', (event) => {
      event.stopPropagation();
      const fromIndex = index;
      const changed = moveLayerDown(layer.id);
      if (changed) pushHistory('changeLayerOrder', { fromIndex, toIndex: fromIndex + 1 }, { label: `Reorder layer ${layer.name}` });
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
  const visibleObjectIds = new Set(
    map.layers.filter((layer) => layer.visible).flatMap((layer) => layer.objects.map((obj) => obj.id))
  );
  refs.connectionsList.innerHTML = '';
  for (const layer of map.layers.filter((entry) => entry.visible)) {
    for (const conn of (layer.connections || []).filter((entry) => visibleObjectIds.has(entry.fromId) && visibleObjectIds.has(entry.toId))) {
      const item = document.createElement('li');
      item.textContent = `${conn.fromId} → ${conn.toId}`;
      refs.connectionsList.append(item);
    }
  }
};

export const renderProperties = () => {
  const { selectedObjectIds } = getState();
  const selectedObjects = selectedObjectIds.map((id) => findSelectableById(id)).filter(Boolean);
  renderPropertiesPanel(selectedObjects);
};


export const renderHistory = () => {
  const currentIndex = history.getCurrentIndex();
  const timeline = history.getTimeline();
  const activeActionId = currentIndex >= 0 ? timeline[currentIndex]?.id || '' : '';
  const autoScrollKey = `${currentIndex}:${timeline.length}:${activeActionId}`;
  refs.historyList.innerHTML = '';

  let activeItem = null;

  timeline.forEach((action, index) => {
    const item = document.createElement('li');
    const stateClass = index === currentIndex ? 'active' : index > currentIndex ? 'inactive' : '';
    item.className = `history-item ${stateClass}`.trim();
    const time = new Date(action.timestamp).toLocaleTimeString();
    item.textContent = `[${index + 1}] ${action.label} (${time})`;
    item.addEventListener('click', () => history.goTo(index));
    if (index === currentIndex) activeItem = item;
    refs.historyList.append(item);
  });

  if (autoScrollKey !== lastHistoryAutoScrollKey && activeItem && refs.historyContent && !refs.historyContent.hidden) {
    activeItem.scrollIntoView({ block: 'nearest' });
  }
  lastHistoryAutoScrollKey = autoScrollKey;
};

export const bindPropertiesForm = () => {
  refs.propertiesForm.addEventListener('input', (event) => {
    const selected = findSelectableById(getState().selectedObjectId);
    if (!selected || selected.type === 'connection') return;
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

    const before = JSON.parse(JSON.stringify(selected));
    if (updated.id !== selected.id) {
      const success = renameObjectId(selected.id, updated.id);
      if (!success) {
        form.elements.id.value = selected.id;
        return;
      }
      selectObject(updated.id);
    }
    upsertObject(updated);
    pushHistory('updateProperty', { before, after: JSON.parse(JSON.stringify(updated)) }, { label: `Update ${updated.id}` });
  });

  refs.propertiesForm.elements.layerId.addEventListener('change', (event) => {
    const selected = findSelectableById(getState().selectedObjectId);
    if (!selected || selected.type === 'connection') return;
    const before = JSON.parse(JSON.stringify(selected));
    updateObjectLayer(selected.id, event.target.value);
    const after = findObjectById(selected.id);
    if (after) pushHistory('updateProperty', { before, after: JSON.parse(JSON.stringify(after)) }, { label: `Move ${selected.id} to layer` });
  });

  byId('delete-object').addEventListener('click', () => {
    const selected = findSelectableById(getState().selectedObjectId);
    if (!selected) return;
    if (selected.type === 'connection') {
      const snapshot = getConnectionSnapshot(selected.id);
      removeConnection(selected.id);
      if (snapshot) pushHistory('deleteConnection', { connection: snapshot }, { label: `Delete connection ${snapshot.fromId} → ${snapshot.toId}` });
      return;
    }
    const snapshot = JSON.parse(JSON.stringify(selected));
    removeObject(selected.id);
    pushHistory('deleteObject', { object: snapshot }, { label: `Delete ${snapshot.id}` });
  });
};

export const attachLayerCreationPrompt = () => {
  const name = prompt('Layer name', `Layer ${Date.now()}`);
  if (!name) return;
  addLayer(name.trim());
};
