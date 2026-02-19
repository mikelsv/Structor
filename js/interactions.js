import {
  addConnection,
  createObject,
  findObjectById,
  getState,
  selectObject,
  setViewport
} from './state.js';
import { hitTestObject, worldPointFromMouse } from './renderer.js';

export const bindCanvasInteractions = (canvas) => {
  canvas.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    const point = worldPointFromMouse(canvas, event.clientX, event.clientY);
    const hit = hitTestObject(point.x, point.y);
    const state = getState();

    if (state.tool === 'create-circle') {
      createObject('circle', Math.round(point.x), Math.round(point.y));
      return;
    }

    if (state.tool === 'create-square') {
      createObject('square', Math.round(point.x), Math.round(point.y));
      return;
    }

    if (state.tool === 'create-connection') {
      if (hit) {
        if (!state.pendingConnectionFrom) {
          state.pendingConnectionFrom = hit.id;
          selectObject(hit.id);
        } else {
          addConnection(state.pendingConnectionFrom, hit.id);
          state.pendingConnectionFrom = null;
        }
      }
      return;
    }

    if (hit) {
      selectObject(hit.id);
      state.drag.mode = 'object';
      state.drag.objectId = hit.id;
      state.drag.startX = point.x;
      state.drag.startY = point.y;
      state.drag.originX = hit.x;
      state.drag.originY = hit.y;
    } else {
      selectObject(null);
      state.drag.mode = 'pan';
      state.drag.startX = event.clientX;
      state.drag.startY = event.clientY;
      state.drag.originX = state.map.viewport.offsetX;
      state.drag.originY = state.map.viewport.offsetY;
    }
  });

  window.addEventListener('mousemove', (event) => {
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

    if (state.drag.mode === 'object' && state.drag.objectId) {
      const point = worldPointFromMouse(canvas, event.clientX, event.clientY);
      const target = findObjectById(state.drag.objectId);
      if (!target) return;
      target.x = Math.round(state.drag.originX + (point.x - state.drag.startX));
      target.y = Math.round(state.drag.originY + (point.y - state.drag.startY));
    }
  });

  window.addEventListener('mouseup', () => {
    const state = getState();
    state.drag.mode = null;
    state.drag.objectId = null;
  });

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const state = getState();

    if (event.ctrlKey) {
      const direction = event.deltaY > 0 ? -1 : 1;
      const nextZoom = Math.max(0.2, Math.min(4, state.map.viewport.zoom + direction * 0.1));
      const world = worldPointFromMouse(canvas, event.clientX, event.clientY);
      setViewport({
        zoom: nextZoom,
        offsetX: event.clientX - canvas.getBoundingClientRect().left - world.x * nextZoom,
        offsetY: event.clientY - canvas.getBoundingClientRect().top - world.y * nextZoom
      });
      return;
    }

    const speed = 0.9;
    setViewport({
      offsetX: state.map.viewport.offsetX - (event.shiftKey ? event.deltaY : event.deltaX) * speed,
      offsetY: state.map.viewport.offsetY - (!event.shiftKey ? event.deltaY : 0) * speed
    });
  }, { passive: false });
};
