import { loadScene, preloadSceneEngine } from './scene.js';
import { preloadCameraLibrary, startCamera } from './camera.js';
import { createGestureTracker } from './gestures.js';
import { createLocalStore } from './storage.js';
import { createPhotoCollection } from './photos.js';

const DEFAULT_MUSIC_SRC = './music.mp3';
const SHAPE_ORDER = ['tree', 'nebula', 'heart', 'ring', 'spiral'];
const SHAPE_META = {
  tree: { name: '圣诞树', gesture: '握拳' },
  nebula: { name: '星云', gesture: '张手' },
  heart: { name: '爱心', gesture: '手势 1' },
  ring: { name: '土星环', gesture: '手势 2' },
  spiral: { name: '星河螺旋', gesture: '手势 3' },
};
const HAND_BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];
const PALM_HULL = [0, 5, 9, 13, 17];
const FINGER_TIPS = [4, 8, 12, 16, 20];
const POSE_NEON = {
  open: { line: '#b5f7cf', glow: 'rgba(119, 212, 156, 0.55)', node: '#e7fff1', palm: 'rgba(119, 212, 156, 0.08)' },
  fist: { line: '#b5f7cf', glow: 'rgba(119, 212, 156, 0.55)', node: '#e7fff1', palm: 'rgba(119, 212, 156, 0.09)' },
  one: { line: '#ffc2cc', glow: 'rgba(255, 154, 168, 0.58)', node: '#fff0f3', palm: 'rgba(255, 154, 168, 0.08)' },
  two: { line: '#bae4ff', glow: 'rgba(142, 208, 255, 0.58)', node: '#eef9ff', palm: 'rgba(142, 208, 255, 0.08)' },
  three: { line: '#ead4ff', glow: 'rgba(217, 184, 255, 0.58)', node: '#f8f0ff', palm: 'rgba(217, 184, 255, 0.08)' },
  aim: { line: '#ffe9b2', glow: 'rgba(246, 202, 130, 0.68)', node: '#fff9e6', palm: 'rgba(246, 202, 130, 0.09)' },
  press: { line: '#fff1be', glow: 'rgba(255, 215, 128, 0.78)', node: '#ffffff', palm: 'rgba(255, 215, 128, 0.11)' },
  held: { line: '#fff5cf', glow: 'rgba(255, 224, 148, 0.85)', node: '#ffffff', palm: 'rgba(255, 224, 148, 0.12)' },
  neutral: { line: 'rgba(246, 202, 130, 0.88)', glow: 'rgba(246, 202, 130, 0.45)', node: '#fff4d6', palm: 'rgba(246, 202, 130, 0.07)' },
  none: { line: 'rgba(246, 202, 130, 0.88)', glow: 'rgba(246, 202, 130, 0.45)', node: '#fff4d6', palm: 'rgba(246, 202, 130, 0.07)' },
};
const POSE_LABELS = {
  none: '未检测到手',
  open: '张手 · 星云旋转',
  fist: '握拳 · 圣诞树',
  one: '手势 1 · 爱心',
  two: '手势 2 · 土星环',
  three: '手势 3 · 星河螺旋',
  neutral: '手势待命中',
  aim: '半捏 · 瞄准中',
  press: '捏住 · 锁定中…',
  held: '已捏住 · 拖动 / 松手放回',
  pair: '双手 · 张合缩放 / 甩转',
};

const byId = id => document.getElementById(id);
const stage = byId('stage');
const mount = byId('canvas-mount');
const stageStatus = byId('stage-status');
const stageToast = byId('stage-toast');
const shapeButton = byId('shape-button');
const gestureButton = byId('gesture-button');
const gestureMessage = byId('gesture-message');
const reticle = byId('reticle');
const cameraHud = byId('camera-hud');
const cameraDot = byId('camera-dot');
const cameraBadge = byId('camera-badge');
const cameraModeButton = byId('camera-mode');
const cameraToggle = byId('camera-toggle');
const cameraOverlay = byId('camera-overlay');
const overlayCtx = cameraOverlay?.getContext('2d');
const video = byId('camera-feed');
const grid = byId('prints');
const dialog = byId('photo-viewer');
const viewerImage = byId('viewer-image');
const viewerClose = byId('viewer-close');
const viewerError = byId('viewer-error');
const previous = byId('viewer-previous');
const next = byId('viewer-next');
const studioButton = byId('studio-button');
const studio = byId('studio');
const studioClose = byId('studio-close');
const studioCount = byId('studio-count');
const studioReplace = byId('studio-replace');
const studioAdd = byId('studio-add');
const studioClear = byId('studio-clear');
const studioReset = byId('studio-reset');
const studioGrid = byId('studio-grid');
const studioStatus = byId('studio-status');
const studioMusicName = byId('studio-music-name');
const studioMusicChange = byId('studio-music-change');
const studioMusicReset = byId('studio-music-reset');
const uploadReplaceInput = byId('upload-replace-input');
const uploadAddInput = byId('upload-add-input');
const musicUploadInput = byId('music-upload-input');
const uploadStatus = byId('upload-status');
const music = byId('music');
const musicButton = byId('music-button');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const cameraSupported = Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia);

