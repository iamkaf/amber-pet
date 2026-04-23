(() => {
  const vscode = acquireVsCodeApi();
  const pet = document.querySelector('.pet');
  const sprite = document.querySelector('.pet-sprite');
  const shadow = document.querySelector('.pet-shadow');
  const stage = document.querySelector('.pet-stage');
  const savedState = vscode.getState() || {};
  const defaultState = {
    x: 0.5,
    y: 0.52,
    lastUserActivityAt: Date.now(),
    nextTypingReaction: 'cheering'
  };
  const state = {
    ...defaultState,
    ...savedState
  };
  const idleTimings = {
    boredAfterMs: 45_000,
    sleepAfterMs: 135_000,
    typingCooldownMs: 9_000
  };

  let config = null;
  let manifest = null;
  let drag = null;
  let animationTimer = undefined;
  let ambientTimer = undefined;
  let currentAnimation = null;
  let currentFrameIndex = 0;
  let currentMode = 'ambient';
  let lastTypingReactionAt = 0;

  function postMessage(message) {
    vscode.postMessage(message);
  }

  function persist() {
    vscode.setState({
      x: state.x,
      y: state.y,
      lastUserActivityAt: state.lastUserActivityAt,
      nextTypingReaction: state.nextTypingReaction
    });
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function frameUrl(frameName) {
    return `${config.assets.frameBaseUri.replace(/\/$/, '')}/${frameName}`;
  }

  function frame(frameName) {
    const next = manifest.frames[frameName];

    if (!next) {
      throw new Error(`Missing Amber Pet frame: ${frameName}`);
    }

    return next;
  }

  function animation(name) {
    const next = manifest.animations[name];

    if (!next || next.frames.length === 0) {
      throw new Error(`Missing Amber Pet animation: ${name}`);
    }

    return next;
  }

  function setSprite(frameName) {
    const next = frame(frameName);
    sprite.src = frameUrl(next.file);
    pet.style.setProperty('--pet-pivot-x', String(next.pivot.x));
    pet.style.setProperty('--pet-pivot-y', String(next.pivot.y));
  }

  function clearAnimationTimer() {
    window.clearTimeout(animationTimer);
    animationTimer = undefined;
  }

  function playAnimation(name, options = {}) {
    const next = animation(name);

    if (!options.force && currentAnimation === name && currentMode === (options.mode || 'ambient')) {
      return;
    }

    clearAnimationTimer();
    currentAnimation = name;
    currentMode = options.mode || 'ambient';
    currentFrameIndex = 0;
    setSprite(next.frames[currentFrameIndex]);
    scheduleNextFrame(next, options);
  }

  function scheduleNextFrame(activeAnimation, options) {
    const delay = Math.max(50, Math.round(1000 / activeAnimation.fps));

    animationTimer = window.setTimeout(() => {
      currentFrameIndex += 1;

      if (currentFrameIndex >= activeAnimation.frames.length) {
        if (activeAnimation.loop) {
          currentFrameIndex = 0;
        } else {
          currentMode = 'ambient';
          chooseAmbientAnimation(true);
          return;
        }
      }

      setSprite(activeAnimation.frames[currentFrameIndex]);
      scheduleNextFrame(activeAnimation, options);
    }, delay);
  }

  function markUserActivity() {
    state.lastUserActivityAt = Date.now();
    persist();
  }

  function chooseAmbientAnimation(force = false) {
    if (currentMode !== 'ambient') {
      return;
    }

    const idleFor = Date.now() - state.lastUserActivityAt;
    const nextAnimation =
      idleFor >= idleTimings.sleepAfterMs ? 'sleep' : idleFor >= idleTimings.boredAfterMs ? 'bored' : 'idle';

    playAnimation(nextAnimation, { force, mode: 'ambient' });
  }

  function playOneShot(name) {
    if (currentMode === 'dragging') {
      return;
    }

    playAnimation(name, { force: true, mode: 'oneshot' });
  }

  function handleActivity(activity) {
    if (activity === 'spawn' || activity === 'editorOpened') {
      markUserActivity();
      playOneShot('wave');
      return;
    }

    if (activity === 'typing') {
      markUserActivity();

      if (Date.now() - lastTypingReactionAt < idleTimings.typingCooldownMs) {
        chooseAmbientAnimation(true);
        return;
      }

      lastTypingReactionAt = Date.now();
      const reaction = state.nextTypingReaction === 'cheering' ? 'cheering' : 'wow';
      state.nextTypingReaction = reaction === 'cheering' ? 'wow' : 'cheering';
      persist();
      playOneShot(reaction);
    }
  }

  function stageRect() {
    return stage.getBoundingClientRect();
  }

  function petRect() {
    return pet.getBoundingClientRect();
  }

  function applyPosition() {
    const rect = stageRect();
    const petBounds = petRect();
    const halfWidth = petBounds.width / 2;
    const halfHeight = petBounds.height / 2;
    const x = clamp(state.x * rect.width, halfWidth, rect.width - halfWidth);
    const y = clamp(state.y * rect.height, halfHeight, rect.height - halfHeight);

    state.x = rect.width > 0 ? x / rect.width : defaultState.x;
    state.y = rect.height > 0 ? y / rect.height : defaultState.y;
    pet.style.left = `${x}px`;
    pet.style.top = `${y}px`;
    shadow.style.left = `${x}px`;
    shadow.style.top = `${y + halfHeight * 0.58}px`;
  }

  function pointerPoint(event) {
    return {
      x: event.clientX,
      y: event.clientY
    };
  }

  function startDrag(event) {
    const point = pointerPoint(event);
    const rect = petRect();

    drag = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      offsetX: point.x - rect.left,
      offsetY: point.y - rect.top,
      moved: false
    };

    markUserActivity();
    pet.setPointerCapture(event.pointerId);
  }

  function moveDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const rect = stageRect();
    const petBounds = petRect();
    const point = pointerPoint(event);
    const centerX = point.x - rect.left - drag.offsetX + petBounds.width / 2;
    const centerY = point.y - rect.top - drag.offsetY + petBounds.height / 2;
    const nextX = clamp(centerX, petBounds.width / 2, rect.width - petBounds.width / 2);
    const nextY = clamp(centerY, petBounds.height / 2, rect.height - petBounds.height / 2);
    const movedDistance = Math.hypot(point.x - drag.startX, point.y - drag.startY);

    state.x = rect.width > 0 ? nextX / rect.width : state.x;
    state.y = rect.height > 0 ? nextY / rect.height : state.y;
    if (!drag.moved && movedDistance > 4) {
      drag.moved = true;
      pet.classList.add('is-dragging');
      playAnimation('dragged', { force: true, mode: 'dragging' });
    }

    applyPosition();
    persist();
  }

  function endDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const moved = drag.moved;
    drag = null;
    pet.classList.remove('is-dragging');
    currentMode = 'ambient';
    markUserActivity();

    if (moved) {
      chooseAmbientAnimation(true);
      postMessage({ type: 'interaction', name: 'drag' });
      return;
    }

    playOneShot('headpat');
    postMessage({ type: 'interaction', name: 'headpat' });
  }

  function initialize(configMessage) {
    config = configMessage;
    manifest = configMessage.manifest;
    document.documentElement.dataset.amberPetVersion = config.extensionVersion;
    setSprite(animation('idle').frames[0]);

    applyPosition();
    chooseAmbientAnimation(true);
    window.clearInterval(ambientTimer);
    ambientTimer = window.setInterval(() => chooseAmbientAnimation(), 1_000);
  }

  pet.addEventListener('pointerdown', startDrag);
  pet.addEventListener('pointermove', moveDrag);
  pet.addEventListener('pointerup', endDrag);
  pet.addEventListener('pointercancel', endDrag);

  pet.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      markUserActivity();
      playOneShot('headpat');
      postMessage({ type: 'interaction', name: 'headpat' });
    }
  });

  window.addEventListener('resize', () => {
    applyPosition();
    persist();
  });

  window.addEventListener('error', (event) => {
    postMessage({ type: 'error', message: event.message });
  });

  window.addEventListener('message', (event) => {
    const message = event.data;

    if (message?.type === 'config') {
      initialize(message.config);
      return;
    }

    if (message?.type === 'activity') {
      handleActivity(message.activity);
    }
  });

  applyPosition();
  postMessage({ type: 'ready' });
})();
