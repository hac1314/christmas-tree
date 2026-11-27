const POSE_MS = 150;
const LOST_MS = 250;
const AIM_GAP_MS = 105;
const TARGET_MS = 85;
const HOLD_MS = 120;
const RELEASE_MS = 80;
const QUIET_MS = 260;
const CLOSED = .36;
const RELEASED = .50;
const AIM_ENTER = .80;
const AIM_EXIT = .90;
const AIM_EXIT_MS = 90;
const FREEZE_GAP = .46;
const ONE_MIN_GAP = .68;
const TWO_MIN_GAP = .58;
const THREE_MIN_GAP = .55;
const WAY_B_MAX_GAP = .32;
const TARGET_GRACE_MS = 75;
// —— v2 抓取 ——
const OPEN_HOLD_MS = 420;      // 捏住不动多久算"看大图"
const GRAB_MOVE = .028;        // 指尖移动多少算"抓起来拖"
const PULL_OPEN = 1.32;        // 手往镜头方向拉近到这个倍数 → 照片飞出来
const PULL_BACK = .74;         // 已经打开的图，手推远到这个倍数 → 关掉
const FLING_MIN = .035;        // 张手平移的挥动速度阈值（触发惯性）
const OK_GAP = .34;            // 拇指与食指相碰的阈值（👌 彩蛋）
const COMBO_MS = 720;          // 两次握拳的间隔（双击彩蛋）
const PAIR_MIN_SPREAD = .085;  // 两只手离得太近不算"双手手势"

const POSE_TO_SHAPE = {
  fist: 'tree',
  open: 'nebula',
  one: 'heart',
  two: 'ring',
  three: 'spiral',
};