const store = createLocalStore();
const collection = createPhotoCollection(grid, store);

let scene = null;
let sceneInitCurrent = true;
let shape = 'tree';
let camera = null;
let lastHandPoints = null;
let viewer = null;
let toastTimer;
let currentMusicSrc = DEFAULT_MUSIC_SRC;

function announce(element, text) {
  if (element && element.textContent !== text) element.textContent = text;
}

function showToast(message, duration = 4200) {
  clearTimeout(toastTimer);
  if (!message) {
    stageToast.hidden = true;
    stageToast.textContent = '';
    return;
  }
  stageToast.textContent = message;
  stageToast.hidden = false;
  toastTimer = setTimeout(() => {
    stageToast.hidden = true;
  }, duration);
}

function setShape(value, { notify = false } = {}) {
  if (!SHAPE_META[value]) return;
  shape = value;
  scene?.setShape(value);
  shapeButton.dataset.shape = value;
  shapeButton.setAttribute('aria-pressed', String(value !== 'tree'));
  const nextShape = SHAPE_ORDER[(SHAPE_ORDER.indexOf(value) + 1) % SHAPE_ORDER.length];
  shapeButton.setAttribute('aria-label', `切换到${SHAPE_META[nextShape].name}`);
  if (notify) {
    const meta = SHAPE_META[value];
    showToast(`形态：${meta.name}（${meta.gesture}）`, 2200);
  }
}

function renderPhoto(index) {
  const photo = collection.all[index];
  if (!photo) return;
  const view = viewer;
  view.index = index;
  const imageRequest = ++view.imageRequest;
  viewerImage.alt = photo.alt;
  viewerImage.src = photo.thumbnail;
  announce(viewerError, '');
  announce(byId('viewer-position'), (index + 1) + ' / ' + collection.all.length);
  previous.disabled = index === 0;
  next.disabled = index === collection.all.length - 1;

  const original = new Image();
  original.src = photo.original;
  original.decode().then(() => {
    if (viewer === view && imageRequest === view.imageRequest && !view.closing) {
      viewerImage.src = original.src;
    }
  }, () => {
    if (viewer === view && imageRequest === view.imageRequest) {
      announce(viewerError, '原图暂时无法加载，正在显示缩略图。');
    }
  });
}

function buildFlightTransform(bounds) {
  if (!bounds) return null;
  const to = viewerImage.getBoundingClientRect();
  const width = Math.min(to.width, to.height * bounds.aspect);
  const height = Math.min(to.height, to.width / bounds.aspect);
  if (!width || !height) return null;
  const x = bounds.x - to.left - to.width / 2;
  const y = bounds.y - to.top - to.height / 2;
  return 'translate(' + x + 'px,' + y + 'px) rotate(' + bounds.angle + 'rad) scale('
    + bounds.width / width + ',' + bounds.height / height + ')';
}

function flyFrom(bounds) {
  if (reduceMotion.matches) return null;
  const origin = buildFlightTransform(bounds);
  if (!origin) return null;
  return viewerImage.animate([{ transform: origin }, { transform: 'none' }], {
    duration: 360, easing: 'cubic-bezier(.24,.75,.27,1)', fill: 'both',
  });
}

function openPhoto(id, opener, { bounds = null, pinch = false } = {}) {
  const index = collection.all.findIndex(photo => photo.id === id);
  if (index < 0 || viewer) return;
  if (!pinch && camera) stopGesture();
  viewer = { index, opener, pinch, fromStage: Boolean(bounds), flight: null, closing: false, imageRequest: 0 };
  scene?.setHandTrail(null);
  dialog.dataset.mode = pinch ? 'pinch' : 'manual';
  previous.hidden = next.hidden = pinch;
  scene?.setViewing(true);
  if (bounds) scene?.setFloatingPhoto(id);
  renderPhoto(index);
  dialog.showModal();
  if (!reduceMotion.matches) {
    if (bounds) {
      viewer.flight = flyFrom(bounds);
    } else {
      viewer.flight = viewerImage.animate(
        [{ opacity: 0, transform: 'scale(.95)' }, { opacity: 1, transform: 'none' }],
        { duration: 200, easing: 'ease-out', fill: 'both' }
      );
    }
  }
}

function finishPhoto(view) {
  if (viewer !== view || !view) return;
  viewer = null;
  view.flight?.cancel();
  dialog.close();
  viewerImage.removeAttribute('src');
  scene?.setFloatingPhoto(null);
  scene?.setViewing(false);
  const opener = view.opener?.getClientRects().length ? view.opener : studioButton;
  opener.focus({ preventScroll: true });
}

