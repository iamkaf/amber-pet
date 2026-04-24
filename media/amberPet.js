(() => {
  const vscode = acquireVsCodeApi();
  const pet = document.querySelector(".pet");
  const sprite = document.querySelector(".pet-sprite");
  const shadow = document.querySelector(".pet-shadow");
  const stage = document.querySelector(".pet-stage");
  const backgroundLayers = Array.from(document.querySelectorAll(".room-background-layer"));
  const backgroundControls = document.querySelector(".background-controls");
  const soundToggle = document.querySelector("[data-sound-toggle]");
  const savedState = vscode.getState() || {};
  const defaultState = {
    x: 0.5,
    y: 0.52,
    backgroundId: undefined,
    backgroundName: undefined,
    lastUserActivityAt: Date.now(),
    nextTypingReaction: "cheering",
    hasPlayedIntro: false,
    soundMuted: false,
  };
  const state = {
    ...defaultState,
    ...savedState,
  };
  const idleTimings = {
    boredAfterMs: 45_000,
    sleepAfterMs: 135_000,
    typingCooldownMs: 3_000,
  };
  const backgroundVariantBreakpointPx = 520;
  const soundCooldowns = {
    aprehensive: 1000,
    aprehensive3: 1000,
    curious: 700,
    dropped1: 700,
    dropped2: 700,
    happy: 200,
    startled: 700,
  };
  const defaultSettings = {
    soundEnabled: true,
    soundVolume: 0.45,
  };
  const dragFeel = {
    anchorLerp: 0.055,
    apprehensiveDistancePx: 118,
    dropOffsetPx: 20,
    headAnchorX: 0.5,
    headAnchorY: 0.28,
    positionLerp: 0.24,
  };
  const gravityFeel = {
    acceleration: 0.0018,
    floorInsetRatio: 0.46,
    maxFloorInsetPx: 92,
    maxVelocity: 1.1,
    minFloorInsetPx: 34,
    settleDistancePx: 0.8,
  };

  let config = null;
  let manifest = null;
  let settings = { ...defaultSettings };
  let sounds = {};
  let lastSoundAt = {};
  let nextApprehensiveSoundIndex = 0;
  let drag = null;
  let animationTimer = undefined;
  let ambientTimer = undefined;
  let currentAnimation = null;
  let currentFrameIndex = 0;
  let currentMode = "ambient";
  let lastTypingReactionAt = 0;
  let motionClass = undefined;
  let isHoverArmed = true;
  let dragRaf = undefined;
  let gravityRaf = undefined;
  let gravityLastAt = undefined;
  let gravityVelocityY = 0;
  let shouldPlayLandingReaction = false;
  let lastPointerClientX = undefined;
  let currentPivotY = 1;
  let activeBackgroundLayerIndex = 0;
  let currentBackground = null;

  function postMessage(message) {
    vscode.postMessage(message);
  }

  function persist() {
    vscode.setState({
      x: state.x,
      y: state.y,
      backgroundId: state.backgroundId,
      backgroundName: state.backgroundName,
      lastUserActivityAt: state.lastUserActivityAt,
      nextTypingReaction: state.nextTypingReaction,
      hasPlayedIntro: state.hasPlayedIntro,
      soundMuted: state.soundMuted,
    });
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function frameUrl(frameName) {
    return `${config.assets.frameBaseUri.replace(/\/$/, "")}/${frameName}`;
  }

  function setupBackground() {
    const backgrounds = config.assets.backgrounds || [];

    if (backgrounds.length === 0) {
      stage.classList.remove("has-room-background");
      backgroundLayers.forEach((layer) => {
        layer.style.removeProperty("background-image");
        layer.classList.remove("is-active");
      });
      backgroundControls.hidden = true;
      return;
    }

    let selected =
      backgrounds.find((background) => background.id === state.backgroundId) ||
      backgrounds.find((background) => {
        return (
          background.wide.name === state.backgroundName ||
          background.narrow.name === state.backgroundName
        );
      });

    if (!selected) {
      selected = backgrounds[Math.floor(Math.random() * backgrounds.length)];
      state.backgroundId = selected.id;
      persist();
    }

    setBackground(selected, { animate: false, force: true });
    backgroundControls.hidden = backgrounds.length <= 1;
  }

  function preferredBackgroundVariant(background) {
    return window.innerWidth < backgroundVariantBreakpointPx ? background.narrow : background.wide;
  }

  function setBackground(background, options = {}) {
    currentBackground = background;
    state.backgroundId = background.id;
    stage.classList.add("has-room-background");
    applyBackgroundVariant(options);
    persist();
  }

  function applyBackgroundVariant(options = {}) {
    if (!currentBackground) {
      return;
    }

    const variant = preferredBackgroundVariant(currentBackground);

    if (!options.force && state.backgroundName === variant.name) {
      return;
    }

    state.backgroundName = variant.name;

    if (backgroundLayers.length < 2) {
      stage.style.setProperty("--room-background-image", `url("${variant.uri}")`);
      return;
    }

    const nextLayerIndex = options.animate
      ? 1 - activeBackgroundLayerIndex
      : activeBackgroundLayerIndex;
    const nextLayer = backgroundLayers[nextLayerIndex];
    const previousLayer = backgroundLayers[activeBackgroundLayerIndex];

    nextLayer.style.backgroundImage = `url("${variant.uri}")`;
    nextLayer.classList.add("is-active");

    if (nextLayer !== previousLayer) {
      previousLayer.classList.remove("is-active");
      activeBackgroundLayerIndex = nextLayerIndex;
    }
  }

  function changeBackground(step) {
    const backgrounds = config?.assets.backgrounds || [];

    if (backgrounds.length <= 1) {
      return;
    }

    const currentIndex = Math.max(
      0,
      backgrounds.findIndex((background) => background.id === state.backgroundId),
    );
    const nextIndex = (currentIndex + step + backgrounds.length) % backgrounds.length;

    setBackground(backgrounds[nextIndex], { animate: true });
  }

  function updateBackgroundForViewport() {
    applyBackgroundVariant({ animate: true });
    persist();
  }

  function setupSounds() {
    sounds = Object.fromEntries(
      Object.entries(config.assets.sounds).map(([name, url]) => {
        const audio = new Audio(url);
        audio.preload = "auto";
        audio.volume = soundVolumeFor(name);
        return [name, audio];
      }),
    );
    updateSoundControl();
  }

  function playSound(name, options = {}) {
    const sound = sounds[name];
    const now = Date.now();

    if (
      !sound ||
      state.soundMuted ||
      !settings.soundEnabled ||
      now - (lastSoundAt[name] || 0) < soundCooldowns[name]
    ) {
      return;
    }

    lastSoundAt[name] = now;
    sound.pause();
    sound.currentTime = 0;
    sound.volume = soundVolumeFor(name);
    sound.playbackRate = options.varyPitch ? 0.94 + Math.random() * 0.12 : 1;
    void sound.play().catch(() => undefined);
  }

  function soundVolumeFor(name) {
    if (!settings.soundEnabled || state.soundMuted) {
      return 0;
    }

    const multiplier = name.startsWith("aprehensive") ? 1.2 : 1;
    return clamp(settings.soundVolume * multiplier, 0, 1);
  }

  function normalizeSettings(rawSettings = {}) {
    const volume = Number(rawSettings.soundVolume);

    return {
      soundEnabled: rawSettings.soundEnabled !== false,
      soundVolume: Number.isFinite(volume) ? clamp(volume, 0, 1) : defaultSettings.soundVolume,
    };
  }

  function updateSoundControl() {
    if (!soundToggle) {
      return;
    }

    if (!settings.soundEnabled) {
      soundToggle.classList.add("is-muted");
      soundToggle.setAttribute("aria-pressed", "true");
      soundToggle.setAttribute("aria-label", "Amber sounds are disabled in settings");
      soundToggle.title = "Sounds disabled in settings";
      return;
    }

    const isMuted = state.soundMuted;
    soundToggle.classList.toggle("is-muted", isMuted);
    soundToggle.setAttribute("aria-pressed", String(isMuted));
    soundToggle.setAttribute("aria-label", isMuted ? "Unmute Amber sounds" : "Mute Amber sounds");
    soundToggle.title = isMuted ? "Unmute sounds" : "Mute sounds";
  }

  function toggleSoundMuted() {
    if (!settings.soundEnabled) {
      return;
    }

    state.soundMuted = !state.soundMuted;
    persist();
    updateSoundControl();
  }

  function playRandomSound(names) {
    playSound(names[Math.floor(Math.random() * names.length)]);
  }

  function playNextApprehensiveSound() {
    const names = ["aprehensive", "aprehensive3"];
    const now = Date.now();

    if (now - (lastSoundAt.aprehensiveGroup || 0) < soundCooldowns.aprehensive) {
      return;
    }

    lastSoundAt.aprehensiveGroup = now;
    playSound(names[nextApprehensiveSoundIndex]);
    nextApprehensiveSoundIndex = (nextApprehensiveSoundIndex + 1) % names.length;
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
    currentPivotY = next.pivot.y;
    sprite.src = frameUrl(next.file);
    pet.style.setProperty("--pet-pivot-x", String(next.pivot.x));
    pet.style.setProperty("--pet-pivot-y", String(next.pivot.y));
  }

  function setMotionClass(name) {
    clearHoverBounce();

    if (motionClass) {
      pet.classList.remove(motionClass);
    }

    motionClass = name ? `is-${name}` : undefined;

    if (motionClass) {
      void pet.offsetWidth;
      pet.classList.add(motionClass);
    }
  }

  function setDirection(direction) {
    pet.style.setProperty("--pet-direction", direction);
  }

  function faceClientX(clientX) {
    const bounds = petRect();
    const centerX = bounds.left + bounds.width / 2;

    if (Math.abs(clientX - centerX) < 4) {
      return;
    }

    setDirection(clientX > centerX ? "-1" : "1");
  }

  function rememberPointer(event) {
    lastPointerClientX = event.clientX;
  }

  function faceLastPointer() {
    if (lastPointerClientX === undefined || drag) {
      return;
    }

    faceClientX(lastPointerClientX);
  }

  function clearHoverBounce() {
    pet.classList.remove("is-hovering");
  }

  function playIntroBounce() {
    pet.classList.remove("is-intro");
    void pet.offsetWidth;
    pet.classList.add("is-intro");
  }

  function canPlayHoverBounce() {
    return isHoverArmed && currentMode === "ambient" && !drag;
  }

  function playHoverBounce() {
    if (!canPlayHoverBounce()) {
      return;
    }

    faceLastPointer();
    isHoverArmed = false;
    clearHoverBounce();
    void pet.offsetWidth;
    pet.classList.add("is-hovering");
  }

  function clearAnimationTimer() {
    window.clearTimeout(animationTimer);
    animationTimer = undefined;
  }

  function playAnimation(name, options = {}) {
    const next = animation(name);

    if (
      !options.force &&
      currentAnimation === name &&
      currentMode === (options.mode || "ambient")
    ) {
      return;
    }

    if (options.mode !== "dragging" && !options.preserveDirection) {
      faceLastPointer();
    }

    clearAnimationTimer();
    currentAnimation = name;
    currentMode = options.mode || "ambient";
    currentFrameIndex = 0;
    setMotionClass(name);
    setSprite(next.frames[currentFrameIndex]);
    scheduleNextFrame(next);
  }

  function scheduleNextFrame(activeAnimation) {
    const delay = Math.max(50, Math.round(1000 / activeAnimation.fps));

    animationTimer = window.setTimeout(() => {
      currentFrameIndex += 1;

      if (currentFrameIndex >= activeAnimation.frames.length) {
        if (activeAnimation.loop) {
          currentFrameIndex = 0;
        } else {
          currentMode = "ambient";
          chooseAmbientAnimation(true);
          return;
        }
      }

      setSprite(activeAnimation.frames[currentFrameIndex]);
      scheduleNextFrame(activeAnimation);
    }, delay);
  }

  function markUserActivity() {
    state.lastUserActivityAt = Date.now();
    persist();
  }

  function chooseAmbientAnimation(force = false) {
    if (currentMode !== "ambient") {
      return;
    }

    const idleFor = Date.now() - state.lastUserActivityAt;
    const nextAnimation =
      idleFor >= idleTimings.sleepAfterMs
        ? "sleep"
        : idleFor >= idleTimings.boredAfterMs
          ? "bored"
          : "idle";

    playAnimation(nextAnimation, { force, mode: "ambient" });
  }

  function playOneShot(name) {
    if (currentMode === "dragging") {
      return;
    }

    playAnimation(name, { force: true, mode: "oneshot" });
  }

  function handleActivity(activity) {
    if (activity === "spawn") {
      markUserActivity();
      if (activity === "spawn" && !state.hasPlayedIntro) {
        state.hasPlayedIntro = true;
        persist();
        playIntroBounce();
      }

      playOneShot("wave");
      return;
    }

    if (activity === "typing") {
      markUserActivity();

      if (Date.now() - lastTypingReactionAt < idleTimings.typingCooldownMs) {
        chooseAmbientAnimation(true);
        return;
      }

      lastTypingReactionAt = Date.now();
      const reaction = state.nextTypingReaction === "cheering" ? "cheering" : "wow";
      state.nextTypingReaction = reaction === "cheering" ? "wow" : "cheering";
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

  function roomFloorHeight(rect) {
    const floorHeight = Number.parseFloat(
      getComputedStyle(stage).getPropertyValue("--room-floor-height"),
    );

    return Number.isFinite(floorHeight) ? floorHeight : rect.height * 0.28;
  }

  function floorCenterY(rect, petBounds) {
    const floorInset = clamp(
      roomFloorHeight(rect) * gravityFeel.floorInsetRatio,
      gravityFeel.minFloorInsetPx,
      gravityFeel.maxFloorInsetPx,
    );
    const contactY = rect.height - floorInset;
    const centerY = contactY + petBounds.height / 2 - petBounds.height * currentPivotY;

    return clamp(centerY, petBounds.height / 2, rect.height - petBounds.height / 2);
  }

  function pointerPoint(event) {
    return {
      x: event.clientX,
      y: event.clientY,
    };
  }

  function setPositionFromPixels(x, y, rect) {
    state.x = rect.width > 0 ? x / rect.width : state.x;
    state.y = rect.height > 0 ? y / rect.height : state.y;
    applyPosition();
  }

  function resetPosition() {
    cancelGravity();
    window.cancelAnimationFrame(dragRaf);
    dragRaf = undefined;
    drag = null;
    pet.classList.remove("is-dragging");
    currentMode = "ambient";
    state.x = defaultState.x;
    state.y = defaultState.y;
    markUserActivity();
    applyPosition();
    scheduleGravity();
    chooseAmbientAnimation(true);
    postMessage({ type: "interaction", name: "resetPosition" });
  }

  function cancelGravity() {
    window.cancelAnimationFrame(gravityRaf);
    gravityRaf = undefined;
    gravityLastAt = undefined;
    gravityVelocityY = 0;
    shouldPlayLandingReaction = false;
  }

  function scheduleGravity(options = {}) {
    if (drag) {
      return;
    }

    shouldPlayLandingReaction = shouldPlayLandingReaction || Boolean(options.landingReaction);

    if (gravityRaf !== undefined) {
      return;
    }

    gravityLastAt = undefined;
    gravityRaf = window.requestAnimationFrame(updateGravity);
  }

  function updateGravity(timestamp) {
    gravityRaf = undefined;

    if (drag) {
      cancelGravity();
      return;
    }

    const rect = stageRect();
    const petBounds = petRect();
    const currentX = state.x * rect.width;
    const currentY = state.y * rect.height;
    const targetY = floorCenterY(rect, petBounds);

    if (currentY >= targetY - gravityFeel.settleDistancePx) {
      setPositionFromPixels(currentX, targetY, rect);
      persist();
      gravityLastAt = undefined;
      gravityVelocityY = 0;

      if (shouldPlayLandingReaction) {
        shouldPlayLandingReaction = false;
        playAnimation("dropRecovery", { force: true, mode: "oneshot", preserveDirection: true });
        playRandomSound(["dropped1", "dropped2"]);
        postMessage({ type: "interaction", name: "drag" });
      }

      return;
    }

    const deltaMs = Math.min(34, timestamp - (gravityLastAt || timestamp));
    gravityLastAt = timestamp;
    gravityVelocityY = Math.min(
      gravityFeel.maxVelocity,
      gravityVelocityY + gravityFeel.acceleration * Math.max(16, deltaMs),
    );

    const nextY = Math.min(targetY, currentY + gravityVelocityY * Math.max(16, deltaMs));
    setPositionFromPixels(currentX, nextY, rect);
    persist();
    gravityRaf = window.requestAnimationFrame(updateGravity);
  }

  function updateDragPosition() {
    dragRaf = undefined;

    if (!drag) {
      return;
    }

    const rect = stageRect();
    const petBounds = petRect();
    updateDragTarget(rect, petBounds);

    const currentX = state.x * rect.width;
    const currentY = state.y * rect.height;
    const nextX = currentX + (drag.targetX - currentX) * dragFeel.positionLerp;
    const nextY = currentY + (drag.targetY - currentY) * dragFeel.positionLerp;

    setPositionFromPixels(nextX, nextY, rect);
    persist();

    if (
      Math.abs(drag.targetX - nextX) > 0.5 ||
      Math.abs(drag.targetY - nextY) > 0.5 ||
      !isDragAnchorSettled(petBounds)
    ) {
      dragRaf = window.requestAnimationFrame(updateDragPosition);
      return;
    }

    setPositionFromPixels(drag.targetX, drag.targetY, rect);
    persist();
  }

  function updateDragTarget(rect, petBounds) {
    const headOffsetX = petBounds.width * dragFeel.headAnchorX;
    const headOffsetY = petBounds.height * dragFeel.headAnchorY;

    drag.offsetX += (headOffsetX - drag.offsetX) * dragFeel.anchorLerp;
    drag.offsetY += (headOffsetY - drag.offsetY) * dragFeel.anchorLerp;

    const centerX = drag.pointerX - rect.left - drag.offsetX + petBounds.width / 2;
    const centerY = drag.pointerY - rect.top - drag.offsetY + petBounds.height / 2;
    drag.targetX = clamp(centerX, petBounds.width / 2, rect.width - petBounds.width / 2);
    drag.targetY = clamp(centerY, petBounds.height / 2, rect.height - petBounds.height / 2);
  }

  function isDragAnchorSettled(petBounds) {
    return (
      Math.abs(drag.offsetX - petBounds.width * dragFeel.headAnchorX) <= 0.5 &&
      Math.abs(drag.offsetY - petBounds.height * dragFeel.headAnchorY) <= 0.5
    );
  }

  function scheduleDragPositionUpdate() {
    if (dragRaf !== undefined) {
      return;
    }

    dragRaf = window.requestAnimationFrame(updateDragPosition);
  }

  function startDrag(event) {
    event.preventDefault();
    cancelGravity();
    clearHoverBounce();
    rememberPointer(event);
    faceClientX(event.clientX);
    const point = pointerPoint(event);
    const rect = petRect();

    drag = {
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      offsetX: point.x - rect.left,
      offsetY: point.y - rect.top,
      lastX: point.x,
      pointerX: point.x,
      pointerY: point.y,
      targetX: state.x * stageRect().width,
      targetY: state.y * stageRect().height,
      wasBeyondApprehensiveDistance: false,
      moved: false,
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
    const movedDistance = Math.hypot(point.x - drag.startX, point.y - drag.startY);
    const deltaX = point.x - drag.lastX;

    drag.pointerX = point.x;
    drag.pointerY = point.y;
    if (Math.abs(deltaX) > 0.5) {
      setDirection(deltaX > 0 ? "-1" : "1");
    }

    rememberPointer(event);
    drag.lastX = point.x;

    if (!drag.moved && movedDistance > 4) {
      drag.moved = true;
      pet.classList.add("is-dragging");
      playAnimation("dragged", { force: true, mode: "dragging" });
      playSound("startled");
    }

    if (drag.moved) {
      updateDragTarget(rect, petBounds);
      checkApprehensiveDistance(rect);
      scheduleDragPositionUpdate();
    }
  }

  function checkApprehensiveDistance(rect) {
    const centerX = state.x * rect.width;
    const centerY = state.y * rect.height;
    const pointerX = drag.pointerX - rect.left;
    const pointerY = drag.pointerY - rect.top;
    const distance = Math.hypot(pointerX - centerX, pointerY - centerY);
    const isBeyondThreshold = distance > dragFeel.apprehensiveDistancePx;

    if (isBeyondThreshold && !drag.wasBeyondApprehensiveDistance) {
      playNextApprehensiveSound();
    }

    drag.wasBeyondApprehensiveDistance = isBeyondThreshold;
  }

  function endDrag(event) {
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    const moved = drag.moved;
    window.cancelAnimationFrame(dragRaf);
    dragRaf = undefined;
    if (moved) {
      const rect = stageRect();
      const petBounds = petRect();
      const droppedY = clamp(
        drag.targetY + dragFeel.dropOffsetPx,
        petBounds.height / 2,
        rect.height - petBounds.height / 2,
      );
      setPositionFromPixels(drag.targetX, droppedY, rect);
      persist();
    }

    drag = null;
    pet.classList.remove("is-dragging");
    currentMode = "ambient";
    markUserActivity();

    if (moved) {
      scheduleGravity({ landingReaction: true });
      return;
    }

    playOneShot("headpat");
    playSound("happy", { varyPitch: true });
    postMessage({ type: "interaction", name: "headpat" });
  }

  function initialize(configMessage) {
    config = configMessage;
    manifest = configMessage.manifest;
    settings = normalizeSettings(configMessage.settings);
    setupBackground();
    setupSounds();
    document.documentElement.dataset.amberPetVersion = config.extensionVersion;
    setDirection("1");
    setSprite(animation("idle").frames[0]);

    applyPosition();
    scheduleGravity();
    chooseAmbientAnimation(true);
    window.clearInterval(ambientTimer);
    ambientTimer = window.setInterval(() => chooseAmbientAnimation(), 1_000);
  }

  pet.addEventListener("pointerdown", startDrag);
  pet.addEventListener("pointermove", moveDrag);
  pet.addEventListener("pointerup", endDrag);
  pet.addEventListener("pointercancel", endDrag);
  pet.addEventListener("pointerenter", (event) => {
    rememberPointer(event);
    faceClientX(event.clientX);
    playHoverBounce();
  });
  pet.addEventListener("pointerleave", () => {
    isHoverArmed = true;
    clearHoverBounce();
  });
  pet.addEventListener("animationend", (event) => {
    if (event.animationName === "amber-hover-bounce") {
      clearHoverBounce();
      return;
    }

    if (event.animationName === "amber-intro-bounce") {
      pet.classList.remove("is-intro");
    }
  });

  pet.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      markUserActivity();
      playOneShot("headpat");
      playSound("happy", { varyPitch: true });
      postMessage({ type: "interaction", name: "headpat" });
    }
  });

  backgroundControls.addEventListener("click", (event) => {
    if (event.target.closest("[data-sound-toggle]")) {
      toggleSoundMuted();
      return;
    }

    if (event.target.closest("[data-reset-position]")) {
      resetPosition();
      return;
    }

    const button = event.target.closest("[data-background-step]");

    if (!button) {
      return;
    }

    changeBackground(Number(button.dataset.backgroundStep));
  });

  window.addEventListener("resize", () => {
    updateBackgroundForViewport();
    applyPosition();
    scheduleGravity();
    persist();
  });

  window.addEventListener("error", (event) => {
    postMessage({ type: "error", message: event.message });
  });

  window.addEventListener("message", (event) => {
    const message = event.data;

    if (message?.type === "config") {
      initialize(message.config);
      return;
    }

    if (message?.type === "activity") {
      handleActivity(message.activity);
      return;
    }

    if (message?.type === "command" && message.command === "resetPosition") {
      resetPosition();
    }
  });

  applyPosition();
  postMessage({ type: "ready" });
})();
