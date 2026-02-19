import { allObjects, findObjectById, getState } from './state.js';

const bgImage = new Image();
let bgLoadedPath = '';

const toScreen = (worldX, worldY, viewport) => ({
  x: worldX * viewport.zoom + viewport.offsetX,
  y: worldY * viewport.zoom + viewport.offsetY
});

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

export const hitTestObject = (worldX, worldY) => {
  const visibleLayers = new Set(getState().map.layers.filter((layer) => layer.visible).map((layer) => layer.id));
  const objects = allObjects().filter((obj) => visibleLayers.has(obj.layerId));

  for (let index = objects.length - 1; index >= 0; index -= 1) {
    const obj = objects[index];
    if (obj.type === 'circle') {
      const dist = Math.hypot(worldX - obj.x, worldY - obj.y);
      if (dist <= obj.radius) return obj;
    } else if (obj.type === 'square') {
      const half = obj.size / 2;
      if (worldX >= obj.x - half && worldX <= obj.x + half && worldY >= obj.y - half && worldY <= obj.y + half) {
        return obj;
      }
    }
  }
  return null;
};

export const render = (canvas) => {
  const ctx = canvas.getContext('2d');
  const { map, selectedObjectId, pendingConnectionFrom } = getState();
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
      const isSelected = obj.id === selectedObjectId;
      const isConnectionStart = obj.id === pendingConnectionFrom;
      const stroke = isSelected ? '#ffd166' : isConnectionStart ? '#a4ff8a' : '#74a2ff';

      ctx.save();
      ctx.strokeStyle = stroke;
      ctx.fillStyle = 'rgba(76, 116, 201, 0.25)';
      ctx.lineWidth = isSelected ? 3 : 2;

      if (obj.type === 'circle') {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, obj.radius * viewport.zoom, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }

      if (obj.type === 'square') {
        const size = obj.size * viewport.zoom;
        ctx.beginPath();
        ctx.rect(pos.x - size / 2, pos.y - size / 2, size, size);
        ctx.fill();
        ctx.stroke();
      }

      ctx.fillStyle = '#e9edf7';
      ctx.font = '12px monospace';
      ctx.fillText(obj.id, pos.x + 8, pos.y - 8);
      ctx.restore();
    }
  }
};
