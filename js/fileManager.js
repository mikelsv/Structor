import { createEmptyMap, serializeMap, setMap, validateAndNormalizeMap } from './state.js';

export const createNewMap = () => {
  setMap(createEmptyMap());
};

export const saveMapToFile = () => {
  const blob = new Blob([serializeMap()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `structor-map-${Date.now()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const loadMapFromFile = async (file) => {
  const text = await file.text();
  const json = JSON.parse(text);
  const map = validateAndNormalizeMap(json);
  setMap(map);
};
