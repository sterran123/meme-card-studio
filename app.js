/* 짤·카드 스튜디오 — 캔버스 기반 제작 도구
   미리보기와 내려받기가 같은 render()를 쓰므로 화면=파일 일치가 구조적으로 보장됨
   레이어 종류: text(문구) / img(겹친 이미지·스티커) / shape(도형) */
'use strict';
const $ = (id) => document.getElementById(id);

// ----- 상태 -----
const RATIOS = { '1:1': [1080, 1080], '4:5': [1080, 1350], '9:16': [1080, 1920] };
const MAX_IMG_BYTES = 12 * 1024 * 1024;
const LAYER_TYPES = ['text', 'img', 'shape'];
const state = {
  ratio: '1:1',
  bg: '#17141F',
  img: null,          // 배경 사진 { el, src, zoom, x, y, dataURL }
  layers: [],
  sel: null,
};
let layerSeq = 0;
const uid = () => 'L' + (++layerSeq) + '-' + Date.now().toString(36);

// ----- 캔버스 -----
const board = $('board'), ctx = board.getContext('2d');
const canvasWH = () => RATIOS[state.ratio];
let layerBoxes = [];   // { id, x, y, w, h } 렌더 때 계산

function render() {
  const [W, H] = canvasWH();
  if (board.width !== W || board.height !== H) { board.width = W; board.height = H; }
  ctx.letterSpacing = '0px';
  ctx.fillStyle = state.bg;
  ctx.fillRect(0, 0, W, H);
  if (state.img?.el) {
    const iw = state.img.el.naturalWidth, ih = state.img.el.naturalHeight;
    const cover = Math.max(W / iw, H / ih) * state.img.zoom;
    const dw = iw * cover, dh = ih * cover;
    ctx.drawImage(state.img.el, W * state.img.x - dw / 2, H * state.img.y - dh / 2, dw, dh);
  }
  layerBoxes = [];
  for (const L of state.layers) {
    if (L.type === 'text') drawTextLayer(L, W, H);
    else if (L.type === 'img') drawImgLayer(L, W, H);
    else if (L.type === 'shape') drawShapeLayer(L, W, H);
  }
}

