const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = 5600;
const projectRoot = path.resolve(__dirname, '..');
const publicDir = path.join(projectRoot, 'public');

app.use(express.json({ limit: '5mb' }));
app.use(express.static(publicDir));

const parseMultipartForm = async (req) => {
  const contentType = req.headers['content-type'] || '';
  const boundaryMatch = contentType.match(/boundary=(?:(?:"([^"]+)")|([^;]+))/i);
  const boundary = boundaryMatch?.[1] || boundaryMatch?.[2];
  if (!boundary) {
    throw new Error('Invalid multipart/form-data payload');
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  const marker = Buffer.from(`--${boundary}`);
  const closingMarker = Buffer.from(`--${boundary}--`);
  const fields = {};
  let file = null;
  let cursor = 0;

  while (cursor < body.length) {
    let partStart = body.indexOf(marker, cursor);
    if (partStart < 0) break;
    partStart += marker.length;

    if (body.slice(partStart, partStart + 2).equals(Buffer.from('--'))) break;
    if (body.slice(partStart, partStart + 2).equals(Buffer.from('\r\n'))) {
      partStart += 2;
    }

    const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), partStart);
    if (headerEnd < 0) break;
    const headerText = body.slice(partStart, headerEnd).toString('utf-8');

    const dataStart = headerEnd + 4;
    let nextBoundary = body.indexOf(marker, dataStart);
    const closingBoundary = body.indexOf(closingMarker, dataStart);
    if (nextBoundary < 0 || (closingBoundary >= 0 && closingBoundary < nextBoundary)) {
      nextBoundary = closingBoundary;
    }
    if (nextBoundary < 0) break;

    const dataEnd = body.slice(nextBoundary - 2, nextBoundary).equals(Buffer.from('\r\n')) ? nextBoundary - 2 : nextBoundary;
    const content = body.slice(dataStart, dataEnd);

    const dispositionLine = headerText
      .split('\r\n')
      .find((line) => line.toLowerCase().startsWith('content-disposition:'));
    if (!dispositionLine) {
      cursor = nextBoundary;
      continue;
    }

    const nameMatch = dispositionLine.match(/name="([^"]+)"/i);
    const fileNameMatch = dispositionLine.match(/filename="([^"]*)"/i);
    const fieldName = nameMatch?.[1];

    if (fieldName) {
      if (fileNameMatch) {
        file = {
          fieldName,
          originalName: path.basename(fileNameMatch[1] || ''),
          buffer: content
        };
      } else {
        fields[fieldName] = content.toString('utf-8');
      }
    }

    cursor = nextBoundary;
  }

  return { fields, file };
};

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

app.post('/uploadImage', async (req, res) => {
  try {
    const { fields, file } = await parseMultipartForm(req);
    const mapFilePath = fields.mapFilePath;
    const imageId = String(fields.imageId || '').trim();
    if (!mapFilePath) throw new Error('mapFilePath is required');
    if (!imageId || !/^[a-zA-Z0-9_-]+$/.test(imageId)) throw new Error('imageId must contain only letters, numbers, _ or -');
    if (!file || !file.buffer?.length) throw new Error('Image file is required');

    const targetMapFile = resolveInsideProject(mapFilePath);
    const mapStats = await fs.stat(targetMapFile).catch(() => null);
    if (!mapStats?.isFile()) throw new Error('Map file does not exist');

    const mapDirectory = path.dirname(targetMapFile);
    const mapName = path.basename(targetMapFile, path.extname(targetMapFile));
    const extension = path.extname(file.originalName).toLowerCase();
    if (!extension || !/^\.[a-z0-9]+$/.test(extension)) throw new Error('Invalid file extension');

    const fileName = `${mapName}_${imageId}${extension}`;
    const targetImagePath = path.resolve(mapDirectory, fileName);
    const insideMapDirectory =
      targetImagePath === mapDirectory || targetImagePath.startsWith(`${mapDirectory}${path.sep}`);
    if (!insideMapDirectory) throw new Error('Invalid target image path');

    await fs.writeFile(targetImagePath, file.buffer);
    res.status(200).json({ file: fileName });
  } catch (error) {
    res.status(400).json({ error: error.message || 'Failed to upload image' });
  }
});

app.get('/mapImage', async (req, res) => {
  try {
    const mapFilePath = String(req.query.mapFilePath || '').trim();
    const file = path.basename(String(req.query.file || '').trim());
    if (!mapFilePath || !file) throw new Error('mapFilePath and file are required');

    const targetMapFile = resolveInsideProject(mapFilePath);
    const mapDirectory = path.dirname(targetMapFile);
    const imagePath = path.resolve(mapDirectory, file);
    const insideMapDirectory = imagePath === mapDirectory || imagePath.startsWith(`${mapDirectory}${path.sep}`);
    if (!insideMapDirectory) throw new Error('Invalid image path');

    await fs.access(imagePath);
    res.sendFile(imagePath);
  } catch (error) {
    const status = error.code === 'ENOENT' ? 404 : 400;
    res.status(status).json({ error: error.message || 'Failed to load image' });
  }
});

app.listen(PORT, () => {
  console.log(`Structor server is running on http://localhost:${PORT}`);
});
