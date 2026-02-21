import {
  addConnectionRecord,
  findConnectionById,
  findObjectById,
  removeConnection,
  removeObject,
  reorderLayers,
  upsertObject
} from './state.js';

const uid = () => `action_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const clone = (value) => JSON.parse(JSON.stringify(value));

export class HistoryManager {
  constructor(limit = 50) {
    this.limit = limit;
    this.past = [];
    this.future = [];
    this.isApplying = false;
  }

  push(action) {
    if (!action) return;
    if (this.future.length) this.future = [];
    this.past.push(action);
    if (this.past.length > this.limit) this.past.shift();
  }

  undo() {
    if (!this.past.length) return;
    const action = this.past.pop();
    this.isApplying = true;
    try {
      action.undo();
    } finally {
      this.isApplying = false;
    }
    this.future.push(action);
  }

  redo() {
    if (!this.future.length) return;
    const action = this.future.pop();
    this.isApplying = true;
    try {
      action.redo();
    } finally {
      this.isApplying = false;
    }
    this.past.push(action);
  }

  goTo(index) {
    const current = this.past.length - 1;
    if (index === current) return;
    if (index < current) {
      for (let i = current; i > index; i -= 1) this.undo();
      return;
    }
    for (let i = current; i < index; i += 1) this.redo();
  }

  clear() {
    this.past = [];
    this.future = [];
  }

  serialize() {
    return {
      limit: this.limit,
      past: this.past.map(serializeAction),
      future: this.future.map(serializeAction)
    };
  }

  restore(raw) {
    this.limit = Number(raw?.limit) || this.limit;
    this.past = Array.isArray(raw?.past) ? raw.past.map(deserializeAction).filter(Boolean) : [];
    this.future = Array.isArray(raw?.future) ? raw.future.map(deserializeAction).filter(Boolean) : [];
    if (this.past.length > this.limit) this.past = this.past.slice(-this.limit);
  }

  getCurrentIndex() {
    return this.past.length - 1;
  }
}

const makeAction = ({ id, type, timestamp, label, payload }, undo, redo) => ({
  id: id || uid(),
  type,
  timestamp: timestamp || Date.now(),
  label,
  payload,
  undo,
  redo
});

const recordMove = (payload, meta = {}) =>
  makeAction(
    {
      ...meta,
      type: 'moveObject',
      label: meta.label || `Move ${payload.objectId}`,
      payload
    },
    () => {
      const obj = findObjectById(payload.objectId);
      if (!obj) return;
      obj.x = payload.from.x;
      obj.y = payload.from.y;
    },
    () => {
      const obj = findObjectById(payload.objectId);
      if (!obj) return;
      obj.x = payload.to.x;
      obj.y = payload.to.y;
    }
  );

const recordAddObject = (payload, meta = {}) =>
  makeAction(
    {
      ...meta,
      type: 'addObject',
      label: meta.label || `Add ${payload.object.id}`,
      payload
    },
    () => removeObject(payload.object.id),
    () => upsertObject(clone(payload.object))
  );

const recordDeleteObject = (payload, meta = {}) =>
  makeAction(
    {
      ...meta,
      type: 'deleteObject',
      label: meta.label || `Delete ${payload.object.id}`,
      payload
    },
    () => upsertObject(clone(payload.object)),
    () => removeObject(payload.object.id)
  );

const recordUpdateProperty = (payload, meta = {}) =>
  makeAction(
    {
      ...meta,
      type: 'updateProperty',
      label: meta.label || `Update ${payload.after.id}`,
      payload
    },
    () => upsertObject(clone(payload.before)),
    () => upsertObject(clone(payload.after))
  );

const recordAddConnection = (payload, meta = {}) =>
  makeAction(
    {
      ...meta,
      type: 'addConnection',
      label: meta.label || `Connect ${payload.connection.fromId} → ${payload.connection.toId}`,
      payload
    },
    () => removeConnection(payload.connection.id),
    () => addConnectionRecord(clone(payload.connection))
  );

const recordDeleteConnection = (payload, meta = {}) =>
  makeAction(
    {
      ...meta,
      type: 'deleteConnection',
      label: meta.label || `Delete connection ${payload.connection.id}`,
      payload
    },
    () => addConnectionRecord(clone(payload.connection)),
    () => removeConnection(payload.connection.id)
  );

const recordLayerOrder = (payload, meta = {}) =>
  makeAction(
    {
      ...meta,
      type: 'changeLayerOrder',
      label: meta.label || 'Change layer order',
      payload
    },
    () => reorderLayers(payload.toIndex, payload.fromIndex),
    () => reorderLayers(payload.fromIndex, payload.toIndex)
  );

const actionBuilders = {
  moveObject: recordMove,
  addObject: recordAddObject,
  deleteObject: recordDeleteObject,
  updateProperty: recordUpdateProperty,
  addConnection: recordAddConnection,
  deleteConnection: recordDeleteConnection,
  changeLayerOrder: recordLayerOrder
};

export const createHistoryAction = (type, payload, meta = {}) => {
  const builder = actionBuilders[type];
  if (!builder) return null;
  return builder(payload, meta);
};

const serializeAction = (action) => ({
  id: action.id,
  type: action.type,
  timestamp: action.timestamp,
  label: action.label,
  payload: clone(action.payload)
});

const deserializeAction = (data) => createHistoryAction(data.type, data.payload, data);

export const history = new HistoryManager(50);

export const pushHistory = (type, payload, meta = {}) => {
  if (history.isApplying) return;
  const action = createHistoryAction(type, payload, meta);
  if (!action) return;
  history.push(action);
};

export const exportHistory = () => history.serialize();

export const importHistory = (raw) => history.restore(raw || {});

export const getConnectionSnapshot = (connectionId) => {
  const connection = findConnectionById(connectionId);
  return connection ? clone(connection) : null;
};