function closePhoto({ immediate = false, gesture = false } = {}) {
  const view = viewer;
  if (!view) return;
  if (view.pinch && camera && !gesture) camera.tracker.cancel(performance.now());
  if (immediate || reduceMotion.matches) {
    finishPhoto(view);
    return;
  }
  if (view.closing) return;
  view.closing = true;
  if (view.pinch && view.flight) {
    view.flight.reverse();
    view.flight.finished.then(() => finishPhoto(view), () => {});
    return;
  }
  view.flight?.cancel();
  const currentId = collection.all[view.index]?.id;
  const targetBounds = (view.fromStage && currentId)
    ? scene?.photoBounds(currentId, { ignoreFloating: true })
    : null;
  const dest = buildFlightTransform(targetBounds);
  const anim = dest
    ? viewerImage.animate([{ transform: 'none' }, { transform: dest }], {
        duration: 280, easing: 'cubic-bezier(.24,.75,.27,1)', fill: 'both',
      })
    : viewerImage.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(.94)' }], {
        duration: 180, easing: 'ease-in', fill: 'both',
      });
  view.flight = anim;
  anim.finished.then(() => finishPhoto(view), () => {});
}

function turnPhoto(direction) {
  if (!viewer || viewer.pinch) return;
  const index = viewer.index + direction;
  if (index >= 0 && index < collection.all.length) {
    viewer.flight?.cancel();
    viewer.flight = null;
    if (viewer.fromStage) {
      scene?.setFloatingPhoto(collection.all[index]?.id ?? null);
    }
    renderPhoto(index);
  }
}

viewerClose.addEventListener('click', () => closePhoto());
previous.addEventListener('click', () => turnPhoto(-1));
next.addEventListener('click', () => turnPhoto(1));
dialog.addEventListener('cancel', event => {
  event.preventDefault();
  closePhoto();
});
dialog.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    turnPhoto(event.key === 'ArrowLeft' ? -1 : 1);
  }
});
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const area = viewerImage.getBoundingClientRect();
  if (event.clientX < area.left || event.clientX > area.right || event.clientY < area.top || event.clientY > area.bottom) closePhoto();
});

/* 手机：看图时左右滑可换张 */
let swipeStart = null;
dialog.addEventListener('pointerdown', event => {
  if (event.target.closest('button')) return;
  swipeStart = { x: event.clientX, y: event.clientY };
});
dialog.addEventListener('pointerup', event => {
  const start = swipeStart;
  swipeStart = null;
  if (!start || !viewer || viewer.pinch) return;
  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;
  if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.5) turnPhoto(dx < 0 ? 1 : -1);
});
dialog.addEventListener('pointercancel', () => { swipeStart = null; });

/* 长按照片 = 置顶（手机和鼠标都能用） */
let pressTimer = null;
let pressPoint = null;
function stopPress() {
  clearTimeout(pressTimer);
  pressPoint = null;
}
mount.addEventListener('pointerdown', event => {
  if (!scene || viewer || event.button > 0) return;
  stopPress();
  pressPoint = { x: event.clientX, y: event.clientY };
  pressTimer = setTimeout(() => {
    const point = pressPoint;
    pressPoint = null;
    if (!point || !scene) return;
    const id = scene.pick(point.x, point.y);
    if (!id) return;
    collection.pinPhoto(id).then(done => {
      if (done) showToast('已把这张照片置顶', 2000);
    }).catch(() => {});
  }, 520);
});
mount.addEventListener('pointermove', event => {
  if (!pressPoint) return;
  if (Math.hypot(event.clientX - pressPoint.x, event.clientY - pressPoint.y) > 12) stopPress();
});
mount.addEventListener('pointerup', stopPress);
mount.addEventListener('pointercancel', stopPress);

function clearAim() {
  scene?.setAiming(false);
  scene?.setHighlight(null);
  reticle.hidden = true;
  reticle.removeAttribute('data-target');
  reticle.removeAttribute('data-charging');
  reticle.style.removeProperty('--charge');
}

function setCameraBadge(pose, label) {
  cameraDot.dataset.pose = pose || 'none';
  if (cameraBadge.textContent !== label) cameraBadge.textContent = label;
}

