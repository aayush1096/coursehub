(function () {
  'use strict';

  // ===== DOM REFERENCES =====
  var codeEditor = document.getElementById('codeEditor');
  var terminalOutput = document.getElementById('terminalOutput');
  var wireLayer = document.getElementById('wireLayer');
  var btnCompile = document.getElementById('btnCompile');
  var btnStart = document.getElementById('btnStart');
  var btnStop = document.getElementById('btnStop');
  var btnClear = document.getElementById('btnClear');
  var simIndicator = document.getElementById('simIndicator');
  var suggestionsEl = document.getElementById('suggestions');
  var hardwareSelect = document.getElementById('hardwareSelect');
  var btnUndoWire = document.getElementById('btnUndoWire');
  var btnRedoWire = document.getElementById('btnRedoWire');
  var hardwareCanvas = document.getElementById('hardwareCanvas');
  var zoomInBtn = document.getElementById('zoomIn');
  var zoomOutBtn = document.getElementById('zoomOut');
  var zoomResetBtn = document.getElementById('zoomReset');
  var zoomLevelEl = document.getElementById('zoomLevel');
  var factoryToggle = document.getElementById('factoryToggle');
  var factoryMenu = document.getElementById('factoryMenu');
  var instanceListEl = document.getElementById('instanceList');
  var btnFullscreen = document.getElementById('btnFullscreen');

  if (!codeEditor || !wireLayer) return;

  // ===== CODEMIRROR INIT =====
  window.cm = CodeMirror.fromTextArea(codeEditor, {
    mode: 'text/x-c++src',
    theme: 'monokai',
    lineNumbers: true,
    matchBrackets: true,
    autoCloseBrackets: true,
    indentUnit: 2,
    tabSize: 2,
    indentWithTabs: false,
    extraKeys: {
      'Tab': function(cm) {
        if (cm.somethingSelected()) cm.indentSelection('add');
        else cm.replaceSelection('  ', 'end');
      },
      'Esc': function() { hideSuggestions(); }
    }
  });

  var cm = window.cm;

  // ===== HARDWARE COMPONENT CATALOG =====
  var CATALOG = {
    led: {
      name: 'LED', category: 'output', pins: ['anode', 'cathode'],
      gridW: 1, gridH: 1, refCx: 370, refCy: 100,
      color: '#64c878', icon: '\u25CF'
    },
    rgb_led: {
      name: 'RGB LED', category: 'output', pins: ['R', 'G', 'B', 'GND'],
      gridW: 1, gridH: 1, refCx: 370, refCy: 100,
      color: '#ff6b6b', icon: '\u25C9'
    },
    button: {
      name: 'Button', category: 'input', pins: ['A', 'B'],
      gridW: 1, gridH: 1, refCx: 370, refCy: 235,
      color: '#3fb950', icon: '\u25B6'
    },
    potentiometer: {
      name: 'Potentiometer', category: 'input', pins: ['VCC', 'OUT', 'GND'],
      gridW: 1, gridH: 1, refCx: 370, refCy: 235,
      color: '#bc8cff', icon: '\u21C4'
    },
    dht11: {
      name: 'DHT11', category: 'input', pins: ['VCC', 'DATA', 'GND'],
      gridW: 1, gridH: 1, refCx: 370, refCy: 105,
      color: '#58a6ff', icon: '\u2601'
    },
    ultrasonic: {
      name: 'Ultrasonic', category: 'input', pins: ['VCC', 'TRIG', 'ECHO', 'GND'],
      gridW: 2, gridH: 1, refCx: 550, refCy: 115,
      color: '#f85149', icon: '\u2194'
    },
    oled: {
      name: 'OLED 128x64', category: 'output', pins: ['VCC', 'GND', 'SDA', 'SCL'],
      gridW: 2, gridH: 2, refCx: 600, refCy: 155,
      color: '#00ff88', icon: '\u25A3'
    },
    resistor: {
      name: 'Resistor', category: 'passive', pins: ['pin1', 'pin2'],
      gridW: 1, gridH: 1, refCx: 370, refCy: 343,
      color: '#8b6914', icon: '\u2248'
    },
    buzzer: {
      name: 'Buzzer', category: 'output', pins: ['pos', 'neg'],
      gridW: 1, gridH: 1, refCx: 600, refCy: 355,
      color: '#d29922', icon: '\u266B'
    }
  };

  // ===== GRID LAYOUT SYSTEM =====
  var GRID = {
    originX: 270,
    originY: 75,
    colW: 125,
    rowH: 115,
    cols: 4
  };

  var gridMap = {};

  function gridCx(col, w) { return GRID.originX + col * GRID.colW + (w * GRID.colW) / 2; }
  function gridCy(row, h) { return GRID.originY + row * GRID.rowH + (h * GRID.rowH) / 2; }

  function isSlotFree(col, row, w, h) {
    for (var r = row; r < row + h; r++) {
      for (var c = col; c < col + w; c++) {
        if (gridMap[c + ',' + r]) return false;
      }
    }
    return true;
  }

  function occupySlot(col, row, w, h, id) {
    for (var r = row; r < row + h; r++) {
      for (var c = col; c < col + w; c++) {
        gridMap[c + ',' + r] = id;
      }
    }
  }

  function freeSlot(id) {
    for (var key in gridMap) {
      if (gridMap[key] === id) delete gridMap[key];
    }
  }

  function findFreeSlot(type) {
    var entry = CATALOG[type];
    if (!entry) return null;
    var w = entry.gridW || 1, h = entry.gridH || 1;
    for (var row = 0; row < 50; row++) {
      for (var col = 0; col < GRID.cols; col++) {
        if (col + w > GRID.cols) continue;
        if (isSlotFree(col, row, w, h)) {
          return { col: col, row: row };
        }
      }
    }
    return null;
  }

  // ===== STATE =====
  var connections = [];
  var selectedPin = null;
  var isSimulating = false;
  var simInterval = null;
  var buttonPressed = false;
  var lastDigitalReadState = null;
  var suggestionIndex = -1;
  var currentSuggestions = [];
  var instances = [];
  var typeCounter = {};
  var serialTickIndex = 0;
  var lastSerialOutputCount = 0;

  var wireHistory = [];
  var wireRedoStack = [];
  var MAX_HISTORY = 50;

  var vbState = { x: 0, y: 0, w: 780, h: 520 };
  var ZOOM_MIN = 0.3;
  var ZOOM_MAX = 3;
  var isPanning = false;
  var panStart = null;
  var panStartClient = null;
  var selectedComponent = null;
  var dragState = null;

  // ===== WIRE COLOR MAP =====
  var WIRE_COLORS = {
    power: '#f85149', gnd: '#8b949e', digital: '#3fb950',
    analog: '#bc8cff', i2c_data: '#58a6ff', i2c_clock: '#d29922'
  };

  var PIN_TYPES = {
    'arduino-5V': 'power', 'arduino-3V3': 'power', 'arduino-VIN': 'power', 'arduino-GND': 'gnd',
    'arduino-D0': 'digital', 'arduino-D1': 'digital', 'arduino-D2': 'digital', 'arduino-D3': 'digital',
    'arduino-D4': 'digital', 'arduino-D5': 'digital', 'arduino-D6': 'digital', 'arduino-D7': 'digital',
    'arduino-D8': 'digital', 'arduino-D9': 'digital', 'arduino-D10': 'digital', 'arduino-D11': 'digital',
    'arduino-D12': 'digital', 'arduino-D13': 'digital',
    'arduino-A0': 'analog', 'arduino-A1': 'analog', 'arduino-A2': 'analog',
    'arduino-A3': 'analog', 'arduino-A4': 'analog', 'arduino-A5': 'analog',
    'arduino-SDA': 'i2c_data', 'arduino-SCL': 'i2c_clock'
  };

  // ===== ARDUINO KEYWORD SUGGESTIONS =====
  var KEYWORDS = [
    { text: 'setup', type: 'func' }, { text: 'loop', type: 'func' },
    { text: 'pinMode', type: 'func' }, { text: 'digitalWrite', type: 'func' },
    { text: 'digitalRead', type: 'func' }, { text: 'analogRead', type: 'func' },
    { text: 'analogWrite', type: 'func' }, { text: 'delay', type: 'func' },
    { text: 'millis', type: 'func' }, { text: 'micros', type: 'func' },
    { text: 'Serial.begin', type: 'func' }, { text: 'Serial.print', type: 'func' },
    { text: 'Serial.println', type: 'func' }, { text: 'Serial.read', type: 'func' },
    { text: 'Serial.available', type: 'func' }, { text: 'display.begin', type: 'func' },
    { text: 'display.print', type: 'func' }, { text: 'display.println', type: 'func' },
    { text: 'display.clearDisplay', type: 'func' }, { text: 'display.setTextSize', type: 'func' },
    { text: 'display.setCursor', type: 'func' }, { text: 'display.display', type: 'func' },
    { text: 'display.setTextColor', type: 'func' }, { text: 'Wire.begin', type: 'func' },
    { text: 'Wire.beginTransmission', type: 'func' }, { text: 'Wire.endTransmission', type: 'func' },
    { text: 'Wire.write', type: 'func' }, { text: 'Wire.requestFrom', type: 'func' },
    { text: 'INPUT', type: 'const' }, { text: 'OUTPUT', type: 'const' },
    { text: 'INPUT_PULLUP', type: 'const' }, { text: 'HIGH', type: 'const' },
    { text: 'LOW', type: 'const' }, { text: 'true', type: 'const' },
    { text: 'false', type: 'const' }, { text: 'void', type: 'type' },
    { text: 'int', type: 'type' }, { text: 'float', type: 'type' },
    { text: 'char', type: 'type' }, { text: 'byte', type: 'type' },
    { text: 'bool', type: 'type' }, { text: 'String', type: 'type' },
    { text: '#include <Wire.h>', type: 'dir' },
    { text: '#include <Adafruit_SSD1306.h>', type: 'dir' },
    { text: '#include <SPI.h>', type: 'dir' },
    { text: '#include <DHT.h>', type: 'dir' },
    { text: '#include <LiquidCrystal.h>', type: 'dir' },
    { text: 'dht.readTemperature', type: 'func' },
    { text: 'dht.readHumidity', type: 'func' }
  ];

  // ===== TERMINAL =====
  function log(msg, type) {
    type = type || 'info';
    var line = document.createElement('div');
    line.className = 'term-line term-' + type;
    line.textContent = msg;
    terminalOutput.appendChild(line);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
  }

  // ===== KEYWORD SUGGESTIONS =====
  function getSuggestions() {
    var cursor = cm.getCursor();
    var text = cm.getValue();
    var lineStart = text.lastIndexOf('\n', cm.indexFromPos(cursor) - 1) + 1;
    var currentWord = text.substring(lineStart, cm.indexFromPos(cursor));
    var match = currentWord.match(/([a-zA-Z_#<>\.]+)$/);
    if (!match || match[1].length < 2) { hideSuggestions(); return; }
    var prefix = match[1].toLowerCase();
    currentSuggestions = KEYWORDS.filter(function(k) {
      return k.text.toLowerCase().indexOf(prefix) !== -1;
    }).slice(0, 8);
    if (currentSuggestions.length === 0) { hideSuggestions(); return; }
    suggestionIndex = 0;
    renderSuggestions();
  }

  function renderSuggestions() {
    var cursor = cm.getCursor();
    var coords = cm.cursorCoords(cursor, 'page');
    var scrollX = window.pageXOffset || document.documentElement.scrollLeft;
    var scrollY = window.pageYOffset || document.documentElement.scrollTop;
    var editRect = suggestionsEl.parentElement.getBoundingClientRect();

    var left = coords.left - scrollX - editRect.left;
    var top = coords.bottom - scrollY - editRect.top;
    var maxW = editRect.width;

    if (left + 220 > maxW) left = maxW - 230;
    if (left < 0) left = 10;
    if (top + 200 > editRect.height) top = editRect.height - 210;
    if (top < 0) top = 10;

    suggestionsEl.style.display = 'block';
    suggestionsEl.style.left = left + 'px';
    suggestionsEl.style.top = top + 'px';
    suggestionsEl.innerHTML = currentSuggestions.map(function(s, i) {
      return '<div class="suggestion-item' + (i === suggestionIndex ? ' active' : '') + '" data-index="' + i + '">' +
        '<span class="suggestion-type">' + s.type + '</span>' +
        '<span>' + s.text + '</span>' +
      '</div>';
    }).join('');

    var activeEl = suggestionsEl.querySelector('.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });

    suggestionsEl.querySelectorAll('.suggestion-item').forEach(function(el) {
      el.addEventListener('mousedown', function(e) {
        e.preventDefault();
        insertSuggestion(parseInt(el.dataset.index));
      });
    });
  }

  function insertSuggestion(index) {
    if (index < 0 || index >= currentSuggestions.length) return;
    var word = currentSuggestions[index].text;
    var cursor = cm.getCursor();
    var pos = cm.indexFromPos(cursor);
    var text = cm.getValue();
    var lineStart = text.lastIndexOf('\n', pos - 1) + 1;
    var prefix = text.substring(lineStart, pos);
    var match = prefix.match(/([a-zA-Z_#<>\.]+)$/);
    if (match) {
      var replaceStart = pos - match[1].length;
      var insertText = word;
      if (currentSuggestions[index].type === 'func' && text[pos] !== '(') {
        insertText = word + '(';
      }
      cm.replaceRange(insertText, cm.posFromIndex(replaceStart), cursor);
      cm.setCursor(cm.posFromIndex(replaceStart + insertText.length));
    }
    hideSuggestions();
    cm.focus();
  }

  function hideSuggestions() {
    suggestionsEl.style.display = 'none';
    currentSuggestions = [];
    suggestionIndex = -1;
  }

  cm.setOption('extraKeys', {
    'Tab': function(cm) {
      if (suggestionsEl.style.display === 'block') {
        if (suggestionIndex >= 0) insertSuggestion(suggestionIndex);
        else if (currentSuggestions.length > 0) insertSuggestion(0);
      } else {
        if (cm.somethingSelected()) cm.indentSelection('add');
        else cm.replaceSelection('  ', 'end');
      }
    },
    'Enter': function(cm) {
      if (suggestionsEl.style.display === 'block') {
        if (suggestionIndex >= 0) insertSuggestion(suggestionIndex);
        else if (currentSuggestions.length > 0) insertSuggestion(0);
      } else {
        return CodeMirror.Pass;
      }
    },
    'Esc': function() { hideSuggestions(); },
    'Up': function(cm) {
      if (suggestionsEl.style.display === 'block') {
        suggestionIndex = Math.max(suggestionIndex - 1, 0);
        renderSuggestions();
      } else {
        return CodeMirror.Pass;
      }
    },
    'Down': function(cm) {
      if (suggestionsEl.style.display === 'block') {
        suggestionIndex = Math.min(suggestionIndex + 1, currentSuggestions.length - 1);
        renderSuggestions();
      } else {
        return CodeMirror.Pass;
      }
    }
  });

  // ===== PIN COORDINATES =====
  function getPinCoords(component, pin) {
    var el = document.getElementById('pin-' + component + '-' + pin);
    if (!el) return null;
    return { x: parseFloat(el.getAttribute('cx')), y: parseFloat(el.getAttribute('cy')) };
  }

  // ===== WIRING ENGINE =====
  function pushWireHistory() {
    wireHistory.push(JSON.parse(JSON.stringify(connections)));
    if (wireHistory.length > MAX_HISTORY) wireHistory.shift();
    wireRedoStack = [];
    updateUndoRedoButtons();
  }

  function undoWire() {
    if (isSimulating) { log('[Wiring] Cannot undo during simulation', 'warn'); return; }
    if (wireHistory.length === 0) return;
    wireRedoStack.push(JSON.parse(JSON.stringify(connections)));
    connections = wireHistory.pop();
    refreshPinConnectedStates();
    renderWires();
    updateUndoRedoButtons();
    log('[Wiring] Undo', 'info');
  }

  function redoWire() {
    if (isSimulating) { log('[Wiring] Cannot redo during simulation', 'warn'); return; }
    if (wireRedoStack.length === 0) return;
    wireHistory.push(JSON.parse(JSON.stringify(connections)));
    connections = wireRedoStack.pop();
    refreshPinConnectedStates();
    renderWires();
    updateUndoRedoButtons();
    log('[Wiring] Redo', 'info');
  }

  function refreshPinConnectedStates() {
    document.querySelectorAll('.pin-target.connected').forEach(function(el) {
      el.classList.remove('connected');
    });
    connections.forEach(function(c) {
      var fromEl = document.getElementById('pin-' + c.from.key);
      var toEl = document.getElementById('pin-' + c.to.key);
      if (fromEl) fromEl.classList.add('connected');
      if (toEl) toEl.classList.add('connected');
    });
  }

  function updateUndoRedoButtons() {
    if (btnUndoWire) btnUndoWire.disabled = wireHistory.length === 0;
    if (btnRedoWire) btnRedoWire.disabled = wireRedoStack.length === 0;
  }

  function handlePinClick(component, pin) {
    if (isSimulating) return;
    var pinKey = component + '-' + pin;

    if (!selectedPin) {
      selectedPin = { component: component, pin: pin, key: pinKey };
      var el = document.getElementById('pin-' + pinKey);
      if (el) el.classList.add('source-selected');
      log('[Wiring] Selected: ' + component + ' / ' + pin, 'info');
    } else {
      if (pinKey === selectedPin.key) {
        var srcEl = document.getElementById('pin-' + selectedPin.key);
        if (srcEl) srcEl.classList.remove('source-selected');
        selectedPin = null;
        return;
      }

      var isDup = connections.some(function (c) {
        return (c.from.key === selectedPin.key && c.to.key === pinKey) ||
               (c.from.key === pinKey && c.to.key === selectedPin.key);
      });
      if (isDup) {
        var sEl = document.getElementById('pin-' + selectedPin.key);
        if (sEl) sEl.classList.remove('source-selected');
        selectedPin = null;
        log('[Wiring] Duplicate — ignored', 'warn');
        return;
      }

      pushWireHistory();
      var wireType = PIN_TYPES[selectedPin.key] || 'digital';
      connections.push({
        from: { component: selectedPin.component, pin: selectedPin.pin, key: selectedPin.key },
        to: { component: component, pin: pin, key: pinKey },
        color: WIRE_COLORS[wireType] || '#3fb950',
        type: wireType
      });

      var fromEl = document.getElementById('pin-' + selectedPin.key);
      var toEl = document.getElementById('pin-' + pinKey);
      if (fromEl) { fromEl.classList.remove('source-selected'); fromEl.classList.add('connected'); }
      if (toEl) toEl.classList.add('connected');

      log('[Wiring] ' + selectedPin.component + '/' + selectedPin.pin + ' <--> ' + component + '/' + pin, 'success');
      selectedPin = null;
      renderWires();
    }
  }

  function removeWire(index) {
    if (isSimulating) { log('[Wiring] Cannot remove wires during simulation', 'warn'); return; }
    pushWireHistory();
    var wire = connections[index];
    if (!wire) return;
    var fromHasOther = connections.some(function (c, i) { return i !== index && (c.from.key === wire.from.key || c.to.key === wire.from.key); });
    var toHasOther = connections.some(function (c, i) { return i !== index && (c.from.key === wire.to.key || c.to.key === wire.to.key); });
    var fromEl = document.getElementById('pin-' + wire.from.key);
    var toEl = document.getElementById('pin-' + wire.to.key);
    if (!fromHasOther && fromEl) fromEl.classList.remove('connected');
    if (!toHasOther && toEl) toEl.classList.remove('connected');
    log('[Wiring] Removed: ' + wire.from.component + '/' + wire.from.pin + ' <--> ' + wire.to.component + '/' + wire.to.pin, 'warn');
    connections.splice(index, 1);
    renderWires();
  }

  function renderWires() {
    wireLayer.innerHTML = '';
    var BOARD_LEFT = 30, BOARD_RIGHT = 250, BOARD_TOP = 30, BOARD_BOTTOM = 490;

    connections.forEach(function (conn, idx) {
      var fc = getPinCoords(conn.from.component, conn.from.pin);
      var tc = getPinCoords(conn.to.component, conn.to.pin);
      if (!fc || !tc) return;

      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      var d = computeWirePath(fc, tc, BOARD_LEFT, BOARD_RIGHT, BOARD_TOP, BOARD_BOTTOM);
      path.setAttribute('d', d);
      path.setAttribute('stroke', conn.color);
      path.setAttribute('stroke-width', '2.5');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-linecap', 'round');
      path.style.pointerEvents = 'stroke';
      path.style.cursor = 'pointer';
      if (isSimulating) {
        path.classList.add('wire-active');
      }
      path.addEventListener('click', function (e) { e.stopPropagation(); removeWire(idx); });
      wireLayer.appendChild(path);
    });
  }

  function computeWirePath(fc, tc, BL, BR, BT, BB) {
    var dx = tc.x - fc.x, dy = tc.y - fc.y;
    var fromOnBoard = fc.x >= BL && fc.x <= BR && fc.y >= BT && fc.y <= BB;
    var toOnBoard = tc.x >= BL && tc.x <= BR && tc.y >= BT && tc.y <= BB;

    if (fromOnBoard && toOnBoard) {
      var mx = (fc.x + tc.x) / 2, my = (fc.y + tc.y) / 2;
      var bulge = Math.min(Math.abs(dx) * 0.3, 40);
      if (fc.x < tc.x) mx -= bulge; else mx += bulge;
      return 'M ' + fc.x + ' ' + fc.y + ' Q ' + mx + ' ' + my + ' ' + tc.x + ' ' + tc.y;
    }

    var points = [fc];
    if (fromOnBoard) {
      if (fc.x >= BR - 30) points.push({ x: BR + 30, y: fc.y });
      else points.push({ x: BL - 30, y: fc.y });
    }
    if (toOnBoard) {
      if (tc.x >= BR - 30) points.push({ x: BR + 30, y: tc.y });
      else points.push({ x: BL - 30, y: tc.y });
    }
    points.push(tc);

    if (points.length === 2) {
      var midX = (fc.x + tc.x) / 2;
      return 'M ' + fc.x + ' ' + fc.y + ' C ' + midX + ' ' + fc.y + ', ' + midX + ' ' + tc.y + ', ' + tc.x + ' ' + tc.y;
    }

    var d = 'M ' + points[0].x + ' ' + points[0].y;
    for (var i = 1; i < points.length; i++) {
      var prev = points[i - 1], curr = points[i];
      var cdx = curr.x - prev.x, cdy = curr.y - prev.y;
      var cdist = Math.sqrt(cdx * cdx + cdy * cdy);
      var tension = Math.min(cdist * 0.4, 60);
      var cp1x = prev.x + (cdx > 0 ? tension : -tension);
      var cp2x = curr.x - (cdx > 0 ? tension : -tension);
      d += ' C ' + cp1x + ' ' + prev.y + ', ' + cp2x + ' ' + curr.y + ', ' + curr.x + ' ' + curr.y;
    }
    return d;
  }

  function isWired(key) {
    return connections.some(function (c) { return c.from.key === key || c.to.key === key; });
  }

  function isConnectedBetween(k1, k2) {
    return connections.some(function (c) {
      return (c.from.key === k1 && c.to.key === k2) || (c.from.key === k2 && c.to.key === k1);
    });
  }

  // ===== INSTANCE MANAGEMENT =====
  function spawnComponent(type) {
    var entry = CATALOG[type];
    if (!entry) return null;

    var slot = findFreeSlot(type);
    if (!slot) {
      log('[Hardware] Canvas grid is full — cannot add more ' + entry.name, 'error');
      return null;
    }

    typeCounter[type] = (typeCounter[type] || 0) + 1;
    var idx = typeCounter[type];
    var instanceId = type + '-' + idx;

    var template = document.getElementById('comp-' + type);
    if (!template) return null;
    var clone = template.cloneNode(true);
    clone.id = 'comp-' + instanceId;
    clone.setAttribute('data-instance', instanceId);
    clone.style.display = '';

    var targetCx = gridCx(slot.col, entry.gridW);
    var targetCy = gridCy(slot.row, entry.gridH);
    var dx = targetCx - entry.refCx;
    var dy = targetCy - entry.refCy;

    clone.querySelectorAll('circle, rect, text, line, foreignObject, ellipse, path').forEach(function(el) {
      var cx = el.getAttribute('cx');
      var cy = el.getAttribute('cy');
      var x = el.getAttribute('x');
      var y = el.getAttribute('y');
      var x1 = el.getAttribute('x1');
      var y1 = el.getAttribute('y1');
      var x2 = el.getAttribute('x2');
      var y2 = el.getAttribute('y2');
      if (cx) el.setAttribute('cx', (parseFloat(cx) + dx).toFixed(1));
      if (cy) el.setAttribute('cy', (parseFloat(cy) + dy).toFixed(1));
      if (x) el.setAttribute('x', (parseFloat(x) + dx).toFixed(1));
      if (y) el.setAttribute('y', (parseFloat(y) + dy).toFixed(1));
      if (x1) el.setAttribute('x1', (parseFloat(x1) + dx).toFixed(1));
      if (y1) el.setAttribute('y1', (parseFloat(y1) + dy).toFixed(1));
      if (x2) el.setAttribute('x2', (parseFloat(x2) + dx).toFixed(1));
      if (y2) el.setAttribute('y2', (parseFloat(y2) + dy).toFixed(1));
    });

    clone.querySelectorAll('[id]').forEach(function(el) {
      if (el.classList.contains('pin-target')) {
        var pinName = el.getAttribute('data-pin');
        el.id = 'pin-' + instanceId + '-' + pinName;
        el.setAttribute('data-component', instanceId);
        var pinKey = instanceId + '-' + pinName;
        if (!PIN_TYPES[pinKey]) {
          PIN_TYPES[pinKey] = 'digital';
        }
      } else {
        el.id = el.id + '-' + idx;
      }
    });

    clone.querySelectorAll('[for]').forEach(function(el) {
      el.setAttribute('for', el.getAttribute('for') + '-' + idx);
    });

    pinTargetsForInstance(clone, instanceId);

    occupySlot(slot.col, slot.row, entry.gridW, entry.gridH, instanceId);

    hardwareCanvas.appendChild(clone);

    instances.push({
      id: instanceId,
      type: type,
      idx: idx,
      slot: slot
    });

    log('[Hardware] Added ' + entry.name + ' #' + idx + ' (' + instanceId + ')', 'info');
    renderInstanceList();
    return instanceId;
  }

  function removeComponent(instanceId) {
    var el = document.getElementById('comp-' + instanceId);
    if (!el) return;

    el.remove();
    freeSlot(instanceId);

    var toRemove = [];
    connections.forEach(function(c, i) {
      if (c.from.component === instanceId || c.to.component === instanceId) {
        toRemove.push(i);
      }
    });
    for (var ri = toRemove.length - 1; ri >= 0; ri--) {
      var wire = connections[toRemove[ri]];
      var fEl = document.getElementById('pin-' + wire.from.key);
      var tEl = document.getElementById('pin-' + wire.to.key);
      var fOther = connections.some(function(c, j) { return j !== toRemove[ri] && (c.from.key === wire.from.key || c.to.key === wire.from.key); });
      var tOther = connections.some(function(c, j) { return j !== toRemove[ri] && (c.from.key === wire.to.key || c.to.key === wire.to.key); });
      if (!fOther && fEl) fEl.classList.remove('connected');
      if (!tOther && tEl) tEl.classList.remove('connected');
      connections.splice(toRemove[ri], 1);
    }

    var found = -1;
    for (var i = 0; i < instances.length; i++) {
      if (instances[i].id === instanceId) { found = i; break; }
    }
    if (found !== -1) instances.splice(found, 1);

    renderWires();
    renderInstanceList();

    var type = instanceId.split('-')[0];
    var entry = CATALOG[type];
    log('[Hardware] Removed ' + (entry ? entry.name : type) + ' (' + instanceId + ')', 'info');
  }

  function removeAllComponents() {
    var ids = instances.slice().map(function(inst) { return inst.id; });
    ids.forEach(function(id) { removeComponent(id); });
  }

  function pinTargetsForInstance(clone, instanceId) {
    clone.querySelectorAll('.pin-target').forEach(function(pin) {
      pin.addEventListener('mousedown', function(e) {
        e.stopPropagation();
        handlePinClick(
          pin.getAttribute('data-component') || instanceId,
          pin.getAttribute('data-pin')
        );
      });
    });
  }

  // ===== FACTORY DROPDOWN =====
  if (factoryToggle && factoryMenu) {
    factoryToggle.addEventListener('click', function(e) {
      e.stopPropagation();
      factoryMenu.classList.toggle('open');
    });

    factoryMenu.addEventListener('click', function(e) {
      var item = e.target.closest('.factory-item');
      if (!item) return;
      var type = item.getAttribute('data-comp');
      if (type && CATALOG[type]) {
        spawnComponent(type);
        factoryMenu.classList.remove('open');
      }
    });

    document.addEventListener('click', function(e) {
      if (!factoryToggle.contains(e.target) && !factoryMenu.contains(e.target)) {
        factoryMenu.classList.remove('open');
      }
    });
  }

  // ===== INSTANCE LIST =====
  function renderInstanceList() {
    if (!instanceListEl) return;
    if (instances.length === 0) {
      instanceListEl.innerHTML = '';
      return;
    }

    var html = '';
    for (var i = 0; i < instances.length; i++) {
      var inst = instances[i];
      var entry = CATALOG[inst.type];
      var label = (entry ? entry.name : inst.type) + ' #' + inst.idx;
      var selClass = selectedComponent === inst.id ? ' selected' : '';
      html += '<div class="instance-item' + selClass + '" data-instance="' + inst.id + '" title="' + label + '">' +
        '<span class="instance-name">' + (entry ? entry.icon + ' ' : '') + label + '</span>' +
        '<button class="instance-remove" data-instance="' + inst.id + '" title="Remove">&times;</button>' +
      '</div>';
    }
    instanceListEl.innerHTML = html;

    instanceListEl.querySelectorAll('.instance-remove').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        removeComponent(btn.getAttribute('data-instance'));
      });
    });
    instanceListEl.querySelectorAll('.instance-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        if (e.target.closest('.instance-remove')) return;
        var id = item.getAttribute('data-instance');
        if (id) selectComponent(id);
      });
    });
  }

  // ===== SELECTION / DRAG / DELETE =====
  function selectComponent(instanceId) {
    deselectComponent();
    if (!instanceId) return;
    var el = document.getElementById('comp-' + instanceId);
    if (!el) return;
    selectedComponent = instanceId;
    el.classList.add('selected');
    renderInstanceList();
  }

  function deselectComponent() {
    if (selectedComponent) {
      var oldEl = document.getElementById('comp-' + selectedComponent);
      if (oldEl) oldEl.classList.remove('selected');
      selectedComponent = null;
      renderInstanceList();
    }
  }

  function deleteSelected() {
    if (!selectedComponent) return;
    var id = selectedComponent;
    deselectComponent();
    removeComponent(id);
  }

  function getComponentCenter(el) {
    var cx = 0, cy = 0, count = 0;
    el.querySelectorAll('.pin-target').forEach(function(p) {
      var pcx = parseFloat(p.getAttribute('cx'));
      var pcy = parseFloat(p.getAttribute('cy'));
      if (!isNaN(pcx)) { cx += pcx; cy += pcy; count++; }
    });
    if (count === 0) {
      el.querySelectorAll('circle, rect').forEach(function(s) {
        var scx = parseFloat(s.getAttribute('cx'));
        var scy = parseFloat(s.getAttribute('cy'));
        if (!isNaN(scx)) { cx += scx; cy += scy; count++; }
      });
    }
    if (count === 0) return null;
    return { cx: cx / count, cy: cy / count };
  }

  function startDrag(instanceId, clientX, clientY) {
    var el = document.getElementById('comp-' + instanceId);
    if (!el) return;
    var rect = hardwareCanvas.getBoundingClientRect();
    var svgX = vbState.x + (clientX - rect.left) / rect.width * vbState.w;
    var svgY = vbState.y + (clientY - rect.top) / rect.height * vbState.h;
    var elements = [];
    el.querySelectorAll('circle, rect, text, line, foreignObject, ellipse, path').forEach(function(child) {
      var pos = {};
      ['cx','cy','x','y','x1','y1','x2','y2'].forEach(function(attr) {
        var val = child.getAttribute(attr);
        if (val !== null && val !== '') pos[attr] = parseFloat(val);
      });
      if (Object.keys(pos).length > 0) {
        elements.push({ el: child, orig: pos });
      }
    });
    dragState = {
      instanceId: instanceId,
      el: el,
      startSvgX: svgX,
      startSvgY: svgY,
      elements: elements
    };
    freeSlot(instanceId);
    el.classList.add('dragging');
  }

  function moveDrag(clientX, clientY) {
    if (!dragState) return;
    var rect = hardwareCanvas.getBoundingClientRect();
    var curSvgX = vbState.x + (clientX - rect.left) / rect.width * vbState.w;
    var curSvgY = vbState.y + (clientY - rect.top) / rect.height * vbState.h;
    var dx = curSvgX - dragState.startSvgX;
    var dy = curSvgY - dragState.startSvgY;
    dragState.elements.forEach(function(item) {
      for (var attr in item.orig) {
        var isY = attr.indexOf('y') === 0 || attr.indexOf('y') === 1;
        item.el.setAttribute(attr, (item.orig[attr] + (isY ? dy : dx)).toFixed(1));
      }
    });
    renderWires();
  }

  function endDrag() {
    if (!dragState) return;
    dragState.el.classList.remove('dragging');
    dragState = null;
  }

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
      var cmWrapper = cm.getWrapperElement();
      if (document.activeElement && (document.activeElement === cmWrapper || cmWrapper.contains(document.activeElement))) return;
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      e.preventDefault();
      deleteSelected();
    }
    if (e.key === 'Escape') {
      deselectComponent();
    }
  });

  // ===== LED CONTROL (instance-aware) =====
  function setLED(on, instanceIdx) {
    var el = document.getElementById('ledInner-' + instanceIdx);
    if (!el) return;
    if (on) {
      el.style.fill = '#ff2020';
      el.style.filter = 'drop-shadow(0 0 12px rgba(255,32,32,0.8)) drop-shadow(0 0 24px rgba(255,32,32,0.4))';
    } else {
      el.style.fill = '#3d0000';
      el.style.filter = 'none';
    }
  }

  // ===== RGB LED CONTROL =====
  function setRGBLED(r, g, b, instanceIdx) {
    var el = document.getElementById('rgbLedInner-' + instanceIdx);
    if (!el) return;
    if (r || g || b) {
      var rs = Math.round(r * 255), gs = Math.round(g * 255), bs = Math.round(b * 255);
      el.style.fill = 'rgb(' + rs + ',' + gs + ',' + bs + ')';
      el.style.filter = 'drop-shadow(0 0 12px rgba(' + rs + ',' + gs + ',' + bs + ',0.8))';
    } else {
      el.style.fill = '#3d0000';
      el.style.filter = 'none';
    }
  }

  // ===== OLED CONTROL =====
  function setOLEDText(text, instanceIdx) {
    var el = document.getElementById('oledDisplay-' + instanceIdx);
    if (!el) return;
    el.textContent = text || '';
  }

  // ===== BUTTON VISUAL =====
  function setButtonVisual(pressed, instanceIdx) {
    var groupId = instanceIdx ? 'comp-button-' + instanceIdx : 'comp-button-1';
    var group = document.getElementById(groupId);
    if (!group) return;
    if (pressed) group.classList.add('button-pressed');
    else group.classList.remove('button-pressed');
  }

  // ===== OLED PARSER =====
  function parseOledOutput(code) {
    var lines = [], cursorY = 0, textSize = 1;
    var codeLines = code.split('\n');
    for (var i = 0; i < codeLines.length; i++) {
      var line = codeLines[i].trim();
      var tsMatch = line.match(/display\.setTextSize\s*\(\s*(\d+)\s*\)/i);
      if (tsMatch) { textSize = parseInt(tsMatch[1]) || 1; continue; }
      var scMatch = line.match(/display\.setCursor\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/i);
      if (scMatch) { cursorY = parseInt(scMatch[2]) || 0; continue; }
      if (/display\.clearDisplay\s*\(/i.test(line)) { lines = []; cursorY = 0; continue; }
      var plMatch = line.match(/display\.println\s*\(\s*"([^"]*)"\s*\)/i);
      if (plMatch) {
        var idx = Math.floor(cursorY / (8 * textSize));
        while (lines.length <= idx) lines.push('');
        lines[idx] = plMatch[1]; cursorY += 8 * textSize; continue;
      }
      var pMatch = line.match(/display\.print\s*\(\s*"([^"]*)"\s*\)/i);
      if (pMatch) {
        var idx2 = Math.floor(cursorY / (8 * textSize));
        while (lines.length <= idx2) lines.push('');
        lines[idx2] += pMatch[1]; continue;
      }
      if (/display\.println\s*\(\s*\)/i.test(line)) { cursorY += 8 * textSize; continue; }
    }
    if (lines.length > 0) return lines.join('\n');
    return null;
  }

  // ===== SIMULATION HELPERS =====
  function getWiredInstancePin(arduinoPin, suffix) {
    for (var i = 0; i < connections.length; i++) {
      var c = connections[i];
      var other = null;
      if (c.from.key === arduinoPin) other = c.to.key;
      else if (c.to.key === arduinoPin) other = c.from.key;
      if (other && other.indexOf('-') !== -1) {
        var parts = other.split('-');
        if (parts.length >= 3 && parts[parts.length - 1] === suffix) {
          return { instanceId: parts[0] + '-' + parts[1], key: other };
        }
      }
    }
    return null;
  }

  function getWiredInstance(arduinoPin) {
    for (var i = 0; i < connections.length; i++) {
      var c = connections[i];
      if (c.from.key === arduinoPin) {
        var toParts = c.to.key.split('-');
        if (toParts.length >= 2) return { instanceId: toParts[0] + '-' + toParts[1], key: c.to.key, pin: c.to.pin };
      }
      if (c.to.key === arduinoPin) {
        var fromParts = c.from.key.split('-');
        if (fromParts.length >= 2) return { instanceId: fromParts[0] + '-' + fromParts[1], key: c.from.key, pin: c.from.pin };
      }
    }
    return null;
  }

  function getInstancesOfType(type) {
    var result = [];
    for (var i = 0; i < instances.length; i++) {
      if (instances[i].type === type) result.push(instances[i]);
    }
    return result;
  }

  // ===== COMPILE =====
  function compile() {
    var code = cm.getValue();
    log('─────────────────────────────────────────', 'info');
    log('[Status] Compiling Sketch...', 'header');

    var errors = [], warnings = [];

    if (!/void\s+setup\s*\(/.test(code)) errors.push('Missing void setup()');
    if (!/void\s+loop\s*\(/.test(code)) errors.push('Missing void loop()');
    if (!/pinMode\s*\(/.test(code)) warnings.push('No pinMode() found');
    if (!/digitalWrite\s*\(/.test(code) && !/digitalRead\s*\(/.test(code) &&
        !/analogRead\s*\(/.test(code) && !/analogWrite\s*\(/.test(code)) {
      warnings.push('No I/O operations found');
    }

    if (errors.length) {
      errors.forEach(function (e) { log('[Error] ' + e, 'error'); });
      log('[Failed] Compilation failed', 'error');
      return false;
    }
    if (warnings.length) warnings.forEach(function (w) { log('[Warning] ' + w, 'warn'); });

    if (/digitalWrite\s*\(/.test(code)) log('  -> digitalWrite()', 'info');
    if (/digitalRead\s*\(/.test(code)) log('  -> digitalRead()', 'info');
    if (/analogRead\s*\(/.test(code)) log('  -> analogRead()', 'info');
    if (/analogWrite\s*\(/.test(code)) log('  -> analogWrite()', 'info');
    if (/Serial\.begin/.test(code)) log('  -> Serial.begin()', 'info');
    if (/Serial\.print/.test(code)) log('  -> Serial.print()', 'info');
    if (/#include\s*<Wire\.h>/.test(code)) log('  -> #include <Wire.h>', 'info');
    if (/display\.(print|println|begin)/i.test(code)) log('  -> display.*()', 'info');

    log('[Wiring] Checking connections...', 'info');

    function anyOfTypeConnecting(type, arduinoPin, targetSuffix) {
      return connections.some(function(c) {
        if (c.from.key === arduinoPin || c.to.key === arduinoPin) {
          var other = c.from.key === arduinoPin ? c.to.key : c.from.key;
          return other.indexOf(type + '-') === 0 && other.endsWith('-' + targetSuffix);
        }
        return false;
      });
    }

    function anyOfTypeWired(type, suffix) {
      return connections.some(function(c) {
        return (c.from.key.indexOf(type + '-') === 0 && c.from.key.endsWith('-' + suffix)) ||
               (c.to.key.indexOf(type + '-') === 0 && c.to.key.endsWith('-' + suffix));
      });
    }

    var ledInstances = getInstancesOfType('led');
    if (ledInstances.length > 0) {
      var ledWired = anyOfTypeConnecting('led', 'arduino-D13', 'anode') && anyOfTypeWired('led', 'cathode');
      if (ledWired) log('  -> LED: Some instance connected (D13->Anode, Cathode->GND)', 'success');
      else log('  -> LED: Not wired', 'warn');
    }

    var rgbLedInstances = getInstancesOfType('rgb_led');
    if (rgbLedInstances.length > 0) {
      var rgbR = anyOfTypeConnecting('rgb_led', 'arduino-D9', 'R');
      var rgbG = anyOfTypeConnecting('rgb_led', 'arduino-D10', 'G');
      var rgbB = anyOfTypeConnecting('rgb_led', 'arduino-D11', 'B');
      if (rgbR || rgbG || rgbB) log('  -> RGB LED: Channels connected', 'success');
      else log('  -> RGB LED: Not wired', 'warn');
    }

    var oledInstances = getInstancesOfType('oled');
    if (oledInstances.length > 0) {
      var oledSDA = anyOfTypeConnecting('oled', 'arduino-SDA', 'SDA');
      var oledSCL = anyOfTypeConnecting('oled', 'arduino-SCL', 'SCL');
      var oledVcc = anyOfTypeWired('oled', 'VCC');
      var oledGnd = anyOfTypeWired('oled', 'GND');
      if (oledSDA && oledSCL && oledVcc && oledGnd) log('  -> OLED: Connected (SDA, SCL, VCC, GND)', 'success');
      else log('  -> OLED: Not fully wired', 'warn');
    }

    var btnInstances = getInstancesOfType('button');
    if (btnInstances.length > 0) {
      var btnA = anyOfTypeConnecting('button', 'arduino-D2', 'A');
      var btnB = anyOfTypeWired('button', 'B');
      if (btnA && btnB) log('  -> Button: Connected (D2->A, B->GND)', 'success');
      else log('  -> Button: Not wired', 'warn');
    }

    var dhtInstances = getInstancesOfType('dht11');
    if (dhtInstances.length > 0) {
      var dhtData = anyOfTypeConnecting('dht11', 'arduino-D4', 'DATA');
      if (dhtData) log('  -> DHT11: DATA connected to D4', 'success');
      else log('  -> DHT11: Not wired', 'warn');
    }

    var usInstances = getInstancesOfType('ultrasonic');
    if (usInstances.length > 0) {
      var usTrig = anyOfTypeConnecting('ultrasonic', 'arduino-D5', 'TRIG');
      var usEcho = anyOfTypeConnecting('ultrasonic', 'arduino-D6', 'ECHO');
      if (usTrig && usEcho) log('  -> Ultrasonic: TRIG->D5, ECHO->D6', 'success');
      else log('  -> Ultrasonic: Not wired', 'warn');
    }

    log('[Success] Upload complete!', 'success');
    return true;
  }

  // ===== SIMULATION LOOP =====
  function simulationLoop() {
    var code = cm.getValue();

    // LED control
    var ledInstances = getInstancesOfType('led');
    if (ledInstances.length > 0) {
      var dwMatch = code.match(/digitalWrite\s*\(\s*(\d+)\s*,\s*(HIGH|LOW)\s*\)/ig);
      if (dwMatch) {
        var highPins = {};
        for (var di = 0; di < dwMatch.length; di++) {
          var parts = dwMatch[di].match(/digitalWrite\s*\(\s*(\d+)\s*,\s*(HIGH|LOW)\s*\)/i);
          if (parts) highPins[parseInt(parts[1])] = parts[2].toUpperCase() === 'HIGH';
        }

        ledInstances.forEach(function(inst) {
          var idx = inst.idx;
          var anodeHigh = false;
          var cathodeGnd = false;

          for (var ci = 0; ci < connections.length; ci++) {
            var c = connections[ci];
            var otherPin = null;
            var isAnode = false;
            if (c.from.key.indexOf('arduino-D') === 0 && c.to.key.indexOf(inst.id + '-anode') === 0) {
              otherPin = c.from.key; isAnode = true;
            } else if (c.to.key.indexOf('arduino-D') === 0 && c.from.key.indexOf(inst.id + '-anode') === 0) {
              otherPin = c.to.key; isAnode = true;
            }
            if (isAnode && otherPin) {
              var pinNum = parseInt(otherPin.split('-')[1].substring(1));
              if (highPins[pinNum]) anodeHigh = true;
            }
            // Check cathode → GND
            if ((c.from.key.indexOf(inst.id + '-cathode') === 0 && c.to.key === 'arduino-GND') ||
                (c.to.key.indexOf(inst.id + '-cathode') === 0 && c.from.key === 'arduino-GND')) {
              cathodeGnd = true;
            }
          }

          setLED(anodeHigh && cathodeGnd, idx);
        });
      } else {
        ledInstances.forEach(function(inst) { setLED(false, inst.idx); });
      }
    }

    // RGB LED
    var rgbInstances = getInstancesOfType('rgb_led');
    if (rgbInstances.length > 0) {
      var awMatch = code.match(/analogWrite\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/g);
      var pwmValues = {};
      if (awMatch) {
        for (var ai = 0; ai < awMatch.length; ai++) {
          var p = awMatch[ai].match(/analogWrite\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)/);
          if (p) pwmValues[parseInt(p[1])] = parseInt(p[2]) / 255;
        }
      }
      rgbInstances.forEach(function(inst) {
        var idx = inst.idx;
        var rVal = 0, gVal = 0, bVal = 0;
        var rgbGnd = false;
        for (var ci = 0; ci < connections.length; ci++) {
          var c = connections[ci];
          var other = null;
          if (c.from.key.indexOf('arduino-') === 0 && c.to.key.indexOf(inst.id + '-') === 0) {
            other = { pin: c.from.key, suffix: c.to.key.split('-')[2] };
          } else if (c.to.key.indexOf('arduino-') === 0 && c.from.key.indexOf(inst.id + '-') === 0) {
            other = { pin: c.to.key, suffix: c.from.key.split('-')[2] };
          }
          if (other) {
            if (other.suffix === 'GND') { rgbGnd = true; continue; }
            var pinNum = parseInt(other.pin.split('-')[1].substring(1));
            var val = pwmValues[pinNum] || 0;
            if (other.suffix === 'R') rVal = val;
            else if (other.suffix === 'G') gVal = val;
            else if (other.suffix === 'B') bVal = val;
          }
        }
        setRGBLED(rgbGnd ? rVal : 0, rgbGnd ? gVal : 0, rgbGnd ? bVal : 0, idx);
      });
    }

    // Button simulation
    var btnInstances = getInstancesOfType('button');
    btnInstances.forEach(function(inst) {
      setButtonVisual(buttonPressed, inst.idx);
    });

    if (btnInstances.length > 0) {
      var drMatch = code.match(/digitalRead\s*\(\s*(\d+)\s*\)/i);
      if (drMatch) {
        var readPin = parseInt(drMatch[1]);
        if (readPin === 2) {
          var btnWired = false;
          for (var ci = 0; ci < connections.length; ci++) {
            var c = connections[ci];
            if ((c.from.key === 'arduino-D2' && c.to.key.indexOf('button-') === 0 && c.to.key.endsWith('-A')) ||
                (c.to.key === 'arduino-D2' && c.from.key.indexOf('button-') === 0 && c.from.key.endsWith('-A'))) {
              btnWired = true; break;
            }
          }
          if (btnWired) {
            var val = buttonPressed ? 'LOW' : 'HIGH';
            if (val !== lastDigitalReadState) {
              log('[Serial] Pin 2 = ' + val + (buttonPressed ? ' (pressed)' : ' (released)'), 'serial');
              lastDigitalReadState = val;
            }
          }
        }
      }
    }

    // Serial output
    var hasSerial = /Serial\.begin\s*\(\s*\d+\s*\)/i.test(code);
    if (hasSerial && code.indexOf('Serial') !== -1) {
      serialTickIndex++;
      var serialMsgs = [];
      var lines = code.split('\n');
      for (var si = 0; si < lines.length; si++) {
        var ln = lines[si].trim();
        var pnMatch = ln.match(/Serial\.(println|print)\s*\(\s*"?([^"]*)"?\s*\)\s*;?\s*$/i);
        if (pnMatch) {
          serialMsgs.push({ text: pnMatch[2], newline: pnMatch[1].toLowerCase() === 'println' });
        } else {
          var pdMatch = ln.match(/Serial\.(println|print)\s*\(\s*"([^"]*)"\s*\)\s*;?/i);
          if (pdMatch) {
            serialMsgs.push({ text: pdMatch[2], newline: pdMatch[1].toLowerCase() === 'println' });
          }
        }
      }
      if (serialMsgs.length > 0) {
        var si2 = Math.floor((serialTickIndex - 1) / 5);
        if (si2 >= serialMsgs.length) {
          lastSerialOutputCount = 0;
          serialTickIndex = 1;
          si2 = 0;
        }
        if (si2 >= lastSerialOutputCount) {
          var msg = serialMsgs[si2];
          log('[Serial] ' + msg.text, 'serial');
          lastSerialOutputCount = si2 + 1;
        }
      }
    }

    // OLED control
    var oledInstances = getInstancesOfType('oled');
    if (oledInstances.length > 0) {
      var hasDisplayBegin = /display\.begin\b/i.test(code);
      var oledText = parseOledOutput(code);

      oledInstances.forEach(function(inst) {
        var oledWired = false;
        var oledSDA = false, oledSCL = false;
        for (var ci = 0; ci < connections.length; ci++) {
          var c = connections[ci];
          var key = null;
          if (c.from.key === 'arduino-SDA' && c.to.key.indexOf(inst.id + '-SDA') === 0) key = c.to.key;
          else if (c.to.key === 'arduino-SDA' && c.from.key.indexOf(inst.id + '-SDA') === 0) key = c.from.key;
          if (key) oledSDA = true;
          key = null;
          if (c.from.key === 'arduino-SCL' && c.to.key.indexOf(inst.id + '-SCL') === 0) key = c.to.key;
          else if (c.to.key === 'arduino-SCL' && c.from.key.indexOf(inst.id + '-SCL') === 0) key = c.from.key;
          if (key) oledSCL = true;
        }
        var oledVcc = false;
        var oledGnd = false;
        for (var ci2 = 0; ci2 < connections.length; ci2++) {
          var c2 = connections[ci2];
          if (c2.from.key.indexOf(inst.id + '-VCC') === 0 || c2.to.key.indexOf(inst.id + '-VCC') === 0) oledVcc = true;
          if (c2.from.key.indexOf(inst.id + '-GND') === 0 || c2.to.key.indexOf(inst.id + '-GND') === 0) oledGnd = true;
        }
        oledWired = oledSDA && oledSCL && oledVcc && oledGnd;

        if (oledText && oledWired) {
          setOLEDText(oledText, inst.idx);
        } else if (oledWired && hasDisplayBegin) {
          setOLEDText('[Display init]\n[Waiting...]', inst.idx);
        }
      });
    }
  }

  // ===== START / STOP =====
  function startSimulation() {
    if (isSimulating) return;
    if (!compile()) { log('[Failed] Fix errors first', 'error'); return; }

    isSimulating = true;
    lastDigitalReadState = null;
    serialTickIndex = 0;
    lastSerialOutputCount = 0;
    btnStart.disabled = true;
    btnStop.disabled = false;
    btnCompile.disabled = true;
    simIndicator.setAttribute('visibility', 'visible');

    log('[Running] Simulation live', 'success');
    simulationLoop();
    simInterval = setInterval(simulationLoop, 200);
  }

  function stopSimulation() {
    if (!isSimulating) return;
    clearInterval(simInterval);
    isSimulating = false;
    buttonPressed = false;
    lastDigitalReadState = null;

    instances.forEach(function(inst) {
      if (inst.type === 'led') setLED(false, inst.idx);
      if (inst.type === 'rgb_led') setRGBLED(0, 0, 0, inst.idx);
      if (inst.type === 'button') setButtonVisual(false, inst.idx);
      if (inst.type === 'oled') setOLEDText('', inst.idx);
    });

    // Remove wire-active animation from all wires
    var wirePaths = wireLayer.querySelectorAll('.wire-active');
    wirePaths.forEach(function(p) { p.classList.remove('wire-active'); });

    btnStart.disabled = false;
    btnStop.disabled = true;
    btnCompile.disabled = false;
    simIndicator.setAttribute('visibility', 'hidden');
    log('[Stopped] Hardware reset', 'warn');
  }

  // ===== EVENT LISTENERS =====
  if (btnCompile) btnCompile.addEventListener('click', function () { if (!isSimulating) compile(); });
  if (btnStart) btnStart.addEventListener('click', startSimulation);
  if (btnStop) btnStop.addEventListener('click', stopSimulation);
  if (btnClear) btnClear.addEventListener('click', function () { terminalOutput.innerHTML = ''; });

  cm.on('change', function() {
    getSuggestions();
  });

  document.addEventListener('keydown', function(e) {
    var cmWrapper = cm.getWrapperElement();
    if (document.activeElement && (document.activeElement === cmWrapper ||
        cmWrapper.contains(document.activeElement))) return;
    if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undoWire(); }
    if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redoWire(); }
  });

  // ===== UNDO/REDO BUTTONS =====
  if (btnUndoWire) btnUndoWire.addEventListener('click', undoWire);
  if (btnRedoWire) btnRedoWire.addEventListener('click', redoWire);

  // ===== ZOOM =====
  function applyViewBox() {
    hardwareCanvas.setAttribute('viewBox',
      vbState.x + ' ' + vbState.y + ' ' + vbState.w + ' ' + vbState.h);
    var pct = Math.round((780 / vbState.w) * 100);
    if (zoomLevelEl) zoomLevelEl.textContent = pct + '%';
  }

  function zoom(factor, cx, cy) {
    var newW = vbState.w / factor;
    var newH = vbState.h / factor;
    if (newW < 780 * ZOOM_MIN || newW > 780 / ZOOM_MIN) return;
    vbState.x += (vbState.w - newW) * ((cx - vbState.x) / vbState.w);
    vbState.y += (vbState.h - newH) * ((cy - vbState.y) / vbState.h);
    vbState.w = newW;
    vbState.h = newH;
    applyViewBox();
  }

  function zoomIn() {
    zoom(1.25, vbState.x + vbState.w / 2, vbState.y + vbState.h / 2);
  }

  function zoomOut() {
    zoom(0.8, vbState.x + vbState.w / 2, vbState.y + vbState.h / 2);
  }

  function zoomReset() {
    vbState.x = 0; vbState.y = 0; vbState.w = 780; vbState.h = 520;
    applyViewBox();
  }

  if (zoomInBtn) zoomInBtn.addEventListener('click', zoomIn);
  if (zoomOutBtn) zoomOutBtn.addEventListener('click', zoomOut);
  if (zoomResetBtn) zoomResetBtn.addEventListener('click', zoomReset);

  // ===== FULLSCREEN =====
  if (btnFullscreen) {
    btnFullscreen.addEventListener('click', function() {
      var canvasPanel = document.getElementById('canvasPanel');
      if (!document.fullscreenElement) {
        if (canvasPanel.requestFullscreen) {
          canvasPanel.requestFullscreen().then(function() {
            canvasPanel.classList.add('fullscreen');
          }).catch(function() {});
        }
      } else {
        if (document.exitFullscreen) {
          document.exitFullscreen();
          canvasPanel.classList.remove('fullscreen');
        }
      }
    });
    document.addEventListener('fullscreenchange', function() {
      var canvasPanel = document.getElementById('canvasPanel');
      if (!document.fullscreenElement) {
        canvasPanel.classList.remove('fullscreen');
      }
    });
  }

  hardwareCanvas.addEventListener('wheel', function(e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      var rect = hardwareCanvas.getBoundingClientRect();
      var svgX = vbState.x + (e.clientX - rect.left) / rect.width * vbState.w;
      var svgY = vbState.y + (e.clientY - rect.top) / rect.height * vbState.h;
      zoom(e.deltaY < 0 ? 1.1 : 0.9, svgX, svgY);
    }
  }, { passive: false });

  hardwareCanvas.addEventListener('mousedown', function(e) {
    if (e.button === 1) {
      e.preventDefault();
      isPanning = true;
      var rect = hardwareCanvas.getBoundingClientRect();
      panStart = {
        x: (e.clientX - rect.left) / rect.width * vbState.w + vbState.x,
        y: (e.clientY - rect.top) / rect.height * vbState.h + vbState.y
      };
      return;
    }
    var target = e.target.closest('.component');
    if (target && target.id !== 'comp-arduino') {
      var instId = target.getAttribute('data-instance');
      if (instId) {
        selectComponent(instId);
        startDrag(instId, e.clientX, e.clientY);
        e.preventDefault();
        return;
      }
    }
    if (e.button === 0) {
      e.preventDefault();
      isPanning = true;
      var rect = hardwareCanvas.getBoundingClientRect();
      panStart = {
        x: (e.clientX - rect.left) / rect.width * vbState.w + vbState.x,
        y: (e.clientY - rect.top) / rect.height * vbState.h + vbState.y
      };
      panStartClient = { x: e.clientX, y: e.clientY };
      hardwareCanvas.parentElement.classList.add('panning');
    }
  });

  document.addEventListener('mousemove', function(e) {
    if (dragState) {
      moveDrag(e.clientX, e.clientY);
      return;
    }
    if (!isPanning) return;
    var rect = hardwareCanvas.getBoundingClientRect();
    var curSvgX = (e.clientX - rect.left) / rect.width * vbState.w + vbState.x;
    var curSvgY = (e.clientY - rect.top) / rect.height * vbState.h + vbState.y;
    vbState.x += panStart.x - curSvgX;
    vbState.y += panStart.y - curSvgY;
    panStart = { x: curSvgX, y: curSvgY };
    applyViewBox();
  });

  document.addEventListener('mouseup', function(e) {
    if (dragState) { endDrag(); return; }
    if (isPanning) {
      isPanning = false;
      hardwareCanvas.parentElement.classList.remove('panning');
      if (panStartClient) {
        var dx = e.clientX - panStartClient.x;
        var dy = e.clientY - panStartClient.y;
        if (Math.sqrt(dx * dx + dy * dy) < 5) {
          deselectComponent();
        }
        panStartClient = null;
      }
    }
  });

  // ===== DRAGGABLE SPLITTER =====
  var splitter = document.getElementById('splitter');
  var editorPanel = document.getElementById('editorPanel');
  if (splitter && editorPanel) {
    var isDragging = false;
    splitter.addEventListener('mousedown', function(e) {
      isDragging = true;
      splitter.classList.add('active');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });
    document.addEventListener('mousemove', function(e) {
      if (!isDragging) return;
      var container = splitter.parentElement;
      var containerRect = container.getBoundingClientRect();
      var offset = e.clientX - containerRect.left;
      var percent = Math.max(20, Math.min(80, (offset / containerRect.width) * 100));
      editorPanel.style.width = percent + '%';
    });
    document.addEventListener('mouseup', function() {
      if (!isDragging) return;
      isDragging = false;
      splitter.classList.remove('active');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  }

  // ===== PIN CLICK HANDLERS (Arduino only, instances registered at spawn) =====
  document.querySelectorAll('#comp-arduino .pin-target').forEach(function (pin) {
    pin.addEventListener('mousedown', function (e) {
      e.stopPropagation();
      handlePinClick(pin.getAttribute('data-component'), pin.getAttribute('data-pin'));
    });
  });

  // ===== BUTTON PRESS/RELEASE (global for all button instances) =====
  document.addEventListener('mousedown', function(e) {
    var target = e.target.closest('.button-center');
    if (!target || !isSimulating) return;
    e.stopPropagation();
    buttonPressed = true;
    var bi = getInstancesOfType('button');
    bi.forEach(function(inst) { setButtonVisual(true, inst.idx); });
  });

  document.addEventListener('mouseup', function(e) {
    if (!buttonPressed) return;
    var target = e.target.closest('.button-center');
    if (target) {
      buttonPressed = false;
      getInstancesOfType('button').forEach(function(inst) { setButtonVisual(false, inst.idx); });
    }
  });

  document.addEventListener('mouseleave', function() {
    if (buttonPressed) {
      buttonPressed = false;
      getInstancesOfType('button').forEach(function(inst) { setButtonVisual(false, inst.idx); });
    }
  });

  document.addEventListener('touchstart', function(e) {
    var target = e.target.closest('.button-center');
    if (!target || !isSimulating) return;
    buttonPressed = true;
    getInstancesOfType('button').forEach(function(inst) { setButtonVisual(true, inst.idx); });
  }, { passive: true });

  document.addEventListener('touchend', function(e) {
    if (!buttonPressed) return;
    buttonPressed = false;
    getInstancesOfType('button').forEach(function(inst) { setButtonVisual(false, inst.idx); });
  }, { passive: true });

  // ===== HARDWARE PROFILE LOADER =====
  if (hardwareSelect) {
    hardwareSelect.addEventListener('change', function() {
      var opt = hardwareSelect.options[hardwareSelect.selectedIndex];
      if (opt) {
        cm.setValue(opt.getAttribute('data-code') || '');
        removeAllComponents();
        var comps = (opt.getAttribute('data-components') || '').split(',');
        comps.forEach(function(c) {
          c = c.trim();
          if (c && CATALOG[c]) spawnComponent(c);
        });
      }
    });
  }

  // ===== BOOT =====
  log('═══════════════════════════════════════════', 'header');
  log('  Wokwi-Lite Simulator v4.0', 'header');
  log('  Universal Component Factory', 'header');
  log('  Write code, add components, wire, simulate.', 'info');
  log('  Click "+ Add Component" to spawn hardware.', 'info');
  log('  Ctrl+Scroll to zoom canvas, Shift+drag to pan.', 'info');
  log('═══════════════════════════════════════════', 'header');

})();
