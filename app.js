/* 짤·카드 스튜디오 — 캔버스 기반 밈·카드 편집기
   미리보기와 내려받기가 같은 render()를 쓰므로 화면=파일 일치가 구조적으로 보장됨 */
'use strict';
const $ = (id) => document.getElementById(id);

// ----- 상태 -----
const RATIOS = { '1:1': [1080, 1080], '4:5': [1080, 1350], '9:16': [1080, 1920] };
const MAX_IMG_BYTES = 12 * 1024 * 1024;          // 12MB 초과는 거부
const state = {
  ratio: '1:1',
  bg: '#17141F',
  img: null,          // { el, src, zoom, x, y }  x,y = 중심 위치 비율(0~1)
  layers: [],         // { id, text, x, y, size, color, font, outline }
  sel: null,          // 선택된 레이어 id
};
let layerSeq = 0;
const uid = () => 'L' + (++layerSeq) + '-' + Date.now().toString(36);

// ----- 캔버스 -----
const board = $('board'), ctx = board.getContext('2d');
const canvasWH = () => RATIOS[state.ratio];

let layerBoxes = [];  // 드래그 히트박스 {id, x, y, w, h} — render 때 계산

function render() {
  const [W, H] = canvasWH();
  if (board.width !== W || board.height !== H) { board.width = W; board.height = H; }
  // 배경
  ctx.fillStyle = state.bg;
  ctx.fillRect(0, 0, W, H);
  // 이미지 (cover + 줌 + 팬)
  if (state.img?.el) {
    const iw = state.img.el.naturalWidth, ih = state.img.el.naturalHeight;
    const cover = Math.max(W / iw, H / ih) * state.img.zoom;
    const dw = iw * cover, dh = ih * cover;
    const dx = W * state.img.x - dw / 2, dy = H * state.img.y - dh / 2;
    ctx.drawImage(state.img.el, dx, dy, dw, dh);
  }
  // 문구 레이어
  layerBoxes = [];
  for (const L of state.layers) {
    if (!L.text.trim()) { layerBoxes.push({ id: L.id, x: 0, y: 0, w: 0, h: 0 }); continue; }
    const size = Math.min(Math.max(L.size | 0, 8), 240);   // 극단 크기 클램프
    const lx = Math.max(0, Math.min(1, L.x || 0));         // 경계 밖 좌표 클램프
    const ly = Math.max(0, Math.min(1, L.y || 0));
    ctx.font = `${size}px ${L.font}, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const maxW = W - 80;
    const lines = wrapText(L.text, maxW);
    const lh = size * 1.35;
    const baseY = H * ly;
    let maxLine = 0;
    for (const line of lines) maxLine = Math.max(maxLine, ctx.measureText(line).width);
    lines.forEach((line, i) => {
      const y = baseY + (i - (lines.length - 1) / 2) * lh;
      if (L.outline) {
        ctx.lineWidth = Math.max(4, size * .09);
        ctx.lineJoin = 'round';
        ctx.strokeStyle = 'rgba(14,11,20,.85)';
        ctx.strokeText(line, W * lx, y);
      }
      ctx.fillStyle = L.color;
      ctx.fillText(line, W * lx, y);
    });
    const bh = lines.length * lh;
    layerBoxes.push({ id: L.id, x: W * lx - maxLine / 2 - 10, y: baseY - bh / 2 - size, w: maxLine + 20, h: bh + size * .4 });
    // 선택 표시
    if (L.id === state.sel) {
      const b = layerBoxes[layerBoxes.length - 1];
      ctx.strokeStyle = 'rgba(139,124,255,.9)';
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.strokeRect(b.x, b.y, b.w, b.h);
      ctx.setLineDash([]);
    }
  }
}
function wrapText(text, maxW) {
  const out = [];
  for (const raw of text.split('\n')) {
    let cur = '';
    for (const ch of raw) {
      if (ctx.measureText(cur + ch).width > maxW && cur) { out.push(cur); cur = ch; }
      else cur += ch;
    }
    out.push(cur);
  }
  return out.length ? out : [''];
}

// ----- 토스트 -----
let toastT;
function toast(msg, kind = 'ok') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show ' + kind;
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 2600);
}

// ----- 이미지 불러오기 (PNG·JPEG 검증) -----
const IMG_OK = ['image/png', 'image/jpeg'];
function loadImageFile(file) {
  if (!file) return;
  if (!IMG_OK.includes(file.type)) {
    toast(`지원하지 않는 파일입니다 — PNG·JPEG만 가능해요 (받은 파일: ${file.type || file.name.split('.').pop() + ' 형식'})`, 'err');
    return false;
  }
  if (file.size === 0) { toast('빈 파일입니다 — 다른 이미지를 넣어주세요', 'err'); return false; }
  if (file.size > MAX_IMG_BYTES) { toast(`파일이 너무 큽니다 — 12MB 이하만 가능해요 (${(file.size / 1048576).toFixed(1)}MB)`, 'err'); return false; }
  const img = new Image();
  img.onload = () => {
    state.img = { el: img, src: file.name, zoom: 1, x: .5, y: .5 };
    $('imgZoom').value = 100;
    $('canvasWrap').classList.remove('noimg');
    render();
    toast(`${file.name} 불러왔어요`);
  };
  img.onerror = () => toast('이미지를 읽지 못했어요 — 파일이 깨졌을 수 있습니다', 'err');
  img.src = URL.createObjectURL(file);
  return true;
}
$('imgBtn').onclick = () => $('imgInput').click();
$('imgInput').addEventListener('change', (e) => { loadImageFile(e.target.files[0]); e.target.value = ''; });

// 드래그&드롭
const wrap = $('canvasWrap');
for (const ev of ['dragenter', 'dragover']) wrap.addEventListener(ev, (e) => { e.preventDefault(); wrap.classList.add('dragover'); });
for (const ev of ['dragleave', 'drop']) wrap.addEventListener(ev, (e) => { e.preventDefault(); wrap.classList.remove('dragover'); });
wrap.addEventListener('drop', (e) => loadImageFile(e.dataTransfer.files[0]));

$('imgZoom').addEventListener('input', () => { if (state.img) { state.img.zoom = $('imgZoom').value / 100; render(); } });

// 배경색·프리셋
function setBg(c) { state.bg = c; render(); markOn($('bgColors'), c); }
$('bgColors').addEventListener('click', (e) => { if (e.target.dataset.c) setBg(e.target.dataset.c); });
$('bgCustom').addEventListener('input', () => setBg($('bgCustom').value));
function markOn(row, c) { [...row.querySelectorAll('.swatch')].forEach(s => s.classList.toggle('on', s.dataset.c === c)); }

const PRESETS = {
  night:  { bg: '#101C3D', deco: (c, W, H) => { stars(c, W, H); } },
  sunset: { bg: '#4E1F3B', deco: (c, W, H) => { grad(c, W, H, '#FF8C42', '#4E1F3B'); } },
  mint:   { bg: '#0F2E27', deco: (c, W, H) => { grad(c, W, H, '#5CE0B3', '#0F2E27'); } },
};
function stars(c, W, H) { c.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 90; i++) { const s = Math.random() * 4 + 1; c.fillRect(Math.random() * W, Math.random() * H, s, s); } }
function grad(c, W, H, a, b) { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, a); g.addColorStop(1, b); c.fillStyle = g; c.fillRect(0, 0, W, H); }
// 프리셋은 배경 이미지처럼 동작하도록 오프스크린 이미지로 구워 넣음
$('presetRow').addEventListener('click', (e) => {
  const p = PRESETS[e.target.dataset.preset];
  if (!p) return;
  const off = document.createElement('canvas');
  [off.width, off.height] = [1080, 1080];
  const o = off.getContext('2d');
  o.fillStyle = p.bg; o.fillRect(0, 0, 1080, 1080);
  p.deco(o, 1080, 1080);
  const img = new Image();
  img.onload = () => {
    state.img = { el: img, src: `프리셋:${e.target.dataset.preset}`, zoom: 1, x: .5, y: .5 };
    $('canvasWrap').classList.remove('noimg');
    render();
    toast(`${e.target.textContent} 배경 적용`);
  };
  img.src = off.toDataURL('image/png');
});

// ----- 문구 레이어 -----
function selLayer() { return state.layers.find(l => l.id === state.sel) || null; }
function selectLayer(id) {
  state.sel = id;
  const L = selLayer();
  $('layerEditor').hidden = !L;
  if (L) {
    $('txtContent').value = L.text;
    $('txtFont').value = L.font;
    $('txtSize').value = L.size; $('sizeVal').textContent = L.size;
    $('txtX').value = Math.round(L.x * 100); $('xVal').textContent = Math.round(L.x * 100);
    $('txtY').value = Math.round(L.y * 100); $('yVal').textContent = Math.round(L.y * 100);
    $('txtOutline').checked = L.outline;
    $('txtCustom').value = L.color;
    markOn($('txtColors'), L.color);
  }
  renderLayerList(); render();
}
function renderLayerList() {
  const ul = $('layerList');
  ul.innerHTML = state.layers.length ? '' : '<li class="layer-empty">문구가 없습니다 — 추가해 보세요</li>';
  state.layers.forEach((L, i) => {
    const li = document.createElement('li');
    li.className = 'layer-item' + (L.id === state.sel ? ' on' : '');
    li.innerHTML = `<span class="li-dot" style="background:${L.color}"></span>` +
      `<span class="li-text">${L.text.trim() ? L.text.replace(/\n/g, ' ').slice(0, 14) : '(빈 문구)'}</span>` +
      `<button class="li-del" title="삭제">✕</button>`;
    li.onclick = () => selectLayer(L.id);
    li.querySelector('.li-del').onclick = (e) => {
      e.stopPropagation();
      state.layers = state.layers.filter(x => x.id !== L.id);
      if (state.sel === L.id) state.sel = state.layers[0]?.id ?? null;
      $('layerEditor').hidden = !selLayer();
      renderLayerList(); render();
    };
    ul.appendChild(li);
  });
}
$('addLayer').onclick = () => {
  if (state.layers.length >= 8) { toast('문구는 최대 8개까지예요', 'err'); return; }
  const L = { id: uid(), text: state.layers.length ? '' : '문구를 입력하세요',
              x: .5, y: .5 + state.layers.length * .12, size: 64, color: '#FFFFFF',
              font: "'Black Han Sans'", outline: true };
  state.layers.push(L);
  selectLayer(L.id);
  $('txtContent').focus();
};

// 레이어 에디터 입력
const onEdit = (fn) => { const L = selLayer(); if (L) { fn(L); render(); renderLayerList(); } };
$('txtContent').addEventListener('input', () => onEdit(L => L.text = $('txtContent').value));
$('txtFont').addEventListener('change', () => onEdit(L => L.font = $('txtFont').value));
$('txtSize').addEventListener('input', () => onEdit(L => { L.size = +$('txtSize').value; $('sizeVal').textContent = L.size; }));
$('txtX').addEventListener('input', () => onEdit(L => { L.x = $('txtX').value / 100; $('xVal').textContent = $('txtX').value; }));
$('txtY').addEventListener('input', () => onEdit(L => { L.y = $('txtY').value / 100; $('yVal').textContent = $('txtY').value; }));
$('txtOutline').addEventListener('change', () => onEdit(L => L.outline = $('txtOutline').checked));
$('txtColors').addEventListener('click', (e) => { if (e.target.dataset.c) { onEdit(L => { L.color = e.target.dataset.c; markOn($('txtColors'), L.color); }); } });
$('txtCustom').addEventListener('input', () => onEdit(L => { L.color = $('txtCustom').value; markOn($('txtColors'), L.color); }));

// ----- 캔버스 드래그 (문구 이동 / 이미지 팬) -----
let drag = null;
board.addEventListener('pointerdown', (e) => {
  const r = board.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width * board.width;
  const py = (e.clientY - r.top) / r.height * board.height;
  // 위쪽 레이어부터 히트
  for (let i = layerBoxes.length - 1; i >= 0; i--) {
    const b = layerBoxes[i];
    if (b.w && px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
      selectLayer(b.id);
      drag = { kind: 'layer', id: b.id, offX: px, offY: py };
      board.setPointerCapture(e.pointerId);
      board.classList.add('grabbing');
      return;
    }
  }
  if (state.img) {
    drag = { kind: 'img', sx: state.img.x, sy: state.img.y, px, py };
    board.setPointerCapture(e.pointerId);
    board.classList.add('grabbing');
  }
});
board.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const r = board.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width * board.width;
  const py = (e.clientY - r.top) / r.height * board.height;
  if (drag.kind === 'layer') {
    const L = state.layers.find(l => l.id === drag.id);
    if (L) {
      L.x = Math.max(0, Math.min(1, px / board.width));
      L.y = Math.max(0, Math.min(1, py / board.height));
      $('txtX').value = Math.round(L.x * 100); $('xVal').textContent = Math.round(L.x * 100);
      $('txtY').value = Math.round(L.y * 100); $('yVal').textContent = Math.round(L.y * 100);
      render();
    }
  } else if (state.img) {
    const dw = (board.width / state.img.el.naturalWidth) || 1;
    state.img.x = Math.max(0, Math.min(1, drag.sx - (px - drag.px) / board.width * .5));
    state.img.y = Math.max(0, Math.min(1, drag.sy - (py - drag.py) / board.height * .5));
    render();
  }
});
const endDrag = () => { drag = null; board.classList.remove('grabbing'); };
board.addEventListener('pointerup', endDrag);
board.addEventListener('pointercancel', endDrag);

// ----- 비율 -----
document.querySelectorAll('.ratio-tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.ratio-tab').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-selected', 'false'); });
  t.classList.add('on'); t.setAttribute('aria-selected', 'true');
  state.ratio = t.dataset.ratio;
  render();
}));

// ----- 패널 탭 -----
document.querySelectorAll('.ptab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.ptab').forEach(x => x.classList.remove('on'));
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('on'));
  t.classList.add('on');
  $('pane-' + t.dataset.panel).classList.add('on');
}));

// ----- 내려받기 -----
function download(mime, ext, quality) {
  board.toBlob((blob) => {
    if (!blob) { toast('저장 실패 — 다시 시도해 주세요', 'err'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `zzal-${state.ratio.replace(':', 'x')}-${Date.now().toString(36)}.${ext}`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`${ext.toUpperCase()}로 저장했어요 (메타데이터 없이 새로 인코딩됨)`);
  }, mime, quality);
}
$('dlPng').onclick = () => download('image/png', 'png');
$('dlJpg').onclick = () => download('image/jpeg', 'jpg', .92);

// ----- 템플릿 -----
const TPL_KEY = 'zzal-templates';
function loadTpls() {
  try {
    const raw = localStorage.getItem(TPL_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.filter(validTpl) : [];
  } catch { return []; }
}
function saveTpls(arr) { localStorage.setItem(TPL_KEY, JSON.stringify(arr)); }
function validTpl(t) {
  return t && typeof t.id === 'string' && typeof t.name === 'string' &&
         t.state && RATIOS[t.state.ratio] && Array.isArray(t.state.layers);
}
function snapshotState(imgSrc) {
  return {
    ratio: state.ratio, bg: state.bg,
    img: state.img ? { src: imgSrc ?? state.img.src, zoom: state.img.zoom, x: state.img.x, y: state.img.y, dataURL: state.img.dataURL } : null,
    layers: state.layers.map(L => ({ ...L })),
  };
}
function applyState(s) {
  state.ratio = s.ratio; state.bg = s.bg;
  state.layers = s.layers.map(L => ({ outline: true, ...L }));
  state.img = null;
  if (s.img?.dataURL) {
    const img = new Image();
    img.onload = () => { state.img = { el: img, src: s.img.src, zoom: s.img.zoom, x: s.img.x, y: s.img.y, dataURL: s.img.dataURL }; $('canvasWrap').classList.remove('noimg'); render(); };
    img.src = s.img.dataURL;
  } else $('canvasWrap').classList.add('noimg');
  document.querySelectorAll('.ratio-tab').forEach(t => {
    const on = t.dataset.ratio === state.ratio;
    t.classList.toggle('on', on); t.setAttribute('aria-selected', on);
  });
  $('bgCustom').value = state.bg;
  state.sel = state.layers[0]?.id ?? null;
  selectLayer(state.sel);
  render();
}
function currentThumb() {
  const off = document.createElement('canvas');
  const [W, H] = canvasWH();
  const s = 128 / Math.max(W, H);
  off.width = W * s; off.height = H * s;
  off.getContext('2d').drawImage(board, 0, 0, off.width, off.height);
  return off.toDataURL('image/jpeg', .6);
}
function renderTplList() {
  const tpls = loadTpls();
  const ul = $('tplList');
  ul.innerHTML = tpls.length ? '' : '<li class="tpl-empty">저장된 템플릿이 없습니다</li>';
  tpls.forEach(t => {
    const li = document.createElement('li');
    li.className = 'tpl-item';
    li.innerHTML = `<img src="${t.thumb || ''}" alt="">` +
      `<div><p class="tpl-name">${t.name}</p><div class="tpl-actions">` +
      `<button data-a="load">불러오기</button><button data-a="update">덮어쓰기</button><button data-a="del" class="del">삭제</button>` +
      `</div></div>`;
    li.querySelector('[data-a="load"]').onclick = () => { applyState(t.state); toast(`"${t.name}" 불러왔어요`); };
    li.querySelector('[data-a="update"]').onclick = () => {
      t.state = snapshotState(); t.thumb = currentThumb();
      saveTpls(tpls); renderTplList(); toast(`"${t.name}"에 현재 상태 저장`);
    };
    li.querySelector('[data-a="del"]').onclick = () => {
      saveTpls(loadTpls().filter(x => x.id !== t.id));
      renderTplList(); toast(`"${t.name}" 삭제함`, 'err');
    };
    ul.appendChild(li);
  });
}
$('saveTpl').onclick = () => {
  // 배경 이미지를 dataURL로 구워 템플릿에 포함 (업로드 원본은 메타데이터 제거된 상태)
  const after = (dataURL) => {
    if (state.img) state.img.dataURL = dataURL;
    const tpls = loadTpls();
    const t = { id: 'tpl-' + Date.now().toString(36), name: `템플릿 ${tpls.length + 1}`,
                created: Date.now(), state: snapshotState(dataURL), thumb: currentThumb() };
    tpls.push(t);
    try { saveTpls(tpls); renderTplList(); toast(`${t.name} 저장 완료`); }
    catch { toast('저장 공간이 부족해요 — 템플릿을 줄여주세요', 'err'); }
  };
  if (state.img?.el) {
    const off = document.createElement('canvas');
    const iw = state.img.el.naturalWidth, ih = state.img.el.naturalHeight;
    const s = Math.min(1, 800 / Math.max(iw, ih));
    off.width = iw * s; off.height = ih * s;
    off.getContext('2d').drawImage(state.img.el, 0, 0, off.width, off.height);
    after(off.toDataURL('image/jpeg', .75));
  } else after(null);
};

// ----- JSON 내보내기/가져오기 -----
$('jsonExport').onclick = () => {
  const data = { app: 'meme-card-studio', v: 1, templates: loadTpls() };
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = 'zzal-templates.json';
  a.click();
  URL.revokeObjectURL(a.href);
  toast('템플릿 JSON 내보냈어요');
};
$('jsonImportBtn').onclick = () => $('jsonInput').click();
$('jsonInput').addEventListener('change', (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    let parsed;
    try { parsed = JSON.parse(rd.result); }
    catch { toast('JSON 문법이 깨져 있습니다 — 템플릿이 그대로 유지됩니다', 'err'); return; }
    // 필수 항목 검증 — 통과 전까지 기존 데이터 건드리지 않음
    if (!parsed || parsed.app !== 'meme-card-studio' || !Array.isArray(parsed.templates)) {
      toast('필수 항목이 없는 JSON입니다 — 템플릿이 그대로 유지됩니다', 'err'); return;
    }
    const ok = parsed.templates.filter(validTpl);
    saveTpls(ok);
    renderTplList();
    toast(`템플릿 ${ok.length}개를 복원했어요`);
  };
  rd.onerror = () => toast('파일을 읽지 못했어요', 'err');
  rd.readAsText(f);
});

// ----- 초기화 -----
$('canvasWrap').classList.add('noimg');
document.fonts.ready.then(render);
addStartup();
function addStartup() {
  const L1 = { id: uid(), text: '짤·카드 스튜디오', x: .5, y: .16, size: 78, color: '#FFD166', font: "'Black Han Sans'", outline: true };
  const L2 = { id: uid(), text: '이미지와 문구를 조합해 나만의 짤 만들기', x: .5, y: .82, size: 40, color: '#FFFFFF', font: "'Jua'", outline: true };
  state.layers.push(L1, L2);
  selectLayer(L1.id);
}
