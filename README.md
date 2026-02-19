# Structor

Structor — минимальный, но расширяемый 2D-редактор карт для игры.

## Почему Canvas
Выбран `canvas`, потому что для этого MVP важны:
- быстрый рендер большого числа объектов в одной сцене;
- простой контроль над трансформациями (zoom/pan);
- гибкая отрисовка стрелок и подсветки выделения без лишнего DOM-слоя.

SVG упростил бы выбор DOM-элементов, но для интерактивной сцены редактора Canvas в этом кейсе практичнее.

## Запуск
1. Установите зависимости:
   - `npm install`
2. Запустите сервер:
   - `node server/server.js`
3. Откройте редактор:
   - `http://localhost:5600`

## Что реализовано
- Создание новой карты.
- Загрузка/сохранение JSON карты напрямую на диск через Node.js API (`/save`, `/load`).
- Поле пути к файлу и кнопки Save/Load в тулбаре.
- Фон по пути (URL/relative path).
- Zoom (`Ctrl + колесо`), scroll (`колесо/Shift+колесо`), drag сцены ЛКМ по пустому месту.
- Слои: создание, переключение, скрытие/показ.
- Объекты: круг/квадрат, добавление кликом, выбор, перемещение, удаление, редактирование параметров.
- Связи: выбрать инструмент `Create Connection`, кликнуть объект-источник и объект-цель.
- Стрелки обновляются при перемещении объектов.

## Архитектура
- `server/server.js` — Express сервер, static, API чтения/записи и проверка безопасных путей.
- `public/app.js` — композиция модулей и render loop.
- `public/js/state.js` — единое состояние редактора, операции над картой, JSON-валидация.
- `public/js/renderer.js` — отрисовка canvas, hit-test и преобразования координат.
- `public/js/interactions.js` — обработка мыши, drag/pan/zoom, логика инструментов.
- `public/js/ui.js` — DOM-панели (toolbar/layers/properties/connections).
- `public/js/fileManager.js` — New/Load/Save через HTTP API.

## JSON формат
```json
{
  "version": 1,
  "background": "path/to/image.png",
  "viewport": {
    "zoom": 1,
    "offsetX": 0,
    "offsetY": 0
  },
  "layers": [
    {
      "id": "layer_1",
      "visible": true,
      "objects": [
        {
          "type": "circle",
          "id": "node_1",
          "x": 100,
          "y": 200,
          "radius": 30,
          "layerId": "layer_1"
        },
        {
          "type": "square",
          "id": "node_2",
          "x": 320,
          "y": 190,
          "size": 50,
          "layerId": "layer_1"
        }
      ]
    }
  ],
  "connections": [
    {
      "from": "node_1",
      "to": "node_2"
    }
  ]
}
```