function drawHandOverlay(points, status) {
  if (!overlayCtx) return;
  const w = cameraOverlay.width;
  const h = cameraOverlay.height;
  overlayCtx.clearRect(0, 0, w, h);
  if (cameraHud.hasAttribute('data-collapsed')) return;

  if (!points?.length) {
    if (cameraHud.dataset.mode !== 'live') {
      const cx = w * 0.5;
      const cy = h * 0.5;
      const outerR = Math.min(w, h) * 0.27;
      const innerR = Math.min(w, h) * 0.14;
      overlayCtx.save();
      overlayCtx.strokeStyle = 'rgba(246, 202, 130, 0.16)';
      overlayCtx.lineWidth = 1.6;
      overlayCtx.beginPath();
      overlayCtx.arc(cx, cy, outerR, 0, Math.PI * 2);
      overlayCtx.moveTo(cx + innerR, cy);
      overlayCtx.arc(cx, cy, innerR, 0, Math.PI * 2);
      const tick = 9;
      overlayCtx.moveTo(cx - outerR - tick * 0.5, cy);
      overlayCtx.lineTo(cx - outerR + tick * 0.5, cy);
      overlayCtx.moveTo(cx + outerR - tick * 0.5, cy);
      overlayCtx.lineTo(cx + outerR + tick * 0.5, cy);
      overlayCtx.moveTo(cx, cy - outerR - tick * 0.5);
      overlayCtx.lineTo(cx, cy - outerR + tick * 0.5);
      overlayCtx.moveTo(cx, cy + outerR - tick * 0.5);
      overlayCtx.lineTo(cx, cy + outerR + tick * 0.5);
      overlayCtx.stroke();
      overlayCtx.restore();
    }
    return;
  }

  const palette = POSE_NEON[status] || POSE_NEON.neutral;
  const highlightTips = status === 'aim' || status === 'press' || status === 'held';
  const tipSet = new Set(FINGER_TIPS);

  overlayCtx.save();
  overlayCtx.fillStyle = palette.palm;
  overlayCtx.beginPath();
  for (let i = 0; i < PALM_HULL.length; i++) {
    const pt = points[PALM_HULL[i]];
    const x = (1 - pt.x) * w;
    const y = pt.y * h;
    if (i === 0) overlayCtx.moveTo(x, y);
    else overlayCtx.lineTo(x, y);
  }
  overlayCtx.closePath();
  overlayCtx.fill();

  overlayCtx.globalCompositeOperation = 'lighter';
  overlayCtx.lineCap = 'round';
  overlayCtx.lineJoin = 'round';

  const traceBones = () => {
    overlayCtx.beginPath();
    for (const [a, b] of HAND_BONES) {
      overlayCtx.moveTo((1 - points[a].x) * w, points[a].y * h);
      overlayCtx.lineTo((1 - points[b].x) * w, points[b].y * h);
    }
  };
  traceBones();
  overlayCtx.strokeStyle = palette.glow;
  overlayCtx.lineWidth = 7.5;
  overlayCtx.stroke();

  traceBones();
  overlayCtx.strokeStyle = palette.line;
  overlayCtx.lineWidth = 2.2;
  overlayCtx.stroke();

  if (highlightTips) {
    const tx = (1 - points[4].x) * w;
    const ty = points[4].y * h;
    const ix = (1 - points[8].x) * w;
    const iy = points[8].y * h;
    overlayCtx.beginPath();
    overlayCtx.moveTo(tx, ty);
    overlayCtx.lineTo(ix, iy);
    overlayCtx.strokeStyle = palette.glow;
    overlayCtx.lineWidth = 6.2;
    overlayCtx.stroke();
    overlayCtx.strokeStyle = '#fff7db';
    overlayCtx.lineWidth = 2;
    overlayCtx.stroke();

    const mx = (tx + ix) * 0.5;
    const my = (ty + iy) * 0.5;
    overlayCtx.strokeStyle = '#fff5cf';
    overlayCtx.lineWidth = 1.8;
    overlayCtx.beginPath();
    overlayCtx.arc(mx, my, status === 'held' ? 7 : 5.5, 0, Math.PI * 2);
    overlayCtx.stroke();
  }

  for (let i = 0; i < points.length; i++) {
    if (tipSet.has(i)) continue;
    overlayCtx.fillStyle = palette.line;
    overlayCtx.beginPath();
    overlayCtx.arc((1 - points[i].x) * w, points[i].y * h, 2.6, 0, Math.PI * 2);
    overlayCtx.fill();
  }

  for (const tipIndex of FINGER_TIPS) {
    const x = (1 - points[tipIndex].x) * w;
    const y = points[tipIndex].y * h;
    const activePinchTip = highlightTips && (tipIndex === 4 || tipIndex === 8);
    overlayCtx.fillStyle = palette.glow;
    overlayCtx.beginPath();
    overlayCtx.arc(x, y, activePinchTip ? 9.5 : 7.5, 0, Math.PI * 2);
    overlayCtx.fill();

    overlayCtx.fillStyle = palette.node;
    overlayCtx.beginPath();
    overlayCtx.arc(x, y, activePinchTip ? 4.0 : 3.3, 0, Math.PI * 2);
    overlayCtx.fill();
  }
  overlayCtx.restore();
}

function cameraState(state, message = '') {
  const active = state === 'active' || state === 'busy';
  gestureButton.dataset.state = state;
  gestureButton.setAttribute('aria-pressed', String(active));
  gestureButton.setAttribute('aria-label', state === 'busy' ? '取消开启手势' : active ? '关闭手势' : '开启手势');
  cameraHud.hidden = !active;
  if (state !== 'active') lastHandPoints = null;
  if (state === 'busy') {
    setCameraBadge('none', '正在开启摄像头…');
    drawHandOverlay(null, 'none');
  } else if (state === 'active') {
    setCameraBadge('none', '未检测到手');
    drawHandOverlay(null, 'none');
  } else {
    drawHandOverlay(null, 'none');
    setCameraBadge('none', '未检测到手');
  }
  announce(gestureMessage, message);
}

cameraModeButton?.addEventListener('click', () => {
  const nextMode = cameraHud.dataset.mode === 'live' ? 'holo' : 'live';
  cameraHud.dataset.mode = nextMode;
  cameraModeButton.textContent = nextMode === 'holo' ? '全息' : '实景';
  cameraModeButton.setAttribute('aria-label', nextMode === 'holo' ? '切换到实景摄像头' : '切换到全息骨骼');
  drawHandOverlay(lastHandPoints, cameraDot.dataset.pose || 'none');
});

