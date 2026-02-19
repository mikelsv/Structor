const DEFAULT_LAYER_ID = 'layer_1';

const makeLayer = (id) => ({
  id,
  visible: true,
  objects: []
});

export const createEmptyMap = () => ({
  version: 1,
  background: '',
  viewport: {
    zoom: 1,
    offsetX: 0,
    offsetY: 0
  },
  layers: [makeLayer(DEFAULT_LAYER_ID)],
  connections: []
});

const state = {
  map: createEmptyMap(),
  activeLayerId: DEFAULT_LAYER_ID,
  tool: 'select',
  selectedObjectId: null,
  selectedObjectIds: [],
  pendingConnectionFrom: null,
  drag: {
    mode: null,
    objectId: null,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0
  },
  ids: {
    object: 1,
    layer: 2
  }
};

export const getState = () => state;
export const allObjects = () => state.map.layers.flatMap((layer) => layer.objects);
export const findObjectById = (id) => allObjects().find((obj) => obj.id === id);

export const setTool = (tool) => {
  state.tool = tool;
  state.pendingConnectionFrom = null;
};

export const addLayer = (name = null) => {
  const id = name || `layer_${state.ids.layer++}`;
  state.map.layers.push(makeLayer(id));
  state.activeLayerId = id;
  return id;
};

export const setActiveLayer = (layerId) => {
  state.activeLayerId = layerId;
};

export const toggleLayerVisibility = (layerId) => {
  const layer = state.map.layers.find((entry) => entry.id === layerId);
  if (layer) layer.visible = !layer.visible;
};

export const upsertObject = (obj) => {
  const sourceLayer = state.map.layers.find((entry) => entry.objects.some((item) => item.id === obj.id));
  if (sourceLayer && sourceLayer.id !== obj.layerId) {
    sourceLayer.objects = sourceLayer.objects.filter((item) => item.id !== obj.id);
  }

  const targetLayer = state.map.layers.find((entry) => entry.id === obj.layerId);
  if (!targetLayer) return false;

  const index = targetLayer.objects.findIndex((entry) => entry.id === obj.id);
  if (index >= 0) targetLayer.objects[index] = obj;
  else targetLayer.objects.push(obj);
  return true;
};

export const createObject = (type, x, y) => {
  const id = `node_${state.ids.object++}`;
  const base = { type, id, x, y, layerId: state.activeLayerId };
  if (type === 'circle') base.radius = 30;
  if (type === 'square') base.size = 50;
  upsertObject(base);
  selectObject(id);
  return base;
};

export const createObjectWithBounds = (type, payload) => {
  const id = `node_${state.ids.object++}`;
  const base = { type, id, layerId: state.activeLayerId };
  if (type === 'circle') {
    base.x = payload.x;
    base.y = payload.y;
    base.radiusX = Math.max(1, Number(payload.radiusX) || Number(payload.radius) || 30);
    base.radiusY = Math.max(1, Number(payload.radiusY) || Number(payload.radius) || 30);
    base.radius = Math.max(base.radiusX, base.radiusY);
  }
  if (type === 'square') {
    base.x = payload.x;
    base.y = payload.y;
    base.width = Math.max(2, Number(payload.width) || Number(payload.size) || 50);
    base.height = Math.max(2, Number(payload.height) || Number(payload.size) || 50);
    base.size = Math.max(base.width, base.height);
  }
  upsertObject(base);
  selectObject(id);
  return base;
};

export const renameObjectId = (oldId, newId) => {
  if (oldId === newId || findObjectById(newId)) return false;
  const obj = findObjectById(oldId);
  if (!obj) return false;
  obj.id = newId;
  state.map.connections.forEach((conn) => {
    if (conn.from === oldId) conn.from = newId;
    if (conn.to === oldId) conn.to = newId;
  });
  if (state.selectedObjectId === oldId) state.selectedObjectId = newId;
  return true;
};

export const removeObject = (id) => {
  for (const layer of state.map.layers) {
    const len = layer.objects.length;
    layer.objects = layer.objects.filter((obj) => obj.id !== id);
    if (layer.objects.length !== len) {
      state.map.connections = state.map.connections.filter((conn) => conn.from !== id && conn.to !== id);
      if (state.selectedObjectId === id) state.selectedObjectId = null;
      state.selectedObjectIds = state.selectedObjectIds.filter((entry) => entry !== id);
      return true;
    }
  }
  return false;
};

