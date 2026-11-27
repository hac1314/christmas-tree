import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGestureTracker } from '../src/gestures.js';

const hit = () => '12';
const miss = () => null;

const OPEN_DELAY = 420;   // 捏住之后不动多久才开图（与 gestures.js 的 OPEN_HOLD_MS 对齐）

function hand(gap, { x = .28, y = .4, fingers = 'extended', scale = 1 } = {}) {
  const points = Array.from({ length: 21 }, () => ({ x, y: y + .2 * scale }));
  const palm = .12 * scale;
  points[9].y -= palm;
  points[4] = { x: x - gap * palm / 2, y };
  points[8] = { x: x + gap * palm / 2, y };
  if (fingers === 'fist') points[4].y = points[8].y = y + .14 * scale;
  const extendedCount = fingers === 'fist' ? 0 : fingers === 'one' ? 1 : fingers === 'two' ? 2 : fingers === 'three' ? 3 : 4;
  if (extendedCount === 0) points[8].y = y + .14 * scale;
  for (const [idx, tip] of [12, 16, 20].entries()) {
    points[tip].y -= (idx + 1 < extendedCount ? .22 : .07) * scale;
  }
  return points;
}

function send(tracker, gap, time, locate = hit, opts) {
  return tracker.update(hand(gap, opts), time, 1, locate);
}

// 半捏瞄准 → 合上（press 从这个时刻开始计时）
function pinch(tracker, time, locate = hit, opts = {}) {
  send(tracker, .64, time - 150, locate, opts);
  send(tracker, .61, time - 60, locate, opts);
  send(tracker, .19, time - 50, locate, opts);
  return send(tracker, .18, time, locate, opts);
}

// 捏住并且按满 HOLD_MS → 进入"抓住"（held）
function grab(tracker, time, locate = hit, opts = {}) {
  pinch(tracker, time, locate, opts);
  return send(tracker, .18, time + 140, locate, opts);
}

// 捏住不动直到开图
function holdOpen(tracker, time, locate = hit, opts = {}) {
  const held = grab(tracker, time, locate, opts);
  assert.equal(held.status, 'held');
  return send(tracker, .18, time + 140 + OPEN_DELAY + 40, locate, opts);
}

function hold(tracker) {
  const opened = holdOpen(tracker, 221);
  assert.equal(opened.open, '12');
}

test('mirrors and smooths the midpoint, then holds the pre-highlighted photo', () => {
  const tracker = createGestureTracker();
  const first = send(tracker, .64, 0);
  assert.ok(Math.abs(first.aim.x - .72) < 1e-8);
  assert.ok(Math.abs(first.aim.y - .4) < 1e-8);
  assert.equal(first.target, '12');
  const moved = send(tracker, .62, 90, hit, { x: .36 });
  assert.ok(moved.aim.x < .72 && moved.aim.x > .64);
  assert.equal(send(tracker, .19, 110, () => '13').target, '12');
  // 捏住只是"抓住"，不再立刻开图
  assert.equal(send(tracker, .18, 229, () => '13').open, undefined);
  const held = send(tracker, .19, 230, () => '13');
  assert.equal(held.status, 'held');
  assert.equal(held.open, undefined);
  // 捏住不动满 OPEN_DELAY 才开
  assert.equal(send(tracker, .19, 230 + OPEN_DELAY - 60, () => '13').open, undefined);
  assert.equal(send(tracker, .19, 230 + OPEN_DELAY + 30, () => '13').open, '12');
  assert.equal(send(tracker, .22, 900).open, undefined);
});

test('pinching empty space, tapping too quickly, and closing into a fist stay closed', () => {
  for (const [locate, closeAt, fingers] of [[miss, 120, 'extended'], [hit, 45, 'extended'], [hit, 120, 'fist']]) {
    const tracker = createGestureTracker();
    send(tracker, .64, 0, locate);
    assert.equal(send(tracker, .18, closeAt, locate, { fingers }).open, undefined);
    assert.equal(send(tracker, .18, closeAt + 900, hit, { fingers }).open, undefined);
  }

  const tracker = createGestureTracker();
  send(tracker, .64, 0);
  send(tracker, .2, 120);
  send(tracker, .57, 170);
  assert.equal(send(tracker, .57, 260).open, undefined);
});

