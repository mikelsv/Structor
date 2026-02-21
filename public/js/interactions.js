import {
  addConnection,
  createObjectWithBounds,
  findObjectById,
  findSelectableById,
  getState,
  removeConnection,
  removeObject,
  selectObject,
  selectObjects,
  setTool,
  setCursorWorld,
  setViewport,
  toggleObjectSelection
} from './state.js';
import { uploadImageForMap } from './fileManager.js';
import { getConnectionSnapshot, history, pushHistory } from './history.js';
import { getObjectBounds, hitTestConnection, hitTestObject, worldPointFromMouse } from './renderer.js';

const isInteractiveElement = (target) =>
  target instanceof HTMLElement &&
  (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);

const syncSelectToolUi = () => {
  const selectButton = document.querySelector('[data-tool="select"]');
  if (selectButton) {
    document.querySelectorAll('[data-tool]').forEach((entry) => entry.classList.toggle('active', entry === selectButton));
  }
  const hint = document.getElementById('editor-hint');
  if (hint) hint.textContent = 'Tool: Select.';
};

const clampZoom = (zoom) => Math.max(0.2, Math.min(4, zoom));

const zoomAtPoint = (canvas, clientX, clientY, deltaY) => {
  const state = getState();
  const rect = canvas.getBoundingClientRect();
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const world = worldPointFromMouse(canvas, clientX, clientY);
  const factor = deltaY > 0 ? 0.9 : 1.1;
  const nextZoom = clampZoom(state.map.viewport.zoom * factor);

  setViewport({
    zoom: nextZoom,
    offsetX: localX - world.x * nextZoom,
    offsetY: localY - world.y * nextZoom
  });
};

const rectangleContainsObject = (rect, obj) => {
  const bounds = getObjectBounds(obj);
  return (
    bounds.minX >= rect.minX &&
    bounds.maxX <= rect.maxX &&
    bounds.minY >= rect.minY &&
    bounds.maxY <= rect.maxY
  );
};

const buildObjectAtDrag = (tool, start, end, shiftKey, altKey) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  const width = Math.max(4, Math.round(absX * (altKey ? 1 : 2)));
  const height = Math.max(4, Math.round(absY * (altKey ? 1 : 2)));

  if (tool === 'create-circle') {
    const radiusX = shiftKey ? Math.max(4, Math.round(Math.max(absX, absY))) : Math.max(4, Math.round(absX));
    const radiusY = shiftKey ? radiusX : Math.max(4, Math.round(absY));
    if (altKey) {
      return {
        type: 'circle',
        x: Math.round(start.x + radiusX),
        y: Math.round(start.y + radiusY),
        radiusX,
        radiusY,
        radius: Math.max(radiusX, radiusY)
      };
    }
    return {
      type: 'circle',
      x: Math.round(start.x),
      y: Math.round(start.y),
      radiusX,
      radiusY,
      radius: Math.max(radiusX, radiusY)
    };
  }
  const nextWidth = shiftKey ? Math.max(width, height) : width;
  const nextHeight = shiftKey ? nextWidth : height;

  if (altKey) {
    return {
      type: 'square',
      x: Math.round(start.x + (dx >= 0 ? nextWidth / 2 : -nextWidth / 2)),
      y: Math.round(start.y + (dy >= 0 ? nextHeight / 2 : -nextHeight / 2)),
      width: nextWidth,
      height: nextHeight,
      size: Math.max(nextWidth, nextHeight)
    };
  }

  return {
    type: 'square',
    x: Math.round(start.x),
    y: Math.round(start.y),
    width: nextWidth,
    height: nextHeight,
    size: Math.max(nextWidth, nextHeight)
  };
};



const findVisibleConnectionAt = (worldX, worldY) => {
  const { map } = getState();
  for (let layerIndex = map.layers.length - 1; layerIndex >= 0; layerIndex -= 1) {
    const layer = map.layers[layerIndex];
    if (!layer.visible) continue;
    const connections = layer.connections || [];
    for (let i = connections.length - 1; i >= 0; i -= 1) {
      const conn = connections[i];
      if (hitTestConnection(worldX, worldY, conn)) return conn;
    }
  }
  return null;
};