cameraToggle.addEventListener('click', () => {
  const collapsed = cameraHud.toggleAttribute('data-collapsed');
  cameraToggle.setAttribute('aria-expanded', String(!collapsed));
  cameraToggle.setAttribute('aria-label', collapsed ? '展开预览窗' : '收起预览窗');
  drawHandOverlay(collapsed ? null : lastHandPoints, cameraDot.dataset.pose || 'none');
});

function stopGesture(message = '') {
  const session = camera;
  camera = null;
  lastHandPoints = null;
  session?.controller.abort();
  clearAim();
  scene?.setHandTrail(null);
  if (viewer?.pinch) closePhoto({ immediate: true });
  cameraState(message ? 'error' : 'idle', message);
  if (message) showToast(message, 4500);
}

function showPose(session, hands, now) {
  if (camera !== session || !scene) return;
  const points = hands?.length ? hands[0] : null;
  lastHandPoints = points?.length === 21 ? points : null;
  const bounds = mount.getBoundingClientRect();
  const cameraAspect = video.videoWidth / video.videoHeight || 1;

  // 两只手优先：张合缩放 + 整体平移 / 甩转
  if ((hands?.length ?? 0) >= 2) {
    const pair = session.tracker.updatePair(hands, now, cameraAspect);
    if (pair) {
      clearAim();
      if (pair.zoom !== 1) scene.zoomBy(pair.zoom);
      if (pair.dx || pair.dy) scene.rotate(pair.dx, pair.dy);
      scene.setHandTrail(null);
      drawHandOverlay(points, 'pair');
      setCameraBadge('pair', POSE_LABELS.pair);
      return;
    }
  } else {
    session.tracker.resetPair();
  }

  const locate = (point, currentTarget = null) => {
    if (viewer) return null;
    scene.setAiming(true);
    const range = Math.max(28, Math.min(54, Math.min(bounds.width, bounds.height) * .055));
    return scene.pick(bounds.left + point.x * bounds.width, bounds.top + point.y * bounds.height, range, currentTarget);
  };
  const result = session.tracker.update(points, now, cameraAspect, locate);
  drawHandOverlay(points, result.status);
  setCameraBadge(result.status, POSE_LABELS[result.status] || '手势识别中');

  if (result.close) closePhoto({ gesture: true });
  if (result.released) scene.releaseGrab();
  if (result.grab !== undefined && result.grab) scene.grabPhoto(result.grab);
  if (result.grabMove) scene.moveGrab(result.grabMove.x, result.grabMove.y, result.pull ?? 1);
  if (result.burst) scene.burst(result.burst.x, result.burst.y);
  if (result.ok) showToast('👌 撒了一把星 · 再试试连握两下拳', 2800);
  if (result.fling) scene.fling(result.fling.vx, result.fling.vy);

  if (result.aim && !viewer) {
    scene.setAiming(true);
    reticle.style.transform = 'translate3d(' + result.aim.x * bounds.width + 'px,' + result.aim.y * bounds.height + 'px,0)';
    reticle.hidden = false;
    reticle.toggleAttribute('data-target', result.target !== null);
    if (result.status === 'press' && result.pressProgress > 0) {
      reticle.setAttribute('data-charging', '');
      reticle.style.setProperty('--charge', result.pressProgress.toFixed(3));
    } else {
      reticle.removeAttribute('data-charging');
      reticle.style.removeProperty('--charge');
    }
    scene.setHighlight(result.target);
  } else {
    clearAim();
  }

  if (points?.length === 21 && !viewer) {
    let trailX;
    let trailY;
    if (result.aim) {
      trailX = result.aim.x;
      trailY = result.aim.y;
    } else if (result.status === 'fist') {
      const p0 = points[0];
      const p5 = points[5];
      const p17 = points[17];
      trailX = 1 - (p0.x + p5.x + p17.x) / 3;
      trailY = (p0.y + p5.y + p17.y) / 3;
    } else {
      trailX = 1 - points[8].x;
      trailY = points[8].y;
    }
    scene.setHandTrail(trailX, trailY, result.status);
  } else {
    scene.setHandTrail(null);
  }

  if (viewer) return;
  if (result.open) {
    const origin = scene.photoBounds(result.open);
    scene.releaseGrab({ snap: false });
    if (origin) openPhoto(result.open, gestureButton, { bounds: origin, pinch: true });
    return;
  }
  if (result.shape) setShape(result.shape);
  if (result.dx || result.dy) scene.rotate(result.dx, result.dy);
}

function cameraError(error) {
  if (error.name === 'NotAllowedError' || error.name === 'SecurityError') return '相机权限未开启，仍可用鼠标或触控浏览。';
  if (error.name === 'NotFoundError' || error.name === 'OverconstrainedError') return '没有可用的摄像头，仍可用鼠标或触控浏览。';
  if (error.name === 'NotReadableError') return '摄像头无法读取，可能正被其他应用使用。';
  if (error.message && /[\u3400-\u9fff]/.test(error.message)) return error.message;
  return '相机手势暂时不可用，可重试或继续浏览。';
}