test('a change of candidate restarts the highlight timer for the adjacent photo', () => {
  const tracker = createGestureTracker();
  send(tracker, .64, 0);
  send(tracker, .63, 90, () => '13');
  send(tracker, .2, 120);
  assert.equal(send(tracker, .2, 250).open, undefined);
});

test('drag after pinching grabs the photo instead of opening it', () => {
  const tracker = createGestureTracker();
  const held = grab(tracker, 120);
  assert.equal(held.status, 'held');
  assert.equal(held.grabbing, false);
  // 指尖移动 → 进入抓取，照片开始跟着走
  const drag = send(tracker, .2, 300, hit, { x: .52 });
  assert.equal(drag.grabbing, true);
  assert.ok(drag.grabMove && drag.grabMove.x !== undefined);
  const drag2 = send(tracker, .2, 380, hit, { x: .6 });
  assert.equal(drag2.grabbing, true);
  assert.equal(drag2.open, undefined);
  // 松手：不是开图，而是"放回去"
  const back = send(tracker, .7, 460, hit, { x: .6 });
  assert.equal(back.open, undefined);
  assert.equal(send(tracker, .7, 560, hit, { x: .6 }).released, true);
  assert.equal(send(tracker, .2, 900).open, undefined);
});

test('pulling the pinch toward the camera opens the photo', () => {
  const tracker = createGestureTracker();
  const held = grab(tracker, 120, hit, { scale: 1 });
  assert.equal(held.status, 'held');
  // 手凑近镜头：掌心在画面里变大
  const pull = send(tracker, .2, 320, hit, { scale: 1.45 });
  assert.equal(pull.open, '12');
});

test('two hands zoom in and out, and twist the scene', () => {
  const tracker = createGestureTracker();
  const near = hand(1.1, { x: .30, y: .45 });
  const far = hand(1.1, { x: .70, y: .45 });
  tracker.updatePair([near, far], 0, 1);
  // 两手分开 → 放大（zoom < 1 表示视野里的东西变大）
  const apart = tracker.updatePair([hand(1.1, { x: .22, y: .45 }), hand(1.1, { x: .78, y: .45 })], 40, 1);
  assert.ok(apart && apart.zoom < 1);
  // 两手靠近 → 缩小
  const together = tracker.updatePair([hand(1.1, { x: .38, y: .45 }), hand(1.1, { x: .62, y: .45 })], 80, 1);
  assert.ok(together && together.zoom > 1);
  // 整体平移 → 场景旋转
  const pan = tracker.updatePair([hand(1.1, { x: .30, y: .45 }), hand(1.1, { x: .70, y: .45 })], 120, 1);
  assert.ok(pan && (pan.dx !== 0 || pan.dy !== 0));
  // 只有一只手 → 双手返回 null
  assert.equal(tracker.updatePair([near], 160, 1), null);
});

test('OK sign and double fist fire the easter eggs once, without breaking the shape switch', () => {
  const tracker = createGestureTracker();
  const ok0 = tracker.update(anatomicalHand({ pose: 'ok', gap: .20 }), 0, 1, hit);
  assert.equal(ok0.ok, true);
  assert.ok(ok0.burst);
  const ok1 = tracker.update(anatomicalHand({ pose: 'ok', gap: .20 }), 60, 1, hit);
  assert.equal(ok1.ok, undefined);

  const fistTracker = createGestureTracker();
  fistTracker.update(hand(.2, { fingers: 'fist' }), 0, 1, hit);
  assert.equal(fistTracker.update(hand(.2, { fingers: 'fist' }), 60, 1, hit).burst, undefined);
  fistTracker.update(hand(1.2, { fingers: 'extended' }), 200, 1, hit);
  const combo = fistTracker.update(hand(.2, { fingers: 'fist' }), 320, 1, hit);
  assert.ok(combo.burst);
  assert.equal(combo.status, 'fist');
});