export const handleMouseDown = (canvas, event) => {
  const state = getState();
  const point = worldPointFromMouse(canvas, event.clientX, event.clientY);
  const hit = hitTestObject(point.x, point.y);
  const hitConnection = state.tool === 'select' ? findVisibleConnectionAt(point.x, point.y) : null;

  if (event.button === 0) {
    if (state.tool === 'create-circle' || state.tool === 'create-square') {
      state.drag.mode = 'create';
      state.drag.startX = point.x;
      state.drag.startY = point.y;
      state.drag.currentX = point.x;
      state.drag.currentY = point.y;
      state.drag.modShift = event.shiftKey;
      state.drag.modAlt = event.altKey;
      return;
    }

    if (state.tool === 'create-connection') {
      if (!hit) return;
      state.pendingConnectionFrom = hit.id;
      state.drag.mode = 'create-connection';
      state.drag.currentX = point.x;
      state.drag.currentY = point.y;
      state.drag.connectionToId = null;
      state.drag.connectionInvalidTarget = false;
      selectObject(hit.id);
      return;
    }

    if (state.tool !== 'select') return;
    if (hit) {
      if (event.shiftKey) toggleObjectSelection(hit.id);
      else selectObject(hit.id);

      state.drag.mode = 'move-selection';
      state.drag.startX = point.x;
      state.drag.startY = point.y;
      state.drag.origins = state.selectedObjectIds
        .map((id) => findObjectById(id))
        .filter(Boolean)
        .map((obj) => ({ id: obj.id, x: obj.x, y: obj.y }));
      return;
    }

    if (hitConnection) {
      selectObject(hitConnection.id);
      return;
    }

    if (!event.shiftKey) selectObject(null);
    state.drag.mode = 'marquee';
    state.drag.startX = point.x;
    state.drag.startY = point.y;
    state.drag.currentX = point.x;
    state.drag.currentY = point.y;
    return;
  }

  if (event.button === 2) {
    state.drag.mode = 'pan';
    state.drag.startX = event.clientX;
    state.drag.startY = event.clientY;
    state.drag.originX = state.map.viewport.offsetX;
    state.drag.originY = state.map.viewport.offsetY;
  }
};

export const deleteSelected = () => {
  const selected = findSelectableById(getState().selectedObjectId);
  if (!selected) return;
  if (selected.type === 'connection') {
    const snapshot = getConnectionSnapshot(selected.id);
    removeConnection(selected.id);
    if (snapshot) pushHistory('deleteConnection', { connection: snapshot }, { label: `Delete connection ${snapshot.fromId} → ${snapshot.toId}` });
    selectObject(null);
    return;
  }
  const snapshot = JSON.parse(JSON.stringify(selected));
  removeObject(selected.id);
  pushHistory('deleteObject', { object: snapshot }, { label: `Delete ${snapshot.id}` });
  selectObject(null);
};

