const PACKAGE_ROOT = 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/';
const STARTUP_LIMIT = 18000;
const INFERENCE_INTERVAL = 1000 / 24;
let libraryPromise;

function loadLibrary() {
  if (globalThis.Hands) return Promise.resolve(globalThis.Hands);
  if (libraryPromise) return libraryPromise;

  libraryPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PACKAGE_ROOT + 'hands.js';
    script.crossOrigin = 'anonymous';
    const timer = setTimeout(() => fail('手势模型加载超时。请重试。'), 12000);
    function fail(message) {
      clearTimeout(timer);
      script.remove();
      reject(new Error(message));
    }
    script.onload = () => {
      clearTimeout(timer);
      if (globalThis.Hands) resolve(globalThis.Hands);
      else fail('手势模型无法初始化。');
    };
    script.onerror = () => fail('手势模型加载失败。请检查网络后重试。');
    document.head.append(script);
  }).catch(error => {
    libraryPromise = null;
    throw error;
  });
  return libraryPromise;
}

export function preloadCameraLibrary() {
  return loadLibrary().catch(() => {});
}

function stopTracks(stream) {
  stream.getTracks().forEach(track => track.stop());
}

export function startCamera(video, { signal, onResult, onError }) {
  if (signal.aborted) return Promise.reject(new DOMException('相机启动已取消。', 'AbortError'));
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return Promise.reject(new Error('当前地址无法使用相机。请通过 localhost 或 HTTPS 打开。'));
  }

  // Ask for access while still handling the user's click or startup flow.
  const permission = navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 } },
  });
  let stream;
  let hands;
  let inFlight;
  let frame = 0;
  let previousInference = -Infinity;
  let previousVideoTime = -1;
  let stopped = false;

  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frame);
    if (stream) stopTracks(stream);
    if (stream && video.srcObject === stream) {
      video.pause();
      video.srcObject = null;
    }
    if (hands) {
      const release = () => Promise.resolve().then(() => hands.close()).catch(() => {});
      if (inFlight) inFlight.then(release, release);
      else release();
    }
  }

  const media = permission.then(value => {
    if (stopped || signal.aborted) {
      stopTracks(value);
      throw new DOMException('相机启动已取消。', 'AbortError');
    }
    stream = value;
    return value;
  });

  function frameLoop(now) {
    if (stopped) return;
    if (!inFlight && video.readyState >= 2 && video.currentTime !== previousVideoTime && now - previousInference >= INFERENCE_INTERVAL) {
      previousVideoTime = video.currentTime;
      previousInference = now;
      inFlight = Promise.resolve().then(() => hands.send({ image: video }));
      inFlight.then(() => { inFlight = null; }, error => {
        inFlight = null;
        if (!stopped) onError(error);
        stop();
      });
    }
    frame = requestAnimationFrame(frameLoop);
  }

  const playVideo = media.then(async cameraStream => {
    if (stopped) return;
    cameraStream.getVideoTracks().forEach(track => {
      track.addEventListener('ended', () => {
        if (!stopped) onError(new Error('摄像头已断开。'));
      }, { once: true, signal });
    });
    video.srcObject = cameraStream;
    await video.play();
  });

  const initHands = loadLibrary().then(async Hands => {
    if (stopped) return;
    const instance = new Hands({ locateFile: file => PACKAGE_ROOT + file });
    // 两只手：单手做姿势/抓取，双手做张合缩放与甩转
    instance.setOptions({ maxNumHands: 2, modelComplexity: 0, minDetectionConfidence: .55, minTrackingConfidence: .55 });
    instance.onResults(results => {
      if (stopped) return;
      const hands = (results.multiHandLandmarks || []).filter(hand => hand?.length === 21);
      hands.sort((a, b) => (a[9]?.x ?? 0) - (b[9]?.x ?? 0));
      onResult(hands, performance.now());
    });
    hands = instance;
    const initPromise = Promise.resolve().then(() => instance.initialize());
    inFlight = initPromise;
    try {
      await initPromise;
    } finally {
      if (inFlight === initPromise) inFlight = null;
    }
  });

  const startup = async () => {
    await Promise.all([playVideo, initHands]);
    if (!stopped) frame = requestAnimationFrame(frameLoop);
  };

  return new Promise((resolve, reject) => {
    function fail(error) {
      clearTimeout(timer);
      stop();
      reject(error);
    }
    const timer = setTimeout(() => fail(new Error('相机启动超时。请确认权限后重试。')), STARTUP_LIMIT);
    signal.addEventListener('abort', () => fail(new DOMException('相机启动已取消。', 'AbortError')), { once: true });
    startup().then(() => {
      clearTimeout(timer);
      if (!stopped) resolve();
    }, fail);
  });
}