test('release is debounced, and the releasing palm does not change the shape', () => {
  const tracker = createGestureTracker();
  hold(tracker);
  assert.equal(send(tracker, .51, 830).close, undefined);
  assert.equal(send(tracker, .25, 870).close, undefined);
  assert.equal(send(tracker, .95, 890).close, undefined);
  assert.equal(send(tracker, .95, 970).close, true);
  assert.equal(send(tracker, .95, 1140).shape, undefined);
  assert.equal(send(tracker, .95, 1380).shape, undefined);
  send(tracker, .2, 1390, hit, { fingers: 'fist' });
  assert.equal(send(tracker, .2, 1540, hit, { fingers: 'fist' }).shape, 'tree');
});

test('a short tracking gap keeps the photo, then loss closes it', () => {
  const tracker = createGestureTracker();
  hold(tracker);
  assert.equal(tracker.update(null, 860, 1, hit).close, undefined);
  assert.equal(tracker.update(null, 1060, 1, hit).close, undefined);
  assert.equal(tracker.update(null, 1075, 1, hit).close, true);
  assert.equal(send(tracker, .18, 1400).open, undefined);
});

test('a missed frame while closing preserves the candidate but restarts the hold timer', () => {
  const tracker = createGestureTracker();
  send(tracker, .64, 0);
  send(tracker, .61, 90);
  assert.equal(tracker.update(null, 115, 1, hit).target, '12');
  send(tracker, .19, 140);
  assert.equal(tracker.update(null, 190, 1, hit).target, '12');
  assert.equal(send(tracker, .20, 220).open, undefined);
  assert.equal(send(tracker, .19, 600).open, undefined);
  assert.equal(send(tracker, .19, 1000).open, undefined);
  assert.equal(send(tracker, .19, 1040).open, '12');
});

test('a new open palm switches the shape and reacquisition clears old rotation', () => {
  const tracker = createGestureTracker();
  assert.equal(send(tracker, 1.2, 0).shape, undefined);
  assert.equal(send(tracker, 1.2, 150).shape, 'nebula');
  assert.ok(send(tracker, 1.2, 180, hit, { x: .36 }).dx < 0);
  tracker.update(null, 190, 1, hit);
  assert.equal(send(tracker, 1.2, 210, hit, { x: .6 }).dx, undefined);
});

test('a fast open-palm swipe leaves inertia for the scene', () => {
  const tracker = createGestureTracker();
  send(tracker, 1.2, 0, hit, { x: .3 });
  send(tracker, 1.2, 150, hit, { x: .3 });
  send(tracker, 1.2, 175, hit, { x: .5 });
  send(tracker, 1.2, 200, hit, { x: .72 });
  const lost = tracker.update(null, 240, 1, hit);
  assert.ok(lost.fling, 'swipe should leave a fling');
  assert.ok(lost.fling.vx < 0, 'scene rotation follows the swipe direction');
});

test('canceling a held pinch requires release before the same hand can open again', () => {
  const tracker = createGestureTracker();
  hold(tracker);
  tracker.cancel(880);
  assert.equal(send(tracker, .22, 1180).open, undefined);
  assert.equal(send(tracker, .19, 1310).open, undefined);
  send(tracker, .67, 1330);
  send(tracker, .6, 1440);
  send(tracker, .18, 1450);
  assert.equal(send(tracker, .18, 1570).open, undefined);
  assert.equal(send(tracker, .18, 2100).open, '12');
});

test('reports pose status and smooth pressProgress across the hold window', () => {
  const tracker = createGestureTracker();
  assert.equal(tracker.update(null, 0, 1, hit).status, 'none');

  const openRes = send(tracker, 1.2, 10);
  assert.equal(openRes.status, 'open');
  assert.equal(openRes.pressProgress, 0);

  const fistRes = send(tracker, .2, 30, hit, { fingers: 'fist' });
  assert.equal(fistRes.status, 'fist');
  assert.equal(fistRes.pressProgress, 0);

  const aim1 = send(tracker, .64, 50);
  assert.equal(aim1.status, 'aim');
  assert.equal(aim1.pressProgress, 0);

  send(tracker, .61, 140);
  const startPress = send(tracker, .19, 150);
  assert.equal(startPress.status, 'press');
  assert.equal(startPress.pressProgress, 0);

  const midPress = send(tracker, .19, 210);
  assert.equal(midPress.status, 'press');
  assert.ok(Math.abs(midPress.pressProgress - .5) < 1e-6);

  const held = send(tracker, .19, 280);
  assert.equal(held.status, 'held');
  assert.equal(held.pressProgress, 1);
  assert.equal(held.open, undefined);
  assert.equal(send(tracker, .19, 280 + OPEN_DELAY + 40).open, '12');
});

