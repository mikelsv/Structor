import { createEmptyMap, createImageObject, getMapFilePath, getState, setMap, setMapFilePath, validateAndNormalizeMap } from './state.js';
import { exportHistory, importHistory, pushHistory } from './history.js';

export const createNewMap = () => {
  setMap(createEmptyMap());
  importHistory({ past: [], future: [], limit: 50 });
  setMapFilePath('');
};

const requestJson = async (url, payload) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(responseBody.error || `HTTP ${response.status}`);
  }

  return responseBody;
};

export const saveMapToDisk = async (filePath) => {
  if (!filePath) throw new Error('File path is required');
  await requestJson('/save', {
    filePath,
    data: {
      scene: getState().map,
      history: exportHistory()
    }
  });
  setMapFilePath(filePath);
};

export const loadMapFromDisk = async (filePath) => {
  if (!filePath) throw new Error('File path is required');
  const response = await requestJson('/load', { filePath });
  const rawData = response.data;
  const sceneData = rawData?.scene || rawData;
  const map = validateAndNormalizeMap(sceneData);
  setMap(map);
  importHistory(rawData?.history || { past: [], future: [], limit: 50 });
  setMapFilePath(filePath);
};

const readImageMetadata = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      reject(new Error('Invalid image file'));
      URL.revokeObjectURL(url);
    };
    image.src = url;
  });

export const uploadImageForMap = async ({ file, x, y }) => {
  const mapFilePath = getMapFilePath();
  if (!mapFilePath) {
    throw new Error('Сначала сохраните карту');
  }

  const imageId = `img_${String(getState().ids.image).padStart(2, '0')}`;
  const formData = new FormData();
  formData.append('image', file);
  formData.append('mapFilePath', mapFilePath);
  formData.append('imageId', imageId);

  const response = await fetch('/uploadImage', {
    method: 'POST',
    body: formData
  });
  const responseBody = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(responseBody.error || `HTTP ${response.status}`);
  }

  const size = await readImageMetadata(file);
  const created = createImageObject({
    id: imageId,
    file: responseBody.file,
    x,
    y,
    width: size.width,
    height: size.height
  });
  pushHistory('addObject', { object: JSON.parse(JSON.stringify(created)) }, { label: `Add ${created.id}` });
};

export const buildMapImageUrl = (fileName) => {
  const mapFilePath = getMapFilePath();
  if (!mapFilePath || !fileName) return '';
  const params = new URLSearchParams({ mapFilePath, file: fileName });
  return `/mapImage?${params.toString()}`;
};