async function startGesture({ auto = false } = {}) {
  if (!scene || !cameraSupported || camera) return;
  const session = { controller: new AbortController(), tracker: createGestureTracker() };
  camera = session;
  cameraState('busy', '正在开启摄像头和手势识别。');
  try {
    await startCamera(video, {
      signal: session.controller.signal,
      onResult: (points, time) => showPose(session, points, time),
      onError: error => {
        if (camera === session) stopGesture(cameraError(error));
      },
    });
    if (camera !== session) return;
    cameraState('active', '摄像头已开启。握拳圣诞树，张手星云旋转，手势1爱心，手势2土星环，手势3星河螺旋；捏住照片可以拖动、拉近看大图；两只手张合缩放。');
    showToast('摄像头已开启 · 捏住照片能拖着走 · 张手甩一下有惯性 · 双手张合缩放', 5600);
  } catch (error) {
    if (camera !== session) return;
    if (auto) {
      stopGesture();
      if (error?.name !== 'AbortError') {
        showToast('未能自动开启摄像头，可点击右上角相机图标手动开启', 4000);
      }
      return;
    }
    stopGesture(cameraError(error));
  }
}

gestureButton.addEventListener('click', () => {
  if (!scene || !cameraSupported) return;
  if (camera) {
    stopGesture();
    return;
  }
  startGesture({ auto: false });
});

shapeButton.addEventListener('click', () => {
  if (camera) camera.tracker.cancel(performance.now());
  clearAim();
  const next = SHAPE_ORDER[(SHAPE_ORDER.indexOf(shape) + 1) % SHAPE_ORDER.length];
  setShape(next, { notify: true });
});
reduceMotion.addEventListener('change', event => {
  scene?.setReducedMotion(event.matches);
  if (event.matches && viewer?.closing) finishPhoto(viewer);
  else if (event.matches) viewer?.flight?.finish();
});

function updateRunning() {
  scene?.setRunning(!document.hidden && !studio.open);
  if (document.hidden && camera) stopGesture();
}
document.addEventListener('visibilitychange', updateRunning);
window.addEventListener('resize', () => {
  if (viewer?.pinch) closePhoto({ immediate: true });
});
window.addEventListener('pagehide', event => {
  if (camera) stopGesture();
  if (event.persisted) {
    scene?.setRunning(false);
    return;
  }
  sceneInitCurrent = false;
  scene?.dispose();
  collection.dispose();
});
window.addEventListener('pageshow', updateRunning);

function showStaticScene() {
  sceneInitCurrent = false;
  if (camera) stopGesture();
  scene?.dispose();
  scene = null;
  delete stage.dataset.live;
  shapeButton.hidden = true;
  gestureButton.hidden = true;
  announce(stageStatus, '当前无法使用 3D，可通过右下角自定义面板查看所有照片。');
}

async function initializeScene() {
  let timeout;
  try {
    scene = await Promise.race([
      loadScene({
        mount, photos: collection.all, reducedMotion: reduceMotion.matches,
        isCurrent: () => sceneInitCurrent,
        onPhoto: (id, bounds) => openPhoto(id, shapeButton, { bounds, pinch: false }),
        onFailure: showStaticScene,
      }),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('3D 加载超时。')), 9000);
      }),
    ]);
    if (!scene || !sceneInitCurrent) return;
    stage.dataset.live = '';
    gestureButton.hidden = !cameraSupported;
    shapeButton.hidden = false;
    updateRunning();
  } catch {
    showStaticScene();
  } finally {
    clearTimeout(timeout);
  }
}

function syncMusicSource(customMusic) {
  const nextSrc = customMusic?.url || DEFAULT_MUSIC_SRC;
  if (currentMusicSrc !== nextSrc) {
    const wasPlaying = !music.paused;
    music.pause();
    currentMusicSrc = nextSrc;
    music.src = nextSrc;
    if (wasPlaying) {
      music.load();
      music.play().catch(musicFailed);
    } else {
      syncMusic();
    }
  }
  studioMusicName.textContent = customMusic ? customMusic.name : '默认音乐 (music.mp3)';
  studioMusicReset.hidden = !customMusic;
}

function setStudioBusy(busy) {
  for (const button of [studioReplace, studioAdd, studioClear, studioReset, studioMusicChange, studioMusicReset]) {
    button.disabled = busy;
  }
  if (!busy) renderStudio();
}