function measureHand(points, aspect, previousPose, isPinching = false) {
  if (points?.length !== 21) return null;
  const distance = (a, b) => Math.hypot((points[a].x - points[b].x) * aspect, points[a].y - points[b].y);
  const palm = Math.max(distance(0, 9), distance(5, 17) * 1.15);
  if (palm < .012) return null;

  const gap = distance(4, 8) / palm;
  const index = distance(0, 8) / palm;
  const others = [12, 16, 20].map(tip => distance(0, tip) / palm);
  const curl = previousPose === 'fist' ? 1.18 : 1.10;
  const hasAnyJoints = distance(0, 6) >= .001 && distance(5, 6) >= .001;

  const jointCos = (mcp, pip, tip) => {
    const v1x = (points[pip].x - points[mcp].x) * aspect;
    const v1y = points[pip].y - points[mcp].y;
    const v2x = (points[tip].x - points[pip].x) * aspect;
    const v2y = points[tip].y - points[pip].y;
    const n1 = Math.hypot(v1x, v1y);
    const n2 = Math.hypot(v2x, v2y);
    if (n1 < .001 || n2 < .001) return 0;
    return (v1x * v2x + v1y * v2y) / (n1 * n2);
  };

  const isExtended = (tip, pip, mcp) => {
    const tipDist = distance(0, tip);
    const pipDist = distance(0, pip);
    const mcpPipDist = distance(mcp, pip);
    const hasJoints = pipDist >= .001 && mcpPipDist >= .001;
    if (!hasJoints) return tipDist / palm > 1.24;
    return tipDist / palm > 1.22 && tipDist > pipDist * 1.12 && jointCos(mcp, pip, tip) > .35;
  };

  const isCurled = (tip, pip, mcp) => {
    const tipDist = distance(0, tip);
    const pipDist = distance(0, pip);
    const mcpPipDist = distance(mcp, pip);
    const hasJoints = pipDist >= .001 && mcpPipDist >= .001;
    if (!hasJoints) return tipDist / palm < 1.15;
    if (tipDist / palm < 1.16) return true;
    const cos = jointCos(mcp, pip, tip);
    return tipDist / palm < 1.38 && (tipDist <= pipDist * 1.10 || cos <= .32);
  };

  const isTightCurled = (tip, pip, mcp) => {
    const tipDist = distance(0, tip);
    const pipDist = distance(0, pip);
    const mcpPipDist = distance(mcp, pip);
    const hasJoints = pipDist >= .001 && mcpPipDist >= .001;
    if (!hasJoints) return tipDist / palm < curl;
    return tipDist / palm < 1.12 || (tipDist <= pipDist * 1.02 && jointCos(mcp, pip, tip) < .05 && tipDist / palm < 1.30);
  };

  const indexExt = isExtended(8, 6, 5);
  const middleExt = isExtended(12, 10, 9);
  const ringExt = isExtended(16, 14, 13);
  const pinkyExt = isExtended(20, 18, 17);
  const indexCurl = isCurled(8, 6, 5);
  const middleCurl = isCurled(12, 10, 9);
  const ringCurl = isCurled(16, 14, 13);
  const pinkyCurl = isCurled(20, 18, 17);
  const indexTight = isTightCurled(8, 6, 5);
  const middleTight = isTightCurled(12, 10, 9);
  const ringTight = isTightCurled(16, 14, 13);
  const pinkyTight = isTightCurled(20, 18, 17);

  let fist;
  if (!hasAnyJoints) {
    fist = index < curl && others.every(length => length < curl);
  } else if (previousPose === 'fist') {
    fist = !indexExt && !middleExt && !ringExt && !pinkyExt && indexCurl && middleCurl && ringCurl && pinkyCurl;
  } else if (isPinching) {
    fist = index < 1.12 && indexTight && middleTight && ringTight && pinkyTight;
  } else {
    fist = indexTight && middleTight && ringTight && pinkyTight && others.every(length => length < 1.26);
  }

  const openLimit = previousPose === 'open' ? AIM_ENTER : AIM_EXIT;
  const open = gap >= openLimit && indexExt && middleExt && ringExt && pinkyExt;
  const straightOuterThree = hasAnyJoints
    ? jointCos(9, 10, 12) > .50 && jointCos(13, 14, 16) > .50 && jointCos(17, 18, 20) > .50
    : true;
  // 👌：拇指与食指相碰，其余三指立着
  const ok = gap <= OK_GAP && middleExt && ringExt && pinkyExt && !indexExt;

  let pose = 'neutral';
  if (fist) pose = 'fist';
  else if (open) pose = 'open';
  else if (gap >= ONE_MIN_GAP && indexExt && middleCurl && ringCurl && pinkyCurl) pose = 'one';
  else if (gap >= TWO_MIN_GAP && indexExt && middleExt && ringCurl && pinkyCurl) pose = 'two';
  else if (gap >= THREE_MIN_GAP && indexExt && middleExt && ringExt && !pinkyExt && (pinkyCurl || (previousPose === 'three' && distance(0, 20) / palm < 1.40))) pose = 'three';
  else if (gap <= WAY_B_MAX_GAP && !indexExt && middleExt && ringExt && pinkyExt && straightOuterThree && (indexCurl || !hasAnyJoints || index < 1.32)) pose = 'three';

  return {
    gap,
    pose,
    ok,
    span: palm,
    canAim: !fist && (index >= 1.02 || others.filter(length => length > 1.25).length >= 2),
    tip: {
      x: Math.max(0, Math.min(1, 1 - (points[4].x + points[8].x) / 2)),
      y: Math.max(0, Math.min(1, (points[4].y + points[8].y) / 2)),
    },
    palm: {
      x: (points[0].x + points[5].x + points[17].x) / 3,
      y: (points[0].y + points[5].y + points[17].y) / 3,
    },
  };
}