function selBox(L, x, y, w, h) {
  layerBoxes.push({ id: L.id, x, y, w, h });
  if (L.id === state.sel) {
    ctx.strokeStyle = 'rgba(139,124,255,.9)';
    ctx.lineWidth = 3; ctx.setLineDash([10, 8]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  }
}
const lx = (v) => Math.max(0, Math.min(1, v || 0));

// --- 문구 레이어 ---
function drawTextLayer(L, W, H) {
  if (!L.text.trim()) { layerBoxes.push({ id: L.id, x: 0, y: 0, w: 0, h: 0 }); return; }
  const size = Math.min(Math.max(L.size | 0, 8), 240);
  const cx = W * lx(L.x), cy = H * lx(L.y);
  ctx.save();
  ctx.font = `${L.italic ? 'italic ' : ''}${L.weight || 400} ${size}px ${L.font}, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${L.ls || 0}px`;
  const maxW = W - 80;
  const lines = wrapText(L.text, maxW);
  const lh = size * 1.35;
  let maxLine = 0;
  for (const line of lines) maxLine = Math.max(maxLine, ctx.measureText(line).width);
  const bh = lines.length * lh;
  ctx.translate(cx, cy);
  if (L.rot) ctx.rotate(L.rot * Math.PI / 180);
  ctx.globalAlpha = (L.op ?? 100) / 100;
  const fillOf = (dy) => {
    if (L.fx === 'grad') {
      const a = (L.grad?.ang ?? 180) * Math.PI / 180;
      const g = ctx.createLinearGradient(-Math.cos(a) * maxLine / 2, -Math.sin(a) * bh / 2, Math.cos(a) * maxLine / 2, Math.sin(a) * bh / 2);
      g.addColorStop(0, L.grad?.a || '#FFD166');
      g.addColorStop(1, L.grad?.b || '#FF6B5E');
      return g;
    }
    return L.color;
  };
  const drawAll = (dx, dy, style) => {
    lines.forEach((line, i) => {
      const y = (i - (lines.length - 1) / 2) * lh + dy;
      ctx.fillStyle = style;
      ctx.fillText(line, dx, y);
    });
  };
  if (L.outline) {
    ctx.lineWidth = Math.max(4, size * .09);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(14,11,20,.85)';
    lines.forEach((line, i) => ctx.strokeText(line, 0, (i - (lines.length - 1) / 2) * lh));
  }
  if (L.fx === 'glitch') { drawAll(-4, 0, 'rgba(92,224,255,.75)'); drawAll(4, 0, 'rgba(255,92,224,.75)'); }
  drawAll(0, 0, fillOf());
  ctx.restore();
  ctx.globalAlpha = 1;
  selBox(L, cx - maxLine / 2 - 10, cy - bh / 2 - size, maxLine + 20, bh + size * .4);
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

// --- 이미지 레이어 ---
function drawImgLayer(L, W, H) {
  if (!L.el?.complete || !L.el?.naturalWidth) { layerBoxes.push({ id: L.id, x: 0, y: 0, w: 0, h: 0 }); return; }
  const w = W * Math.min(Math.max(L.w || .3, .02), 2);
  const h = w * L.el.naturalHeight / L.el.naturalWidth;
  const cx = W * lx(L.x), cy = H * lx(L.y);
  ctx.save();
  ctx.translate(cx, cy);
  if (L.rot) ctx.rotate(L.rot * Math.PI / 180);
  ctx.globalAlpha = (L.op ?? 100) / 100;
  ctx.drawImage(L.el, -w / 2, -h / 2, w, h);
  ctx.restore();
  ctx.globalAlpha = 1;
  selBox(L, cx - w / 2 - 6, cy - h / 2 - 6, w + 12, h + 12);
}

// --- 도형 레이어 ---
function drawShapeLayer(L, W, H) {
  const w = W * Math.min(Math.max(L.w || .3, .02), 1.5);
  const h = w * .8;
  const cx = W * lx(L.x), cy = H * lx(L.y);
  ctx.save();
  ctx.translate(cx, cy);
  if (L.rot) ctx.rotate(L.rot * Math.PI / 180);
  ctx.globalAlpha = (L.op ?? 100) / 100;
  let fill = L.color;
  if (L.fx === 'grad') {
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, L.grad?.a || '#8B7CFF');
    g.addColorStop(1, L.grad?.b || '#5CE0B3');
    fill = g;
  }
  ctx.fillStyle = fill;
  shapePath(L.shape, w, h);
  ctx.fill();
  ctx.restore();
  ctx.globalAlpha = 1;
  selBox(L, cx - w / 2 - 6, cy - h / 2 - 6, w + 12, h + 12);
}
function shapePath(shape, w, h) {
  const r = w / 2;
  ctx.beginPath();
  if (shape === 'rect') ctx.roundRect(-w / 2, -h / 2, w, h, w * .06);
  else if (shape === 'circle') ctx.arc(0, 0, r, 0, Math.PI * 2);
  else if (shape === 'tri') { ctx.moveTo(0, -r); ctx.lineTo(r, r * .8); ctx.lineTo(-r, r * .8); ctx.closePath(); }
  else if (shape === 'star') starPath(r, 5);
  else if (shape === 'burst') starPath(r, 12);
  else if (shape === 'bubble') {
    ctx.roundRect(-w / 2, -h / 2, w, h * .75, w * .1);
    ctx.moveTo(-w * .15, h * .2); ctx.lineTo(-w * .3, h / 2); ctx.lineTo(w * .02, h * .25); ctx.closePath();
  }
}
function starPath(r, points) {
  for (let i = 0; i < points * 2; i++) {
    const rr = i % 2 ? r * .45 : r;
    const a = i * Math.PI / points - Math.PI / 2;
    ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
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

// ----- 이미지 불러오기 -----
const IMG_OK = ['image/png', 'image/jpeg'];
function checkFile(file) {
  if (!file) return null;
  if (!IMG_OK.includes(file.type)) { toast(`지원하지 않는 파일입니다 — PNG·JPEG만 가능해요 (받은 파일: ${file.type || file.name.split('.').pop() + ' 형식'})`, 'err'); return null; }
  if (file.size === 0) { toast('빈 파일입니다 — 다른 이미지를 넣어주세요', 'err'); return null; }
  if (file.size > MAX_IMG_BYTES) { toast(`파일이 너무 큽니다 — 12MB 이하만 가능해요 (${(file.size / 1048576).toFixed(1)}MB)`, 'err'); return null; }
  return file;
}
function loadImageFile(file) {
  if (!checkFile(file)) return false;
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
// 오버레이 이미지 → img 레이어로 추가
function loadOverlayFile(file) {
  if (!checkFile(file)) return;
  const img = new Image();
  img.onload = () => {
    addLayer({ type: 'img', el: img, src: file.name, dataURL: img.src, x: .5, y: .5, w: .4, rot: 0, op: 100 });
    toast('사진을 레이어로 추가했어요 — 드래그로 옮기세요');
  };
  img.onerror = () => toast('이미지를 읽지 못했어요', 'err');
  img.src = URL.createObjectURL(file);
}
$('imgBtn').onclick = () => $('imgInput').click();
$('ovBtn').onclick = () => $('ovInput').click();
$('imgInput').addEventListener('change', (e) => { loadImageFile(e.target.files[0]); e.target.value = ''; });
$('ovInput').addEventListener('change', (e) => { loadOverlayFile(e.target.files[0]); e.target.value = ''; });

const wrap = $('canvasWrap');
for (const ev of ['dragenter', 'dragover']) wrap.addEventListener(ev, (e) => { e.preventDefault(); wrap.classList.add('dragover'); });
for (const ev of ['dragleave', 'drop']) wrap.addEventListener(ev, (e) => { e.preventDefault(); wrap.classList.remove('dragover'); });
wrap.addEventListener('drop', (e) => loadImageFile(e.dataTransfer.files[0]));
$('imgZoom').addEventListener('input', () => { if (state.img) { state.img.zoom = $('imgZoom').value / 100; render(); } });

// ----- 배경 자동 제거 (모서리 플러드필) -----
function removeBg(imgEl, tol) {
  const iw = imgEl.naturalWidth, ih = imgEl.naturalHeight;
  const s = Math.min(1, 900 / Math.max(iw, ih));
  const w = Math.round(iw * s), h = Math.round(ih * s);
  const off = document.createElement('canvas');
  off.width = w; off.height = h;
  const o = off.getContext('2d');
  o.drawImage(imgEl, 0, 0, w, h);
  const d = o.getImageData(0, 0, w, h), px = d.data;
  // 네 모서리 4x4 블록의 평균색을 시드로 사용
  const seed = (sx, sy) => {
    let r = 0, g = 0, b = 0;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const i = ((sy + y) * w + sx + x) * 4;
      r += px[i]; g += px[i + 1]; b += px[i + 2];
    }
    return [r / 16, g / 16, b / 16];
  };
  const seeds = [seed(0, 0), seed(w - 4, 0), seed(0, h - 4), seed(w - 4, h - 4)];
  const dist = (i, s) => Math.abs(px[i] - s[0]) + Math.abs(px[i + 1] - s[1]) + Math.abs(px[i + 2] - s[2]);
  const near = (i) => seeds.some(s => dist(i, s) < tol * 3);
  // 가장자리에서 BFS — 배경은 보통 외곽과 연결되어 있음
  const seen = new Uint8Array(w * h), q = [];
  const push = (x, y) => { const p = y * w + x; if (!seen[p]) { seen[p] = 1; q.push(p); } };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (q.length) {
    const p = q.pop(), i = p * 4, x = p % w, y = (p / w) | 0;
    if (!near(i)) continue;
    px[i + 3] = 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  o.putImageData(d, 0, 0);
  return off;
}
function applyBgRemove(target) {
  const tol = +$('bgTol').value;
  if (target === 'base') {
    if (!state.img?.el) { toast('먼저 배경 이미지를 불러오세요', 'err'); return; }
    const off = removeBg(state.img.el, tol);
    const img = new Image();
    img.onload = () => { state.img.el = img; state.img.dataURL = img.src; render(); toast('배경 제거 완료 — 투명한 부분은 배경색이 보여요'); };
    img.src = off.toDataURL('image/png');
  } else {
    const L = selLayer();
    if (L?.type !== 'img') { toast('이미지 레이어를 먼저 선택해 주세요', 'err'); return; }
    const off = removeBg(L.el, tol);
    const img = new Image();
    img.onload = () => { L.el = img; L.dataURL = img.src; render(); toast('레이어 배경 제거 완료'); };
    img.src = off.toDataURL('image/png');
  }
}
$('bgTol').addEventListener('input', () => { $('tolVal').textContent = $('bgTol').value; });
$('bgRemoveBtn').onclick = () => applyBgRemove('base');
$('ovBgRemove').onclick = () => applyBgRemove('layer');

// 배경색·프리셋
function setBg(c) { state.bg = c; render(); markOn($('bgColors'), c); }
$('bgColors').addEventListener('click', (e) => { if (e.target.dataset.c) setBg(e.target.dataset.c); });
$('bgCustom').addEventListener('input', () => setBg($('bgCustom').value));
function markOn(row, c) { [...row.querySelectorAll('.swatch')].forEach(s => s.classList.toggle('on', s.dataset.c === c)); }

const PRESETS = {
  night:  { bg: '#101C3D', deco: (c, W, H) => { c.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 90; i++) { const s = Math.random() * 4 + 1; c.fillRect(Math.random() * W, Math.random() * H, s, s); } } },
  sunset: { bg: '#4E1F3B', deco: (c, W, H) => grad(c, W, H, '#FF8C42', '#4E1F3B') },
  mint:   { bg: '#0F2E27', deco: (c, W, H) => grad(c, W, H, '#5CE0B3', '#0F2E27') },
  paper:  { bg: '#F4EFFA', deco: (c, W, H) => { c.fillStyle = 'rgba(139,124,255,.18)'; for (let i = 0; i < 8; i++) c.fillRect(0, i * 135 + 60, W, 2); } },
};
function grad(c, W, H, a, b) { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, a); g.addColorStop(1, b); c.fillStyle = g; c.fillRect(0, 0, W, H); }
$('presetRow').addEventListener('click', (e) => {
  const p = PRESETS[e.target.dataset.preset];
  if (!p) return;
  const off = document.createElement('canvas');
  off.width = off.height = 1080;
  const o = off.getContext('2d');
  o.fillStyle = p.bg; o.fillRect(0, 0, 1080, 1080);
  p.deco(o, 1080, 1080);
  const img = new Image();
  img.onload = () => {
    state.img = { el: img, src: `프리셋:${e.target.dataset.preset}`, zoom: 1, x: .5, y: .5, dataURL: img.src };
    $('canvasWrap').classList.remove('noimg');
    render();
    toast(`${e.target.textContent} 배경 적용`);
  };
  img.src = off.toDataURL('image/png');
});

// ----- 레이어 관리 -----
function addLayer(L) {
  if (state.layers.length >= 20) { toast('레이어는 최대 20개까지예요', 'err'); return null; }
  const layer = { id: uid(), rot: 0, op: 100, x: .5, y: .5, ...L };
  state.layers.push(layer);
  selectLayer(layer.id);
  render();
  return layer;
}
function selLayer() { return state.layers.find(l => l.id === state.sel) || null; }
const LAYER_ICON = { text: '𝐓', img: '🖼', shape: '◆' };
function renderLayerList() {
  const ul = $('layerList');
  ul.innerHTML = state.layers.length ? '' : '<li class="layer-empty">레이어가 없습니다 — 문구·도형·스티커를 추가해 보세요</li>';
  state.layers.forEach((L) => {
    const li = document.createElement('li');
    li.className = 'layer-item' + (L.id === state.sel ? ' on' : '');
    const label = L.type === 'text' ? (L.text.trim() ? L.text.replace(/\n/g, ' ').slice(0, 14) : '(빈 문구)')
      : L.type === 'img' ? (L.src || '이미지').slice(0, 14)
      : { rect: '사각형', circle: '원', tri: '삼각형', star: '별', bubble: '말풍선', burst: '팡파레' }[L.shape] || '도형';
    li.innerHTML = `<span class="li-ico">${LAYER_ICON[L.type]}</span>` +
      (L.type === 'text' ? `<span class="li-dot" style="background:${L.fx === 'grad' ? (L.grad?.a || '#fff') : L.color}"></span>` : '') +
      `<span class="li-text">${label}</span><button class="li-del" title="삭제">✕</button>`;
    li.onclick = () => selectLayer(L.id);
    li.querySelector('.li-del').onclick = (e) => {
      e.stopPropagation();
      state.layers = state.layers.filter(x => x.id !== L.id);
      if (state.sel === L.id) state.sel = state.layers.at(-1)?.id ?? null;
      $('layerEditor').hidden = !selLayer();
      renderLayerList(); render();
    };
    ul.appendChild(li);
  });
}
function selectLayer(id) {
  state.sel = id;
  const L = selLayer();
  $('layerEditor').hidden = !L;
  if (!L) { renderLayerList(); render(); return; }
  // 공통
  $('txtX').value = Math.round((L.x ?? .5) * 100); $('xVal').textContent = Math.round((L.x ?? .5) * 100);
  $('txtY').value = Math.round((L.y ?? .5) * 100); $('yVal').textContent = Math.round((L.y ?? .5) * 100);
  $('layRot').value = L.rot || 0; $('rotVal').textContent = L.rot || 0;
  $('layOp').value = L.op ?? 100; $('opVal').textContent = L.op ?? 100;
  $('textFields').hidden = L.type !== 'text';
  $('imgFields').hidden = L.type !== 'img';
  $('shapeFields').hidden = L.type !== 'shape';
  if (L.type === 'text') {
    $('txtContent').value = L.text;
    $('txtFont').value = L.font;
    $('txtSize').value = L.size; $('sizeVal').textContent = L.size;
    $('txtLs').value = L.ls || 0; $('lsVal').textContent = L.ls || 0;
    $('txtWeight').value = L.weight || 400;
    $('txtItalic').checked = !!L.italic;
    $('txtOutline').checked = L.outline;
    $('txtFx').value = L.fx || 'solid';
    $('gradRow').hidden = L.fx !== 'grad';
    if (L.grad) { $('gradA').value = L.grad.a; $('gradB').value = L.grad.b; $('gradAng').value = L.grad.ang; }
    $('txtCustom').value = L.color;
    markOn($('txtColors'), L.color);
  } else if (L.type === 'img') {
    $('ovSize').value = Math.round((L.w || .4) * 100); $('ovSizeVal').textContent = Math.round((L.w || .4) * 100);
  } else if (L.type === 'shape') {
    $('shSize').value = Math.round((L.w || .3) * 100); $('shSizeVal').textContent = Math.round((L.w || .3) * 100);
    $('shFx').value = L.fx || 'solid';
    $('shGradRow').hidden = L.fx !== 'grad';
    if (L.grad) { $('shGradA').value = L.grad.a; $('shGradB').value = L.grad.b; }
    $('shCustom').value = L.color;
    markOn($('shColors'), L.color);
  }
  renderLayerList(); render();
}

$('addLayer').onclick = () => {
  const L = addLayer({
    type: 'text', text: state.layers.length ? '' : '문구를 입력하세요',
    x: .5, y: .5 + (state.layers.filter(l => l.type === 'text').length * .12), size: 64, color: '#FFFFFF',
    font: "'Black Han Sans'", weight: 400, italic: false, ls: 0, outline: true, fx: 'solid',
    grad: { a: '#FFD166', b: '#FF6B5E', ang: 180 },
  });
  if (L) { document.querySelector('[data-panel="layer"]').click(); $('txtContent').focus(); }
};

// 공통 레이어 편집
const onEdit = (fn) => { const L = selLayer(); if (L) { fn(L); render(); renderLayerList(); } };
$('txtX').addEventListener('input', () => onEdit(L => { L.x = $('txtX').value / 100; $('xVal').textContent = $('txtX').value; }));
$('txtY').addEventListener('input', () => onEdit(L => { L.y = $('txtY').value / 100; $('yVal').textContent = $('txtY').value; }));
$('layRot').addEventListener('input', () => onEdit(L => { L.rot = +$('layRot').value; $('rotVal').textContent = $('layRot').value; }));
$('layOp').addEventListener('input', () => onEdit(L => { L.op = +$('layOp').value; $('opVal').textContent = $('layOp').value; }));
$('layerUp').onclick = () => moveLayer(1);
$('layerDown').onclick = () => moveLayer(-1);
$('layerDel').onclick = () => {
  const L = selLayer(); if (!L) return;
  state.layers = state.layers.filter(x => x.id !== L.id);
  state.sel = state.layers.at(-1)?.id ?? null;
  selectLayer(state.sel);
};
function moveLayer(dir) {
  const i = state.layers.findIndex(l => l.id === state.sel);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= state.layers.length) return;
  [state.layers[i], state.layers[j]] = [state.layers[j], state.layers[i]];
  renderLayerList(); render();
}

// 문구 편집
$('txtContent').addEventListener('input', () => onEdit(L => L.text = $('txtContent').value));
$('txtFont').addEventListener('change', () => onEdit(L => L.font = $('txtFont').value));
$('txtSize').addEventListener('input', () => onEdit(L => { L.size = +$('txtSize').value; $('sizeVal').textContent = L.size; }));
$('txtLs').addEventListener('input', () => onEdit(L => { L.ls = +$('txtLs').value; $('lsVal').textContent = $('txtLs').value; }));
$('txtWeight').addEventListener('change', () => onEdit(L => L.weight = +$('txtWeight').value));
$('txtItalic').addEventListener('change', () => onEdit(L => L.italic = $('txtItalic').checked));
$('txtOutline').addEventListener('change', () => onEdit(L => L.outline = $('txtOutline').checked));
$('txtFx').addEventListener('change', () => onEdit(L => { L.fx = $('txtFx').value; $('gradRow').hidden = L.fx !== 'grad'; }));
$('gradA').addEventListener('input', () => onEdit(L => L.grad = { ...(L.grad || {}), a: $('gradA').value }));
$('gradB').addEventListener('input', () => onEdit(L => L.grad = { ...(L.grad || {}), b: $('gradB').value }));
$('gradAng').addEventListener('input', () => onEdit(L => L.grad = { ...(L.grad || {}), ang: +$('gradAng').value }));
$('txtColors').addEventListener('click', (e) => { if (e.target.dataset.c) onEdit(L => { L.color = e.target.dataset.c; markOn($('txtColors'), L.color); }); });
$('txtCustom').addEventListener('input', () => onEdit(L => { L.color = $('txtCustom').value; markOn($('txtColors'), L.color); }));

// 이미지 레이어 편집
$('ovSize').addEventListener('input', () => onEdit(L => { L.w = $('ovSize').value / 100; $('ovSizeVal').textContent = $('ovSize').value; }));

// 도형 편집
$('shSize').addEventListener('input', () => onEdit(L => { L.w = $('shSize').value / 100; $('shSizeVal').textContent = $('shSize').value; }));
$('shFx').addEventListener('change', () => onEdit(L => { L.fx = $('shFx').value; $('shGradRow').hidden = L.fx !== 'grad'; }));
$('shGradA').addEventListener('input', () => onEdit(L => L.grad = { ...(L.grad || {}), a: $('shGradA').value }));
$('shGradB').addEventListener('input', () => onEdit(L => L.grad = { ...(L.grad || {}), b: $('shGradB').value }));
$('shColors').addEventListener('click', (e) => { if (e.target.dataset.c) onEdit(L => { L.color = e.target.dataset.c; markOn($('shColors'), L.color); }); });
$('shCustom').addEventListener('input', () => onEdit(L => { L.color = $('shCustom').value; markOn($('shColors'), L.color); }));

// 도형 추가
$('shapeGrid').addEventListener('click', (e) => {
  const s = e.target.closest('button')?.dataset.shape;
  if (!s) return;
  addLayer({ type: 'shape', shape: s, x: .5, y: .5, w: .3, color: '#8B7CFF', fx: 'solid', grad: { a: '#8B7CFF', b: '#5CE0B3' } });
  document.querySelector('[data-panel="layer"]').click();
});

// ----- 스티커 라이브러리 -----
const STICKERS = {
  '하늘': ['cloud', 'sun', 'moon', 'star'],
  '반짝임': ['sparkle', 'lightning', 'star', 'meteor'],
  '자연': ['wave', 'tree', 'cloud'],
  '사물': ['house', 'bubble', 'heart', 'rocket', 'ufo'],
};
const stickerEls = {};   // src 캐시
const stickerCache = {};
function stickerEl(name) {
  if (!stickerCache[name]) {
    stickerCache[name] = new Promise((res) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = () => res(null);
      img.src = `assets/stickers/${name}.svg`;
    });
  }
  return stickerCache[name];
}
function renderStickerPanel() {
  const cats = $('stickerCats');
  cats.innerHTML = '';
  Object.keys(STICKERS).forEach((c, i) => {
    const b = document.createElement('button');
    b.textContent = c;
    b.className = i === 0 ? 'on' : '';
    b.onclick = () => {
      [...cats.children].forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      renderStickerGrid(c);
    };
    cats.appendChild(b);
  });
  renderStickerGrid(Object.keys(STICKERS)[0]);
}
async function renderStickerGrid(cat) {
  const g = $('stickerGrid');
  g.innerHTML = '';
  for (const name of STICKERS[cat]) {
    const b = document.createElement('button');
    b.innerHTML = `<img src="assets/stickers/${name}.svg" alt="${name}">`;
    b.onclick = async () => {
      const el = await stickerEl(name);
      if (!el) { toast('스티커를 불러오지 못했어요', 'err'); return; }
      // 템플릿 저장용 dataURL도 미래에 대비해 rasterize
      addLayer({ type: 'img', el, src: `스티커:${name}`, sticker: name, x: .5, y: .5, w: .3 });
      document.querySelector('[data-panel="layer"]').click();
      toast(`${name} 스티커 추가`);
    };
    g.appendChild(b);
  }
}
// 스티커/이미지 레이어 dataURL 만들기 (템플릿 저장용)
function rasterize(el, max = 400) {
  const s = Math.min(1, max / Math.max(el.naturalWidth, el.naturalHeight));
  const off = document.createElement('canvas');
  off.width = Math.max(1, el.naturalWidth * s);
  off.height = Math.max(1, el.naturalHeight * s);
  off.getContext('2d').drawImage(el, 0, 0, off.width, off.height);
  return off.toDataURL('image/png');
}