function renderStudio() {
  const stats = collection.stats();
  studioCount.textContent = `当前 ${stats.total} 张（默认 ${stats.defaultCount} · 自定义 ${stats.customCount}）`;
  studioClear.disabled = stats.total === 0;
  studioReset.disabled = !stats.hasOverrides && !stats.hasCustomMusic;
  studioAdd.disabled = stats.customCount >= stats.maxCustom;
  studioMusicName.textContent = stats.musicName || '默认音乐 (music.mp3)';
  studioMusicReset.hidden = !stats.hasCustomMusic;

  if (!collection.all.length) {
    const empty = document.createElement('p');
    empty.className = 'studio-empty';
    empty.textContent = '当前还没有照片，可点击“替换照片”或将图片直接拖入此窗口，也可以“恢复默认”。';
    studioGrid.replaceChildren(empty);
    return;
  }

  const tiles = collection.all.map((photo, index) => {
    const card = document.createElement('div');
    card.className = 'studio-tile';
    const viewButton = document.createElement('button');
    viewButton.type = 'button';
    viewButton.className = 'studio-thumb';
    viewButton.dataset.viewId = photo.id;
    viewButton.setAttribute('aria-label', `查看大图 ${photo.alt}`);
    const img = document.createElement('img');
    img.src = photo.thumbnail;
    img.alt = photo.alt;
    img.loading = 'lazy';
    img.decoding = 'async';
    viewButton.append(img);
    card.append(viewButton);

    if (index > 0) {
      const pin = document.createElement('button');
      pin.type = 'button';
      pin.className = 'studio-pin';
      pin.dataset.pinId = photo.id;
      pin.setAttribute('aria-label', `将 ${photo.alt} 置顶到正面`);
      pin.title = '置顶到树正面';
      pin.textContent = '↑';
      card.append(pin);
    }
    if (index < 8) {
      const frontBadge = document.createElement('span');
      frontBadge.className = 'studio-front-badge';
      frontBadge.textContent = '正面';
      card.append(frontBadge);
    }

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'studio-remove';
    remove.dataset.removeId = photo.id;
    remove.setAttribute('aria-label', `移除 ${photo.alt}`);
    remove.textContent = '×';
    card.append(remove);
    return card;
  });
  studioGrid.replaceChildren(...tiles);
}

function syncScenePhotos() {
  if (viewer) closePhoto({ immediate: true });
  scene?.setPhotos(collection.all);
}

async function handleImageImport(files, { replace }) {
  const list = Array.from(files || []);
  if (!list.length) return;
  setStudioBusy(true);
  announce(studioStatus, '正在处理照片…');
  announce(uploadStatus, '正在处理照片…');
  try {
    const result = await collection.importFiles(list, { replace });
    syncScenePhotos();
    const parts = [];
    if (result.added.length) {
      parts.push(replace ? `已替换为 ${result.added.length} 张照片。` : `已追加 ${result.added.length} 张照片并优先排在正面。`);
    } else if (replace) {
      parts.push('未导入有效照片，已保留原有照片。');
    }
    if (result.invalid) parts.push(`${result.invalid} 张未导入（仅支持 15 MB 以内的常见图片）。`);
    if (result.overLimit) parts.push(`${result.overLimit} 张未导入（自定义照片上限 ${result.maxTotal} 张）。`);
    if (result.storageError) parts.push('浏览器存储空间不足，部分照片未能保存。');
    const message = parts.join(' ');
    announce(studioStatus, message);
    announce(uploadStatus, message);
  } catch {
    announce(studioStatus, '照片暂时无法读取，请重试。');
    announce(uploadStatus, '照片暂时无法读取。');
  } finally {
    setStudioBusy(false);
  }
}

studioButton.addEventListener('click', () => {
  if (camera) stopGesture();
  announce(studioStatus, '');
  renderStudio();
  studio.showModal();
  updateRunning();
});
studioClose.addEventListener('click', () => studio.close());
studio.addEventListener('close', () => {
  delete studio.dataset.dragging;
  updateRunning();
  studioButton.focus({ preventScroll: true });
});
studio.addEventListener('click', event => {
  if (event.target !== studio) return;
  const bounds = studio.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) studio.close();
});

studioReplace.addEventListener('click', () => uploadReplaceInput.click());
studioAdd.addEventListener('click', () => uploadAddInput.click());
uploadReplaceInput.addEventListener('change', async () => {
  const files = Array.from(uploadReplaceInput.files);
  uploadReplaceInput.value = '';
  await handleImageImport(files, { replace: true });
});
uploadAddInput.addEventListener('change', async () => {
  const files = Array.from(uploadAddInput.files);
  uploadAddInput.value = '';
  await handleImageImport(files, { replace: false });
});

studioGrid.addEventListener('click', async event => {
  const pinButton = event.target.closest('[data-pin-id]');
  if (pinButton) {
    setStudioBusy(true);
    try {
      const pinned = await collection.pinPhoto(pinButton.dataset.pinId);
      if (pinned) {
        syncScenePhotos();
        announce(studioStatus, '已置顶到圣诞树正面。');
      }
    } finally {
      setStudioBusy(false);
    }
    return;
  }
  const removeButton = event.target.closest('[data-remove-id]');
  if (removeButton) {
    setStudioBusy(true);
    try {
      const removed = await collection.removePhoto(removeButton.dataset.removeId);
      if (removed) {
        syncScenePhotos();
        announce(studioStatus, '已移除 1 张照片。');
      }
    } finally {
      setStudioBusy(false);
    }
    return;
  }
  const viewButton = event.target.closest('[data-view-id]');
  if (viewButton) {
    openPhoto(viewButton.dataset.viewId, viewButton);
  }
});

studioClear.addEventListener('click', async () => {
  setStudioBusy(true);
  try {
    await collection.clearAll();
    syncScenePhotos();
    announce(studioStatus, '已清空照片。');
  } finally {
    setStudioBusy(false);
  }
});