test('gestures 1, 2, 3 switch to heart, ring, and spiral without triggering aim', () => {
  const tracker = createGestureTracker();

  const one0 = send(tracker, .72, 0, hit, { fingers: 'one' });
  assert.equal(one0.status, 'one');
  assert.equal(one0.aim, undefined);
  assert.equal(one0.shape, undefined);
  const one1 = send(tracker, .72, 150, hit, { fingers: 'one' });
  assert.equal(one1.status, 'one');
  assert.equal(one1.shape, 'heart');

  send(tracker, .85, 200, hit, { fingers: 'two' });
  const two1 = send(tracker, .85, 350, hit, { fingers: 'two' });
  assert.equal(two1.status, 'two');
  assert.equal(two1.shape, 'ring');

  send(tracker, .90, 400, hit, { fingers: 'three' });
  const three1 = send(tracker, .90, 550, hit, { fingers: 'three' });
  assert.equal(three1.status, 'three');
  assert.equal(three1.shape, 'spiral');

  // Pinching with relaxed/extended fingers still aims cleanly
  const aim = send(tracker, .60, 600, hit, { fingers: 'extended' });
  assert.equal(aim.status, 'aim');
  assert.equal(aim.target, '12');
});

function anatomicalHand({ x = .45, y = .45, gap = .65, pose = 'threeA', pinky = 'straight', foldOffset = .03 } = {}) {
  const palm = .12;
  const points = Array.from({ length: 21 }, () => ({ x, y: y + .24 }));
  points[0] = { x, y: y + .24 };
  points[5] = { x: x - .04, y: y + .12 };
  points[9] = { x: x - .01, y: y + .12 };
  points[13] = { x: x + .02, y: y + .13 };
  points[17] = { x: x + .05, y: y + .14 };

  const setStraight = (mcp, pip, dip, tip) => {
    const base = points[mcp];
    points[pip] = { x: base.x, y: base.y - .09 };
    points[dip] = { x: base.x, y: base.y - .13 };
    points[tip] = { x: base.x, y: base.y - .16 };
  };
  const setCurled = (mcp, pip, dip, tip, tipDelta = .03) => {
    const base = points[mcp];
    points[pip] = { x: base.x, y: base.y - .055 };
    points[dip] = { x: base.x, y: base.y - .03 };
    points[tip] = { x: base.x, y: base.y + tipDelta };
  };
  const setHalfBentPinky = () => {
    const base = points[17];
    points[18] = { x: base.x, y: base.y - .06 };
    points[19] = { x: base.x - .015, y: base.y - .05 };
    points[20] = { x: base.x - .03, y: base.y - .05 }; // distance(0,20)/palm ~ 1.26 (tendon-coupled bend)
  };

  if (pose === 'wayB' || pose === 'ok') {
    points[6] = { x: points[5].x, y: points[5].y - .08 };
    points[7] = { x: points[5].x - .01, y: points[5].y - .04 };
    points[8] = { x: points[5].x - .01, y: points[5].y - .02 };
    points[4] = { x: points[8].x - gap * palm, y: points[8].y };
    setStraight(9, 10, 11, 12);
    setStraight(13, 14, 15, 16);
    setStraight(17, 18, 19, 20);
    return points;
  }

  if (pose === 'fist') {
    setCurled(5, 6, 7, 8, -foldOffset);
    setCurled(9, 10, 11, 12, -foldOffset);
    setCurled(13, 14, 15, 16, -foldOffset);
    setCurled(17, 18, 19, 20, -foldOffset);
    points[4] = { x: points[8].x - gap * palm, y: points[8].y };
    return points;
  }

  setStraight(5, 6, 7, 8);
  points[4] = { x: points[8].x - gap * palm, y: points[8].y };
  if (pose === 'one' || pose === 'pinchCurled') {
    setCurled(9, 10, 11, 12);
    setCurled(13, 14, 15, 16);
    setCurled(17, 18, 19, 20);
  } else if (pose === 'two') {
    setStraight(9, 10, 11, 12);
    setCurled(13, 14, 15, 16);
    setCurled(17, 18, 19, 20);
  } else if (pose === 'threeA') {
    setStraight(9, 10, 11, 12);
    setStraight(13, 14, 15, 16);
    if (pinky === 'halfBent') setHalfBentPinky();
    else setCurled(17, 18, 19, 20);
  } else {
    setStraight(9, 10, 11, 12);
    setStraight(13, 14, 15, 16);
    setStraight(17, 18, 19, 20);
  }
  return points;
}