// ----- 캔버스 드래그 -----
let drag = null;
board.addEventListener('pointerdown', (e) => {
  const r = board.getBoundingClientRect();
  const px = (e.clientX - r.left) / r.width * board.width;
  const py = (e.clientY - r.top) / r.height * board.height;
  for (let i = layerBoxes.length - 1; i >= 0; i--) {
    const b = layerBoxes[i];
    if (b.w && px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) {
      selectLayer(b.id);
      drag = { kind: 'layer', id: b.id };
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
      L.x = lx(px / board.width);
      L.y = lx(py / board.height);
      $('txtX').value = Math.round(L.x * 100); $('xVal').textContent = Math.round(L.x * 100);
      $('txtY').value = Math.round(L.y * 100); $('yVal').textContent = Math.round(L.y * 100);
      render();
    }
  } else if (state.img) {
    state.img.x = lx(drag.sx - (px - drag.px) / board.width * .5);
    state.img.y = lx(drag.sy - (py - drag.py) / board.height * .5);
    render();
  }
});
const endDrag = () => { drag = null; board.classList.remove('grabbing'); };
board.addEventListener('pointerup', endDrag);
board.addEventListener('pointercancel', endDrag);

// ----- 비율·탭·내보내기 -----
document.querySelectorAll('.ratio-tab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.ratio-tab').forEach(x => { x.classList.remove('on'); x.setAttribute('aria-selected', 'false'); });
  t.classList.add('on'); t.setAttribute('aria-selected', 'true');
  state.ratio = t.dataset.ratio;
  render();
}));
document.querySelectorAll('.ptab').forEach(t => t.addEventListener('click', () => {
  document.querySelectorAll('.ptab').forEach(x => x.classList.remove('on'));
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('on'));
  t.classList.add('on');
  $('pane-' + t.dataset.panel).classList.add('on');
}));
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

