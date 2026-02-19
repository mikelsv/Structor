import { allObjects, findObjectById, getState } from './state.js';
import { buildMapImageUrl } from './fileManager.js';

const bgImage = new Image();
let bgLoadedPath = '';
const imageCache = new Map();

const getObjectImage = (obj) => {
  if (obj.type !== 'image' || !obj.file) return null;
  const src = buildMapImageUrl(obj.file);
  if (!src) return null;

  const cached = imageCache.get(obj.id);
  if (cached?.src === src) return cached.image;

  const image = new Image();
  image.src = src;
  imageCache.set(obj.id, { src, image });
  return image;
};

const toScreen = (worldX, worldY, viewport) => ({
  x: worldX * viewport.zoom + viewport.offsetX,
  y: worldY * viewport.zoom + viewport.offsetY
});

const getScale = (obj) => Math.max(0.05, Number(obj.scale) || 1);
const getRotateRadians = (obj) => (Number(obj.rotate) || 0) * (Math.PI / 180);

const drawArrow = (ctx, from, to) => {
  const headLength = 12;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = Math.atan2(dy, dx);

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - headLength * Math.cos(angle - Math.PI / 6), to.y - headLength * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(to.x - headLength * Math.cos(angle + Math.PI / 6), to.y - headLength * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
};

export const worldPointFromMouse = (canvas, clientX, clientY) => {
  const rect = canvas.getBoundingClientRect();
  const { viewport } = getState().map;
  const sx = clientX - rect.left;
  const sy = clientY - rect.top;
  return {
    x: (sx - viewport.offsetX) / viewport.zoom,
    y: (sy - viewport.offsetY) / viewport.zoom
  };
};

const rotatePoint = (x, y, angle) => ({
  x: x * Math.cos(angle) - y * Math.sin(angle),
  y: x * Math.sin(angle) + y * Math.cos(angle)
});

const getRotatedRectCorners = (obj, width, height) => {
  const halfW = width / 2;
  const halfH = height / 2;
  const angle = getRotateRadians(obj);
  return [
    rotatePoint(-halfW, -halfH, angle),
    rotatePoint(halfW, -halfH, angle),
    rotatePoint(halfW, halfH, angle),
    rotatePoint(-halfW, halfH, angle)
  ].map((corner) => ({ x: corner.x + obj.x, y: corner.y + obj.y }));
};

export const getObjectBounds = (obj) => {
  const scale = getScale(obj);

  if (obj.type === 'circle') {
    const rx = (Number(obj.radiusX) || Number(obj.radius) || 30) * scale;
    const ry = (Number(obj.radiusY) || Number(obj.radius) || 30) * scale;
    return {
      minX: obj.x - rx,
      minY: obj.y - ry,
      maxX: obj.x + rx,
      maxY: obj.y + ry
    };
  }

  const width = (Number(obj.width) || Number(obj.size) || 50) * scale;
  const height = (Number(obj.height) || Number(obj.size) || 50) * scale;
  const corners = getRotatedRectCorners(obj, width, height);
  return {
    minX: Math.min(...corners.map((p) => p.x)),
    minY: Math.min(...corners.map((p) => p.y)),
    maxX: Math.max(...corners.map((p) => p.x)),
    maxY: Math.max(...corners.map((p) => p.y))
  };
};

export const hitTestObject = (worldX, worldY) => {
  const visibleLayers = new Set(getState().map.layers.filter((layer) => layer.visible).map((layer) => layer.id));
  const objects = allObjects().filter((obj) => visibleLayers.has(obj.layerId));

  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const obj = objects[index];
    const scale = getScale(obj);
    const angle = -getRotateRadians(obj);
    const local = rotatePoint(worldX - obj.x, worldY - obj.y, angle);

    if (obj.type === 'circle') {
      const rx = (Number(obj.radiusX) || Number(obj.radius) || 30) * scale;
      const ry = (Number(obj.radiusY) || Number(obj.radius) || 30) * scale;
      const nx = local.x / rx;
      const ny = local.y / ry;
      if (nx * nx + ny * ny <= 1) return obj;
    } else if (obj.type === 'square' || obj.type === 'image') {
      const width = (Number(obj.width) || Number(obj.size) || 50) * scale;
      const height = (Number(obj.height) || Number(obj.size) || 50) * scale;
      if (Math.abs(local.x) <= width / 2 && Math.abs(local.y) <= height / 2) return obj;
    }
  }
  return null;
};