export const selectObject = (id) => {
  state.selectedObjectId = id;
  state.selectedObjectIds = id ? [id] : [];
};

export const selectObjects = (ids) => {
  const normalized = [...new Set(ids)].filter((id) => findObjectById(id));
  state.selectedObjectIds = normalized;
  state.selectedObjectId = normalized[0] || null;
};

export const toggleObjectSelection = (id) => {
  if (!findObjectById(id)) return;
  if (state.selectedObjectIds.includes(id)) {
    state.selectedObjectIds = state.selectedObjectIds.filter((entry) => entry !== id);
  } else {
    state.selectedObjectIds = [...state.selectedObjectIds, id];
  }
  state.selectedObjectId = state.selectedObjectIds[0] || null;
};

export const setMap = (mapData) => {
  state.map = mapData;
  state.activeLayerId = mapData.layers[0]?.id || DEFAULT_LAYER_ID;
  state.selectedObjectId = null;
  state.selectedObjectIds = [];
  state.pendingConnectionFrom = null;

  const objectIds = allObjects().map((obj) => Number.parseInt(String(obj.id).split('_')[1], 10)).filter(Number.isFinite);
  const layerIds = mapData.layers.map((layer) => Number.parseInt(String(layer.id).split('_')[1], 10)).filter(Number.isFinite);
  state.ids.object = (objectIds.length ? Math.max(...objectIds) : 0) + 1;
  state.ids.layer = (layerIds.length ? Math.max(...layerIds) : 1) + 1;
};

export const setBackground = (path) => {
  state.map.background = path;
};

export const setViewport = (nextViewport) => {
  state.map.viewport = { ...state.map.viewport, ...nextViewport };
};

export const addConnection = (fromId, toId) => {
  if (fromId === toId) return;
  if (!findObjectById(fromId) || !findObjectById(toId)) return;
  const exists = state.map.connections.some((conn) => conn.from === fromId && conn.to === toId);
  if (!exists) state.map.connections.push({ from: fromId, to: toId });
};

export const serializeMap = () => JSON.stringify(state.map, null, 2);

export const validateAndNormalizeMap = (raw) => {
  if (!raw || typeof raw !== 'object') throw new Error('Map JSON must be an object');
  const map = createEmptyMap();
  map.background = typeof raw.background === 'string' ? raw.background : '';
  map.viewport = {
    zoom: Number(raw.viewport?.zoom) || 1,
    offsetX: Number(raw.viewport?.offsetX) || 0,
    offsetY: Number(raw.viewport?.offsetY) || 0
  };

  if (!Array.isArray(raw.layers) || raw.layers.length === 0) throw new Error('Map must have at least one layer');

  map.layers = raw.layers.map((layer, index) => {
    const layerId = String(layer.id || `layer_${index + 1}`);
    return {
      id: layerId,
      visible: layer.visible !== false,
      objects: Array.isArray(layer.objects)
        ? layer.objects
            .filter((obj) => obj && obj.id && (obj.type === 'circle' || obj.type === 'square'))
            .map((obj) => ({
              type: obj.type,
              id: String(obj.id),
              x: Number(obj.x) || 0,
              y: Number(obj.y) || 0,
              layerId,
              radius: obj.type === 'circle' ? Math.max(1, Number(obj.radius) || 30) : undefined,
              radiusX: obj.type === 'circle' ? Math.max(1, Number(obj.radiusX) || Number(obj.radius) || 30) : undefined,
              radiusY: obj.type === 'circle' ? Math.max(1, Number(obj.radiusY) || Number(obj.radius) || 30) : undefined,
              size: obj.type === 'square' ? Math.max(2, Number(obj.size) || 50) : undefined,
              width: obj.type === 'square' ? Math.max(2, Number(obj.width) || Number(obj.size) || 50) : undefined,
              height: obj.type === 'square' ? Math.max(2, Number(obj.height) || Number(obj.size) || 50) : undefined
            }))
        : []
    };
  });

  const ids = new Set(map.layers.flatMap((layer) => layer.objects.map((obj) => obj.id)));
  map.connections = Array.isArray(raw.connections)
    ? raw.connections.filter((conn) => ids.has(conn.from) && ids.has(conn.to)).map((conn) => ({ from: conn.from, to: conn.to }))
    : [];

  return map;
};