// ----- 테마 -----
const THEME_KEY = 'zzal-theme';
function applyTheme(t) {
  document.body.classList.toggle('light', t === 'light');
  $('themeBtn').textContent = t === 'light' ? '🌙 다크' : '☀️ 라이트';
  localStorage.setItem(THEME_KEY, t);
}
$('themeBtn').onclick = () => applyTheme(document.body.classList.contains('light') ? 'dark' : 'light');

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
         t.state && RATIOS[t.state.ratio] && Array.isArray(t.state.layers) &&
         t.state.layers.every(l => !l.type || LAYER_TYPES.includes(l.type));
}
function snapshotState(imgDataURL) {
  return {
    ratio: state.ratio, bg: state.bg, v: 2,
    img: state.img ? {
      src: state.img.src, zoom: state.img.zoom, x: state.img.x, y: state.img.y,
      dataURL: imgDataURL ?? state.img.dataURL ?? rasterize(state.img.el, 800),
    } : null,
    layers: state.layers.map(L => {
      const c = { ...L };
      delete c.el;
      if (L.type === 'img') c.dataURL = L.dataURL || (L.el ? rasterize(L.el) : null);
      return c;
    }),
  };
}
function applyState(s) {
  state.ratio = s.ratio; state.bg = s.bg;
  state.layers = []; state.img = null;
  const pending = [];
  for (const L of (s.layers || [])) {
    const c = { rot: 0, op: 100, x: .5, y: .5, ...L };
    if (c.type === 'img' && c.dataURL) {
      pending.push(new Promise(res => {
        const img = new Image();
        img.onload = () => { c.el = img; res(); };
        img.onerror = () => res();
        img.src = c.dataURL;
      }));
    }
    state.layers.push(c);
  }
  if (s.img?.dataURL) {
    pending.push(new Promise(res => {
      const img = new Image();
      img.onload = () => { state.img = { el: img, src: s.img.src, zoom: s.img.zoom, x: s.img.x, y: s.img.y, dataURL: s.img.dataURL }; $('canvasWrap').classList.remove('noimg'); res(); };
      img.onerror = () => res();
      img.src = s.img.dataURL;
    }));
  }
  document.querySelectorAll('.ratio-tab').forEach(t => {
    const on = t.dataset.ratio === state.ratio;
    t.classList.toggle('on', on); t.setAttribute('aria-selected', on);
  });
  $('bgCustom').value = state.bg;
  Promise.all(pending).then(() => {
    state.sel = state.layers.at(-1)?.id ?? null;
    selectLayer(state.sel);
    render();
  });
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
  const tpls = loadTpls();
  const t = { id: 'tpl-' + Date.now().toString(36), name: `템플릿 ${tpls.length + 1}`,
              created: Date.now(), state: snapshotState(), thumb: currentThumb() };
  tpls.push(t);
  try { saveTpls(tpls); renderTplList(); toast(`${t.name} 저장 완료`); }
  catch { toast('저장 공간이 부족해요 — 템플릿을 줄여주세요', 'err'); }
};

