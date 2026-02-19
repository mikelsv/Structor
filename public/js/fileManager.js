import { createEmptyMap, getState, setMap, validateAndNormalizeMap } from './state.js';

export const createNewMap = () => {
  setMap(createEmptyMap());
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
    data: getState().map
  });
};

export const loadMapFromDisk = async (filePath) => {
  if (!filePath) throw new Error('File path is required');
  const response = await requestJson('/load', { filePath });
  const map = validateAndNormalizeMap(response.data);
  setMap(map);
};