studioReset.addEventListener('click', async () => {
  setStudioBusy(true);
  try {
    await collection.resetAll();
    syncMusicSource(null);
    syncScenePhotos();
    announce(studioStatus, '已恢复仓库默认照片与音乐。');
  } finally {
    setStudioBusy(false);
  }
});

studioMusicChange.addEventListener('click', () => musicUploadInput.click());
musicUploadInput.addEventListener('change', async () => {
  const file = musicUploadInput.files?.[0];
  musicUploadInput.value = '';
  if (!file) return;
  setStudioBusy(true);
  try {
    const nextMusic = await collection.setCustomMusic(file);
    syncMusicSource(nextMusic);
    announce(studioStatus, `已更换背景音乐：${nextMusic.name}`);
  } catch (error) {
    const msg = error?.name === 'QuotaExceededError'
      ? '浏览器存储空间不足，无法保存该音乐文件。'
      : (error?.message || '音乐文件无法读取。');
    announce(studioStatus, msg);
  } finally {
    setStudioBusy(false);
  }
});

studioMusicReset.addEventListener('click', async () => {
  setStudioBusy(true);
  try {
    await collection.clearCustomMusic();
    syncMusicSource(null);
    announce(studioStatus, '已恢复默认音乐。');
  } finally {
    setStudioBusy(false);
  }
});

studio.addEventListener('dragenter', event => {
  if (event.dataTransfer?.types?.includes('Files')) {
    event.preventDefault();
    studio.dataset.dragging = '';
  }
});
studio.addEventListener('dragover', event => {
  if (event.dataTransfer?.types?.includes('Files')) {
    event.preventDefault();
    studio.dataset.dragging = '';
  }
});
studio.addEventListener('dragleave', event => {
  if (!studio.contains(event.relatedTarget)) {
    delete studio.dataset.dragging;
  }
});
studio.addEventListener('drop', async event => {
  delete studio.dataset.dragging;
  if (!event.dataTransfer?.files?.length) return;
  event.preventDefault();
  await handleImageImport(event.dataTransfer.files, { replace: false });
});

function syncMusic() {
  const playing = !music.paused;
  delete musicButton.dataset.state;
  musicButton.setAttribute('aria-pressed', String(playing));
  musicButton.setAttribute('aria-label', playing ? '暂停音乐' : '播放音乐');
}

function musicFailed() {
  musicButton.dataset.state = 'error';
  musicButton.setAttribute('aria-pressed', 'false');
  musicButton.setAttribute('aria-label', '音乐暂时无法播放');
  showToast('音乐暂时无法播放，请检查音频文件', 3500);
}

music.addEventListener('play', syncMusic);
music.addEventListener('pause', syncMusic);
music.addEventListener('error', musicFailed);
musicButton.addEventListener('click', async () => {
  if (!music.paused) {
    music.pause();
    return;
  }
  try {
    await music.play();
  } catch {
    musicFailed();
  }
});

/* —— 手势小抄：第一次进来自动弹一次，之后点右上角 ? 再看 —— */
const guide = byId('guide');
const guideClose = byId('guide-close');
const guideButton = byId('guide-button');
const GUIDE_KEY = 'taotao-gesture-guide';

function openGuide() {
  if (!guide) return;
  guide.hidden = false;
  try { localStorage.setItem(GUIDE_KEY, '1'); } catch { /* 隐私模式下忽略 */ }
  guideClose?.focus({ preventScroll: true });
}

function closeGuide() {
  if (!guide) return;
  guide.hidden = true;
  guideButton?.focus({ preventScroll: true });
}

guideClose?.addEventListener('click', closeGuide);
guide?.addEventListener('click', event => { if (event.target === guide) closeGuide(); });
guideButton?.addEventListener('click', openGuide);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && guide && !guide.hidden) closeGuide();
});
try {
  if (!localStorage.getItem(GUIDE_KEY)) setTimeout(openGuide, 1400);
} catch { /* 隐私模式下不弹 */ }

async function boot() {
  preloadSceneEngine().catch(() => {});
  if (cameraSupported) preloadCameraLibrary();
  try {
    const hydrated = await collection.hydrate();
    syncMusicSource(hydrated.customMusic);
    if (!collection.stats().storageAvailable) {
      announce(studioStatus, '当前浏览器禁用本地持久化，刷新后将恢复默认内容。');
    }
  } catch {
    syncMusicSource(null);
  }
  studioButton.hidden = false;
  musicButton.hidden = false;
  renderStudio();
  await initializeScene();
  if (scene && sceneInitCurrent && cameraSupported && !document.hidden) {
    startGesture({ auto: true });
  }
}

/* 自测钩子：?debug 时把场景与手势对象暴露出来，方便无摄像头环境下验证交互 */
if (new URLSearchParams(location.search).has('debug')) {
  window.__taotao = {
    get scene() { return scene; },
    get tracker() { return camera?.tracker ?? null; },
    get viewer() { return viewer; },
    collection,
    openPhoto,
    closePhoto,
    setShape,
  };
}

boot();