// ----- JSON 내보내기/가져오기 (유연한 형식: {templates:[…]} · 단일 템플릿 · 배열) -----
$('jsonExport').onclick = () => {
  const data = { app: 'meme-card-studio', v: 2, templates: loadTpls() };
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
    // 형식 정규화: 우리 포맷 / 단일 템플릿 / 템플릿 배열 모두 허용
    let list = null;
    if (parsed && parsed.app === 'meme-card-studio' && Array.isArray(parsed.templates)) list = parsed.templates;
    else if (Array.isArray(parsed)) list = parsed;
    else if (parsed && parsed.state && parsed.name) list = [parsed];
    if (!list) { toast('필수 항목이 없는 JSON입니다 — 템플릿이 그대로 유지됩니다', 'err'); return; }
    const ok = list.filter(validTpl).map(t => ({ ...t, id: t.id || ('tpl-' + Date.now().toString(36)) }));
    if (!ok.length) { toast('가져올 수 있는 템플릿이 없습니다 — 기존 목록 유지', 'err'); return; }
    saveTpls(ok);
    renderTplList();
    toast(`템플릿 ${ok.length}개를 복원했어요`);
  };
  rd.onerror = () => toast('파일을 읽지 못했어요', 'err');
  rd.readAsText(f);
});

// ----- 초기화 -----
$('canvasWrap').classList.add('noimg');
applyTheme(localStorage.getItem(THEME_KEY) || 'dark');
renderStickerPanel();
document.fonts.ready.then(render);
addStartup();
function addStartup() {
  addLayer({ type: 'text', text: '짤·카드 스튜디오', x: .5, y: .16, size: 78, color: '#FFD166',
    font: "'Black Han Sans'", weight: 400, italic: false, ls: 0, outline: true, fx: 'solid' });
  const L2 = addLayer({ type: 'text', text: '이미지와 문구를 조합해 나만의 짤 만들기', x: .5, y: .82, size: 40, color: '#FFFFFF',
    font: "'Jua'", weight: 400, italic: false, ls: 0, outline: true, fx: 'solid' });
  selectLayer(state.layers[0].id);
}