test('anatomical gesture 3 Way A with tendon-coupled half-bent pinky switches to spiral, not open', () => {
  const tracker = createGestureTracker();
  const r0 = tracker.update(anatomicalHand({ pose: 'threeA', pinky: 'halfBent', gap: .92 }), 0, 1, hit);
  assert.equal(r0.status, 'three');
  const r1 = tracker.update(anatomicalHand({ pose: 'threeA', pinky: 'halfBent', gap: .92 }), 160, 1, hit);
  assert.equal(r1.status, 'three');
  assert.equal(r1.shape, 'spiral');
});

test('anatomical gesture 3 Way B (Chinese 3 / OK sign) switches to spiral without opening a photo', () => {
  const tracker = createGestureTracker();
  const r0 = tracker.update(anatomicalHand({ pose: 'wayB', gap: .24 }), 0, 1, hit);
  assert.equal(r0.status, 'three');
  assert.equal(r0.open, undefined);
  const r1 = tracker.update(anatomicalHand({ pose: 'wayB', gap: .24 }), 160, 1, hit);
  assert.equal(r1.status, 'three');
  assert.equal(r1.shape, 'spiral');
  assert.equal(r1.open, undefined);
});

test('count poses break cleanly out of empty-target aim without getting locked', () => {
  const tracker = createGestureTracker();
  const aimEmpty = send(tracker, .65, 0, miss, { fingers: 'extended' });
  assert.equal(aimEmpty.status, 'aim');
  assert.equal(aimEmpty.target, null);

  const g1 = send(tracker, .72, 40, miss, { fingers: 'one' });
  assert.equal(g1.status, 'one');
  assert.equal(send(tracker, .72, 200, miss, { fingers: 'one' }).shape, 'heart');

  send(tracker, .65, 230, miss, { fingers: 'extended' });
  assert.equal(send(tracker, .62, 250, miss, { fingers: 'two' }).status, 'two');
  assert.equal(send(tracker, .62, 410, miss, { fingers: 'two' }).shape, 'ring');

  send(tracker, .65, 440, miss, { fingers: 'extended' });
  assert.equal(send(tracker, .62, 460, miss, { fingers: 'three' }).status, 'three');
  assert.equal(send(tracker, .62, 620, miss, { fingers: 'three' }).shape, 'spiral');
});

test('pinch freeze preserves locked target across pre-close downward drift and real pinch gap 0.35', () => {
  const tracker = createGestureTracker();
  const start = send(tracker, .64, 0, hit);
  assert.equal(start.target, '12');

  // Entering freeze band (gap <= 0.46) freezes tip & keeps target 12 even if locate drifts onto miss or another photo
  const frozen = send(tracker, .42, 95, () => '13', { x: .52, y: .68 });
  assert.equal(frozen.status, 'aim');
  assert.equal(frozen.target, '12');
  assert.ok(Math.abs(frozen.aim.x - start.aim.x) < 1e-8);

  // Closing to realistic webcam pinch gap = 0.35 enters press, then held, then opens the locked photo 12
  const pressing = send(tracker, .35, 110, miss, { x: .54, y: .72 });
  assert.equal(pressing.status, 'press');
  assert.equal(pressing.target, '12');
  const held = send(tracker, .35, 235, miss, { x: .54, y: .72 });
  assert.equal(held.status, 'held');
  assert.equal(held.open, undefined);
  assert.equal(send(tracker, .35, 235 + OPEN_DELAY + 40, miss, { x: .54, y: .72 }).open, '12');
});

