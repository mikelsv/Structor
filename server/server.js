const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = 5600;
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');

app.use(express.json({ limit: '5mb' }));
app.use(express.static(publicDir));

const resolveInsideProject = (targetPath) => {
  if (typeof targetPath !== 'string' || !targetPath.trim()) {
    throw new Error('filePath must be a non-empty string');
  }

  const normalizedInput = targetPath.trim();
  const resolvedPath = path.resolve(projectRoot, normalizedInput);
  const insideProject = resolvedPath === projectRoot || resolvedPath.startsWith(`${projectRoot}${path.sep}`);

  if (!insideProject) {
    throw new Error('Access denied: filePath must stay inside project directory');
  }

  return resolvedPath;
};

app.post('/save', async (req, res) => {
  try {
    const { filePath, data } = req.body || {};
    const targetFile = resolveInsideProject(filePath);
    await fs.mkdir(path.dirname(targetFile), { recursive: true });
    await fs.writeFile(targetFile, JSON.stringify(data, null, 2), 'utf-8');
    res.status(200).json({ ok: true });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to save file' });
  }
});

app.post('/load', async (req, res) => {
  try {
    const { filePath } = req.body || {};
    const targetFile = resolveInsideProject(filePath);
    const content = await fs.readFile(targetFile, 'utf-8');
    const data = JSON.parse(content);
    res.status(200).json({ data });
  } catch (error) {
    const status = error.code === 'ENOENT' ? 404 : 400;
    res.status(status).json({ error: error.message || 'Failed to load file' });
  }
});

app.listen(PORT, () => {
  console.log(`Structor server is running on http://localhost:${PORT}`);
});