const drawPreview = (ctx, viewport, drag, tool) => {
  if (drag.mode !== 'create') return;
  const start = toScreen(drag.startX, drag.startY, viewport);
  const current = toScreen(drag.currentX, drag.currentY, viewport);
  const dx = current.x - start.x;
  const dy = current.y - start.y;
  const keepRatio = Boolean(drag.modShift);
  const fromCorner = Boolean(drag.modAlt);

  ctx.save();
  ctx.strokeStyle = '#8cffea';
  ctx.fillStyle = 'rgba(111, 255, 233, 0.15)';
  ctx.setLineDash([7, 5]);

  if (tool === 'create-circle') {
    const rx = Math.max(4 * viewport.zoom, keepRatio ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.abs(dx));
    const ry = Math.max(4 * viewport.zoom, keepRatio ? rx : Math.abs(dy));
    const centerX = fromCorner ? start.x + (dx >= 0 ? rx : -rx) : start.x;
    const centerY = fromCorner ? start.y + (dy >= 0 ? ry : -ry) : start.y;
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  if (tool === 'create-square') {
    const width = Math.max(4 * viewport.zoom, Math.abs(dx) * (fromCorner ? 1 : 2));
    const height = Math.max(4 * viewport.zoom, Math.abs(dy) * (fromCorner ? 1 : 2));
    const nextWidth = keepRatio ? Math.max(width, height) : width;
    const nextHeight = keepRatio ? nextWidth : height;
    const centerX = fromCorner ? start.x + (dx >= 0 ? nextWidth / 2 : -nextWidth / 2) : start.x;
    const centerY = fromCorner ? start.y + (dy >= 0 ? nextHeight / 2 : -nextHeight / 2) : start.y;
    ctx.beginPath();
    ctx.rect(centerX - nextWidth / 2, centerY - nextHeight / 2, nextWidth, nextHeight);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
};

const drawMarquee = (ctx, viewport, drag) => {
  if (drag.mode !== 'marquee') return;
  const start = toScreen(drag.startX, drag.startY, viewport);
  const current = toScreen(drag.currentX, drag.currentY, viewport);
  const x = Math.min(start.x, current.x);
  const y = Math.min(start.y, current.y);
  const width = Math.abs(current.x - start.x);
  const height = Math.abs(current.y - start.y);

  ctx.save();
  ctx.strokeStyle = '#ffd166';
  ctx.fillStyle = 'rgba(255, 209, 102, 0.1)';
  ctx.setLineDash([5, 4]);
  ctx.strokeRect(x, y, width, height);
  ctx.fillRect(x, y, width, height);
  ctx.restore();
};

export const render = (canvas) => {
  const ctx = canvas.getContext('2d');
  const { map, selectedObjectIds, pendingConnectionFrom, drag, tool } = getState();
  const { viewport } = map;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (map.background) {
    if (bgLoadedPath !== map.background) {
      bgImage.src = map.background;
      bgLoadedPath = map.background;
    }
    if (bgImage.complete && bgImage.naturalWidth > 0) {
      ctx.save();
      ctx.setTransform(viewport.zoom, 0, 0, viewport.zoom, viewport.offsetX, viewport.offsetY);
      ctx.globalAlpha = 0.8;
      ctx.drawImage(bgImage, 0, 0);
      ctx.restore();
    }
  }

  ctx.save();
  ctx.strokeStyle = '#8db6ff';
  ctx.fillStyle = '#8db6ff';
  ctx.lineWidth = 2;

  for (const conn of map.connections) {
    const from = findObjectById(conn.from);
    const to = findObjectById(conn.to);
    if (!from || !to) continue;

    const fromLayer = map.layers.find((l) => l.id === from.layerId);
    const toLayer = map.layers.find((l) => l.id === to.layerId);
    if (!fromLayer?.visible || !toLayer?.visible) continue;

    const fromScreen = toScreen(from.x, from.y, viewport);
    const toScreenPoint = toScreen(to.x, to.y, viewport);
    drawArrow(ctx, fromScreen, toScreenPoint);
  }
  ctx.restore();

  for (const layer of map.layers) {
    if (!layer.visible) continue;
    for (const obj of layer.objects) {
      const pos = toScreen(obj.x, obj.y, viewport);
      const isSelected = selectedObjectIds.includes(obj.id);
      const isConnectionStart = obj.id === pendingConnectionFrom;
      const stroke = isSelected ? '#ffd166' : isConnectionStart ? '#a4ff8a' : '#74a2ff';
      const scale = getScale(obj);

      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.rotate(getRotateRadians(obj));
      ctx.strokeStyle = stroke;
      ctx.fillStyle = 'rgba(76, 116, 201, 0.25)';
      ctx.lineWidth = isSelected ? 3 : 2;

      if (obj.type === 'circle') {
        const rx = (Number(obj.radiusX) || Number(obj.radius) || 30) * scale * viewport.zoom;
        const ry = (Number(obj.radiusY) || Number(obj.radius) || 30) * scale * viewport.zoom;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      if (obj.type === 'square') {
        const width = (Number(obj.width) || Number(obj.size) || 50) * scale * viewport.zoom;
        const height = (Number(obj.height) || Number(obj.size) || 50) * scale * viewport.zoom;
        ctx.beginPath();
        ctx.rect(-width / 2, -height / 2, width, height);
        ctx.fill();
        ctx.stroke();
      }

      if (obj.type === 'image') {
        const width = (Number(obj.width) || 128) * scale * viewport.zoom;
        const height = (Number(obj.height) || 128) * scale * viewport.zoom;
        const image = getObjectImage(obj);

        ctx.beginPath();
        ctx.rect(-width / 2, -height / 2, width, height);
        if (image?.complete && image.naturalWidth > 0) {
          ctx.drawImage(image, -width / 2, -height / 2, width, height);
        } else {
          ctx.fill();
        }
        ctx.stroke();
      }

      ctx.fillStyle = '#e9edf7';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(obj.id, 0, 0);
      ctx.restore();
    }
  }

  drawPreview(ctx, viewport, drag, tool);
  drawMarquee(ctx, viewport, drag);
};