test('brief single-frame tracking jitter while aiming preserves locked target before closing', () => {
  const tracker = createGestureTracker();
  send(tracker, .64, 0, hit);
  const jitter = send(tracker, .60, 45, miss);
  assert.equal(jitter.target, '12');
  send(tracker, .35, 95, hit);
  assert.equal(send(tracker, .35, 220, hit).open, undefined);
  assert.equal(send(tracker, .35, 220 + OPEN_DELAY + 40, hit).open, '12');
});

test('half-pinch with curled outer fingers (gap 0.55) stays aiming instead of hijacking to gesture 1', () => {
  const tracker = createGestureTracker();
  const r0 = tracker.update(anatomicalHand({ pose: 'pinchCurled', gap: .55 }), 0, 1, hit);
  assert.equal(r0.status, 'aim');
  assert.equal(r0.target, '12');
  assert.equal(r0.shape, undefined);
});

test('half-pinch hysteresis and 90ms debounce keep scene still across wobble past AIM_ENTER', () => {
  const tracker = createGestureTracker();
  const a0 = send(tracker, .64, 0, hit);
  assert.equal(a0.status, 'aim');
  // Wobble into hysteresis band [.80, .90) stays aiming with zero scene motion
  const a1 = send(tracker, .86, 40, hit, { x: .36 });
  assert.equal(a1.status, 'aim');
  assert.equal(a1.dx, undefined);
  // Brief 40ms spike past AIM_EXIT (.93) still debounces in aim before returning to hysteresis band
  const spike = send(tracker, .93, 80, hit, { x: .42 });
  assert.equal(spike.status, 'aim');
  assert.equal(spike.dx, undefined);
  const back = send(tracker, .85, 120, hit, { x: .44 });
  assert.equal(back.status, 'aim');
  assert.equal(back.dx, undefined);
});

test('relaxed anatomical fist recognizes cleanly and holds without flickering across slight finger jitter', () => {
  const tracker = createGestureTracker();
  // foldOffset = 0.015 gives wrist-to-tip ~1.18 * palm with clearly folded PIP joints
  const f0 = tracker.update(anatomicalHand({ pose: 'fist', gap: .25, foldOffset: .015 }), 0, 1, hit);
  assert.equal(f0.status, 'fist');
  const f1 = tracker.update(anatomicalHand({ pose: 'fist', gap: .25, foldOffset: .028 }), 160, 1, hit);
  assert.equal(f1.status, 'fist');
  assert.equal(f1.shape, 'tree');
});

test('pinch hold stays locked in press across wobble up to gap 0.46 (< RELEASED 0.50)', () => {
  const tracker = createGestureTracker();
  send(tracker, .64, 0, hit);
  send(tracker, .61, 90, hit);
  const p0 = send(tracker, .34, 100, hit);
  assert.equal(p0.status, 'press');
  const wobble = send(tracker, .46, 150, hit);
  assert.equal(wobble.status, 'press');
  const held = send(tracker, .44, 230, hit);
  assert.equal(held.status, 'held');
  assert.equal(held.open, undefined);
  assert.equal(send(tracker, .44, 230 + OPEN_DELAY + 40, hit).open, '12');
});

test('relaxed half-pinch at gap 0.39 does not trigger Way B Chinese 3', () => {
  const tracker = createGestureTracker();
  const r0 = tracker.update(anatomicalHand({ pose: 'wayB', gap: .39 }), 0, 1, miss);
  assert.equal(r0.status, 'aim');
  const r1 = tracker.update(anatomicalHand({ pose: 'wayB', gap: .39 }), 160, 1, miss);
  assert.equal(r1.status, 'aim');
  assert.equal(r1.shape, undefined);
});