export const bindCanvasInteractions = (canvas) => {
  canvas.addEventListener('dragover', (event) => {
    event.preventDefault();
  });

  canvas.addEventListener('drop', async (event) => {
    event.preventDefault();
    const [file] = [...(event.dataTransfer?.files || [])];
    if (!file || !file.type.startsWith('image/')) return;

    try {
      const point = worldPointFromMouse(canvas, event.clientX, event.clientY);
      await uploadImageForMap({ file, x: point.x, y: point.y });
    } catch (error) {
      alert(error.message || 'Cannot upload image');
    }
  });

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());


  canvas.addEventListener('mousemove', (event) => {
    const point = worldPointFromMouse(canvas, event.clientX, event.clientY);
    setCursorWorld(point.x, point.y);
  });

  canvas.addEventListener('mousedown', (event) => {
    handleMouseDown(canvas, event);
  });

  window.addEventListener('mousemove', (event) => {
    const point = worldPointFromMouse(canvas, event.clientX, event.clientY);
    setCursorWorld(point.x, point.y);

    const state = getState();
    if (!state.drag.mode) return;

    if (state.drag.mode === 'pan') {
      const dx = event.clientX - state.drag.startX;
      const dy = event.clientY - state.drag.startY;
      setViewport({
        offsetX: state.drag.originX + dx,
        offsetY: state.drag.originY + dy
      });
      return;
    }

    if (state.drag.mode === 'move-selection') {
      const dx = point.x - state.drag.startX;
      const dy = point.y - state.drag.startY;
      for (const origin of state.drag.origins || []) {
        const obj = findObjectById(origin.id);
        if (!obj) continue;
        obj.x = Math.round(origin.x + dx);
        obj.y = Math.round(origin.y + dy);
      }
      return;
    }

    if (state.drag.mode === 'create-connection') {
      const from = findObjectById(state.pendingConnectionFrom);
      const hovered = hitTestObject(point.x, point.y);
      state.drag.currentX = point.x;
      state.drag.currentY = point.y;
      const isCandidate = hovered && hovered.id !== state.pendingConnectionFrom;
      state.drag.connectionToId = isCandidate ? hovered.id : null;
      state.drag.connectionInvalidTarget = Boolean(
        isCandidate && from && hovered.layerId !== from.layerId
      );
      return;
    }

    if (state.drag.mode === 'marquee' || state.drag.mode === 'create') {
      state.drag.currentX = point.x;
      state.drag.currentY = point.y;
      state.drag.modShift = event.shiftKey;
      state.drag.modAlt = event.altKey;
    }
  });

  window.addEventListener('mouseup', (event) => {
    const state = getState();
    const point = worldPointFromMouse(canvas, event.clientX, event.clientY);

    if (state.drag.mode === 'marquee') {
      const minX = Math.min(state.drag.startX, state.drag.currentX);
      const maxX = Math.max(state.drag.startX, state.drag.currentX);
      const minY = Math.min(state.drag.startY, state.drag.currentY);
      const maxY = Math.max(state.drag.startY, state.drag.currentY);
      const selectedIds = state.map.layers
        .filter((layer) => layer.visible)
        .flatMap((layer) => layer.objects)
        .filter((obj) => rectangleContainsObject({ minX, maxX, minY, maxY }, obj))
        .map((obj) => obj.id);
      if (event.shiftKey) {
        selectObjects([...state.selectedObjectIds, ...selectedIds]);
      } else {
        selectObjects(selectedIds);
      }
    }

    if (state.drag.mode === 'create') {
      const start = { x: state.drag.startX, y: state.drag.startY };
      const end = { x: state.drag.currentX, y: state.drag.currentY };
      const built = buildObjectAtDrag(state.tool, start, end, state.drag.modShift, state.drag.modAlt);
      if (built) {
        const created = createObjectWithBounds(built.type, built);
        pushHistory('addObject', { object: JSON.parse(JSON.stringify(created)) }, { label: `Add ${created.id}` });
      }
    }

    if (state.drag.mode === 'create-connection') {
      const fromId = state.pendingConnectionFrom;
      const from = fromId ? findObjectById(fromId) : null;
      const hovered = hitTestObject(point.x, point.y);
      const toId = state.drag.connectionToId || (hovered && hovered.id !== fromId ? hovered.id : null);
      const to = toId ? findObjectById(toId) : null;
      if (fromId && toId && from && to && from.layerId === to.layerId) {
        const created = addConnection(fromId, toId);
        if (created) pushHistory('addConnection', { connection: JSON.parse(JSON.stringify(created)) });
        selectObject(toId);
      }
      state.pendingConnectionFrom = null;
      state.drag.connectionToId = null;
      state.drag.connectionInvalidTarget = false;
    }

    state.drag.mode = null;
    if (state.drag.origins?.length) {
      state.drag.origins.forEach((origin) => {
        const obj = findObjectById(origin.id);
        if (!obj) return;
        const to = { x: Math.round(obj.x), y: Math.round(obj.y) };
        const from = { x: Math.round(origin.x), y: Math.round(origin.y) };
        if (to.x === from.x && to.y === from.y) return;
        pushHistory('moveObject', { objectId: origin.id, from, to }, { label: `Move ${origin.id}` });
      });
    }
    state.drag.objectId = null;
    state.drag.origins = null;
  });

  window.addEventListener(
    'wheel',
    (event) => {
      if (isInteractiveElement(event.target)) return;
      event.preventDefault();
      zoomAtPoint(canvas, event.clientX, event.clientY, event.deltaY);
    },
    { passive: false }
  );

  window.addEventListener('keydown', (event) => {
    if (isInteractiveElement(event.target)) return;
    const state = getState();

    if (event.key === 'Escape') {
      if (state.drag.mode === 'create') {
        state.drag.mode = null;
        state.drag.objectId = null;
        state.drag.origins = null;
        state.drag.connectionToId = null;
        state.drag.connectionInvalidTarget = false;
        state.pendingConnectionFrom = null;
        return;
      }

      if (state.drag.mode === 'create-connection') {
        state.drag.mode = null;
        state.drag.connectionToId = null;
        state.drag.connectionInvalidTarget = false;
        state.pendingConnectionFrom = null;
        return;
      }

      if (state.tool !== 'select') {
        event.preventDefault();
        setTool('select');
        syncSelectToolUi();
      }
      return;
    }

    if (event.key === 'Delete') {
      event.preventDefault();
      deleteSelected();
      return;
    }

    if (event.ctrlKey && !event.shiftKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      history.undo();
      return;
    }

    if (event.ctrlKey && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      history.redo();
    }
  });
};