export function createGestureTracker() {
  let lastSeen = -Infinity;
  let pose = 'neutral';
  let poseCandidate = 'neutral';
  let poseSince = 0;
  let lastPoseSeen = 'neutral';
  let previousPalm = null;
  let velocityX = 0;
  let velocityY = 0;
  let quietUntil = -Infinity;
  let lastFling = null;
  let lastFistAt = -Infinity;
  let okLatched = false;

  let phase = 'idle';
  let tip = null;
  let tipTime = 0;
  let target = null;
  let targetSince = 0;
  let missSince = null;
  let aimExitSince = null;
  let pressSince = 0;
  let releaseSince = null;

  // —— 捏住之后的抓取状态 ——
  let heldSince = 0;
  let spanAtGrab = 0;
  let grabTipStart = null;
  let grabbing = false;
  let grabOpened = false;

  let pairPrev = null;
  let pendingOk = null;
  let pendingBurst = null;

  function resetMotion() {
    previousPalm = null;
    velocityX = 0;
    velocityY = 0;
  }

  function resetAim(nextPhase = 'idle') {
    phase = nextPhase;
    tip = null;
    target = null;
    missSince = null;
    aimExitSince = null;
    releaseSince = null;
  }

  function resetGrab() {
    heldSince = 0;
    spanAtGrab = 0;
    grabTipStart = null;
    grabbing = false;
    grabOpened = false;
  }

  function takeFling() {
    const fling = lastFling;
    lastFling = null;
    return fling || undefined;
  }

  function finishHold(now, hand) {
    resetAim();
    resetMotion();
    resetGrab();
    quietUntil = now + QUIET_MS;
    // Consume the posture used to release the picture. A new shape needs a new pose.
    pose = poseCandidate = hand?.pose ?? 'neutral';
    poseSince = now;
    return { close: true, status: pose, pressProgress: 0 };
  }

  function moveScene(hand, now) {
    if (now < quietUntil) {
      pose = poseCandidate = hand.pose;
      poseSince = now;
      resetMotion();
      return { status: hand.pose, pressProgress: 0 };
    }
    let shape;
    if (poseCandidate !== hand.pose) {
      poseCandidate = hand.pose;
      poseSince = now;
    }
    if (pose !== poseCandidate && now - poseSince >= POSE_MS) {
      pose = poseCandidate;
      shape = POSE_TO_SHAPE[pose];
    }
    if (pose !== 'open' || hand.pose !== 'open') {
      resetMotion();
      return { shape, status: hand.pose, pressProgress: 0 };
    }
    const previous = previousPalm;
    previousPalm = hand.palm;
    if (!previous) return { shape, status: 'open', pressProgress: 0 };
    const rx = Math.max(-.095, Math.min(.095, (previous.x - hand.palm.x) * 2.45));
    const ry = Math.max(-.065, Math.min(.065, (hand.palm.y - previous.y) * 1.85));
    velocityX += (rx - velocityX) * .50;
    velocityY += (ry - velocityY) * .50;
    // 张手挥动：记住这一下的速度，手消失时变成场景惯性（"甩出去"）
    lastFling = Math.hypot(velocityX, velocityY) >= FLING_MIN ? { vx: velocityX, vy: velocityY } : lastFling;
    return { shape, dx: velocityX, dy: velocityY, status: 'open', pressProgress: 0 };
  }

  function grabSnapshot(hand, now) {
    phase = 'held';
    heldSince = now;
    spanAtGrab = hand.span;
    grabTipStart = { x: hand.tip.x, y: hand.tip.y };
    grabbing = false;
    grabOpened = false;
    return { grab: target, status: 'held', pressProgress: 1, grabbing: false, pull: 1 };
  }

  function updateHeld(hand, now) {
    const pull = spanAtGrab ? hand.span / spanAtGrab : 1;
    const moved = grabTipStart
      ? Math.hypot(hand.tip.x - grabTipStart.x, hand.tip.y - grabTipStart.y)
      : 0;
    if (!grabbing && moved >= GRAB_MOVE) grabbing = true;

    if (hand.gap < RELEASED) {
      releaseSince = null;
      // 手往镜头方向拉 → 照片飞出来看大图
      if (!grabOpened && target !== null && pull >= PULL_OPEN) {
        grabOpened = true;
        return { open: target, status: 'held', pressProgress: 1, grabbing, grabMove: { x: hand.tip.x, y: hand.tip.y } };
      }
      // 已经打开了，手推回去 → 关掉
      if (grabOpened && pull <= PULL_BACK) return finishHold(now, hand);
      // 捏住不动 → 也打开（老手感保留）
      if (!grabOpened && !grabbing && target !== null && now - heldSince >= OPEN_HOLD_MS) {
        grabOpened = true;
        return { open: target, status: 'held', pressProgress: 1 };
      }
      if (grabbing && !grabOpened) {
        return { status: 'held', pressProgress: 1, grabbing: true, grabMove: { x: hand.tip.x, y: hand.tip.y }, pull };
      }
      return { status: 'held', pressProgress: 1, grabbing: false, pull };
    }

    if (releaseSince === null) releaseSince = now;
    if (now - releaseSince >= RELEASE_MS) {
      const wasGrabbing = grabbing;
      const opened = grabOpened;
      const result = finishHold(now, hand);
      if (wasGrabbing && !opened) return { released: true, status: hand.pose, pressProgress: 0 };
      return result;
    }
    return { status: 'held', pressProgress: 1, grabbing, grabMove: grabbing ? { x: hand.tip.x, y: hand.tip.y } : undefined };
  }

  function updateSingle(points, now, aspect, locate) {
    const result = stepSingle(points, now, aspect, locate) || { status: 'none', pressProgress: 0 };
    if (pendingOk) {
      result.ok = true;
      pendingOk = null;
      if (pendingBurst) {
        result.burst = pendingBurst;
        pendingBurst = null;
      }
    } else if (pendingBurst) {
      result.burst = pendingBurst;
      pendingBurst = null;
    }
    return result;
  }

  function stepSingle(points, now, aspect, locate) {
    const isPinching = phase === 'aim' || phase === 'press' || phase === 'held';
    const hand = measureHand(points, aspect, pose, isPinching);
    if (!hand) {
      resetMotion();
      poseCandidate = pose;
      if (phase === 'held') {
        releaseSince = null;
        if (grabbing && !grabOpened) {
          const result = finishHold(now, null);
          return { released: true, status: result.status, pressProgress: 0 };
        }
        if (now - lastSeen >= LOST_MS) return finishHold(now, null);
        return { status: 'held', pressProgress: 1 };
      }
      if ((phase === 'aim' || phase === 'press') && now - lastSeen <= AIM_GAP_MS) {
        if (phase === 'press') pressSince = null;
        if (phase === 'aim' && lastSeen - targetSince < TARGET_MS) targetSince = now;
        return { aim: tip, target, status: phase, pressProgress: 0, fling: takeFling() };
      }
      if (phase === 'press') resetAim('blocked');
      if (phase === 'aim') resetAim();
      if (now - lastSeen >= LOST_MS) {
        pose = poseCandidate = 'neutral';
        resetAim();
      }
      return { status: 'none', pressProgress: 0, fling: takeFling() };
    }
    lastSeen = now;

    // 彩蛋：连握两下拳 → 撒一把星（形态切换照旧走后面的流程）
    if (hand.pose === 'fist' && lastPoseSeen !== 'fist') {
      const combo = now - lastFistAt <= COMBO_MS;
      lastFistAt = now;
      lastPoseSeen = 'fist';
      if (combo) pendingBurst = { x: 1 - hand.palm.x, y: hand.palm.y };
    } else if (hand.pose !== 'fist') {
      lastPoseSeen = hand.pose;
    }

    // 彩蛋：👌 只触发一次
    if (hand.ok && !okLatched) {
      okLatched = true;
      pendingOk = true;
      pendingBurst = { x: 1 - hand.palm.x, y: hand.palm.y };
    }
    if (!hand.ok && hand.gap > .46) okLatched = false;

    if (phase === 'held') return updateHeld(hand, now);

    if (now < quietUntil) return moveScene(hand, now);

    if (phase === 'press') {
      if (hand.gap >= RELEASED) resetAim();
      else if (hand.pose === 'fist') resetAim('blocked');
      else {
        if (pressSince === null) pressSince = now;
        const elapsed = now - pressSince;
        if (elapsed >= HOLD_MS) return grabSnapshot(hand, now);
        return { aim: tip, target, status: 'press', pressProgress: Math.min(1, Math.max(0, elapsed / HOLD_MS)) };
      }
    }

    if (phase === 'blocked') {
      if (hand.gap >= RELEASED) resetAim();
      else return moveScene(hand, now);
    }

    const isWayB = hand.pose === 'three' && hand.gap <= WAY_B_MAX_GAP;
    const isCountPose = hand.pose === 'one' || hand.pose === 'two' || hand.pose === 'three';
    const lockAim = phase === 'press' || (phase === 'aim' && target !== null && (hand.gap < .72 || isWayB));
    const inAimBand = phase === 'aim' ? hand.gap < AIM_EXIT : hand.gap < AIM_ENTER;

    if (phase === 'aim' && hand.canAim && !isCountPose && hand.gap >= AIM_EXIT) {
      if (aimExitSince === null) aimExitSince = now;
      if (now - aimExitSince < AIM_EXIT_MS) {
        resetMotion();
        locate(tip, target);
        return { aim: tip, target, status: 'aim', pressProgress: 0 };
      }
    } else if (inAimBand) {
      aimExitSince = null;
    }

    if (hand.canAim && inAimBand && (!isCountPose || lockAim)) {
      resetMotion();
      poseCandidate = pose;
      if (hand.gap <= CLOSED) {
        if (phase === 'aim' && target !== null && now - targetSince >= TARGET_MS) {
          phase = 'press';
          pressSince = now;
          return { aim: tip, target, status: 'press', pressProgress: 0 };
        }
        resetAim('blocked');
        if (hand.pose === 'three') return moveScene(hand, now);
        return { status: hand.pose, pressProgress: 0 };
      }
      if (phase === 'aim' && target !== null && hand.gap <= FREEZE_GAP) {
        tipTime = now;
        missSince = null;
        locate(tip, target);
        return { aim: tip, target, status: 'aim', pressProgress: 0 };
      }
      const tau = target !== null ? 85 : 58;
      const mix = tip ? 1 - Math.exp(-(now - tipTime) / tau) : 1;
      tip = tip
        ? { x: tip.x + (hand.tip.x - tip.x) * mix, y: tip.y + (hand.tip.y - tip.y) * mix }
        : hand.tip;
      tipTime = now;
      phase = 'aim';
      const hit = locate(tip, target);
      if (hit !== null) {
        missSince = null;
        if (target !== hit) {
          target = hit;
          targetSince = now;
        }
      } else if (target !== null) {
        if (missSince === null) missSince = now;
        if (now - missSince >= TARGET_GRACE_MS) {
          target = null;
          targetSince = now;
          missSince = null;
        }
      } else {
        targetSince = now;
        missSince = null;
      }
      return { aim: tip, target, status: 'aim', pressProgress: 0 };
    }

    resetAim(hand.gap < RELEASED ? 'blocked' : 'idle');
    return moveScene(hand, now);
  }

  // —— 双手：张合缩放 + 平移旋转 ——
  function pairUpdate(hands, now, aspect) {
    if (!hands || hands.length < 2) {
      pairPrev = null;
      return null;
    }
    const measured = hands
      .map(points => measureHand(points, aspect, 'neutral', false))
      .filter(Boolean)
      .sort((a, b) => b.palm.x - a.palm.x);
    if (measured.length < 2) {
      pairPrev = null;
      return null;
    }
    const [a, b] = measured;
    const spread = Math.hypot((a.palm.x - b.palm.x) * aspect, a.palm.y - b.palm.y);
    if (spread < PAIR_MIN_SPREAD) {
      pairPrev = null;
      return null;
    }
    const angle = Math.atan2(a.palm.y - b.palm.y, (a.palm.x - b.palm.x) * aspect);
    const mid = { x: (a.palm.x + b.palm.x) / 2, y: (a.palm.y + b.palm.y) / 2 };
    const previous = pairPrev;
    pairPrev = { spread, angle, mid, at: now };
    if (!previous || now - previous.at > 400) {
      return { status: 'pair', zoom: 1, dx: 0, dy: 0, pressProgress: 0 };
    }
    const zoom = Math.max(.86, Math.min(1.16, previous.spread / Math.max(.02, spread)));
    const dx = Math.max(-.06, Math.min(.06, (previous.mid.x - mid.x) * 1.9));
    let turn = angle - previous.angle;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    const dy = Math.max(-.05, Math.min(.05, (previous.mid.y - mid.y) * 1.4 + turn * .34));
    return { status: 'pair', zoom, dx, dy, pressProgress: 0 };
  }

  return {
    cancel(now) {
      finishHold(now, null);
      phase = 'blocked';
    },
    update(points, now, aspect, locate) {
      return updateSingle(points, now, aspect, locate);
    },
    updatePair(hands, now, aspect) {
      return pairUpdate(hands, now, aspect);
    },
    resetPair() {
      pairPrev = null;
    },
  };
}
