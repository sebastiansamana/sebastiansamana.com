(() => {
  const runtime = (window.__varelismHomeColumnInteractions ||= {
    listenersAttached: false,
    timers: new WeakMap(),
  });

  const triggerSelector = '.triptych-link, .column-hitbox';
  const activeClasses = ['is-column-hovering', 'is-column-pressing', 'is-column-navigating'];

  const getItem = (target) => target?.closest?.('.triptych-item') || null;

  const getTimers = (item) => {
    let timers = runtime.timers.get(item);

    if (!timers) {
      timers = new Map();
      runtime.timers.set(item, timers);
    }

    return timers;
  };

  const clearTimer = (item, className = '') => {
    const timers = runtime.timers.get(item);
    if (!timers) return;

    if (className) {
      const timer = timers.get(className);
      if (timer) window.clearTimeout(timer);
      timers.delete(className);
    } else {
      timers.forEach((timer) => window.clearTimeout(timer));
      timers.clear();
    }

    if (!timers.size) runtime.timers.delete(item);
  };

  const clearItem = (item, className, delay = 0) => {
    if (!item) return;
    clearTimer(item, className);

    if (delay <= 0) {
      item.classList.remove(className);
      return;
    }

    getTimers(item).set(
      className,
      window.setTimeout(() => {
        item.classList.remove(className);
        clearTimer(item, className);
      }, delay),
    );
  };

  const activateItem = (item, className) => {
    if (!item) return;
    clearTimer(item, className);

    document.querySelectorAll('.triptych-item').forEach((candidate) => {
      if (candidate === item) return;
      clearTimer(candidate);
      activeClasses.forEach((activeClass) => candidate.classList.remove(activeClass));
    });

    item.classList.add(className);
  };

  const onPointerEnter = (event) => {
    if (!event.target?.closest?.(triggerSelector)) return;
    activateItem(getItem(event.target), 'is-column-hovering');
  };

  const onPointerLeave = (event) => {
    if (!event.target?.closest?.(triggerSelector)) return;
    clearItem(getItem(event.target), 'is-column-hovering', 140);
  };

  const onPointerDown = (event) => {
    if (!event.target?.closest?.(triggerSelector)) return;
    activateItem(getItem(event.target), 'is-column-pressing');
  };

  const onPointerUp = (event) => {
    if (!event.target?.closest?.(triggerSelector)) return;
    clearItem(getItem(event.target), 'is-column-pressing', 260);
  };

  const onClick = (event) => {
    const trigger = event.target?.closest?.(triggerSelector);
    if (!trigger) return;

    const item = getItem(trigger);
    activateItem(item, 'is-column-navigating');
    clearItem(item, 'is-column-navigating', 1400);
  };

  const clearAll = () => {
    document.querySelectorAll('.triptych-item').forEach((item) => {
      clearTimer(item);
      activeClasses.forEach((className) => item.classList.remove(className));
    });
  };

  if (!runtime.listenersAttached) {
    document.addEventListener('pointerenter', onPointerEnter, true);
    document.addEventListener('pointerleave', onPointerLeave, true);
    document.addEventListener('pointerdown', onPointerDown, { passive: true });
    document.addEventListener('pointerup', onPointerUp, { passive: true });
    document.addEventListener('pointercancel', onPointerUp, { passive: true });
    document.addEventListener('click', onClick, true);
    document.addEventListener('astro:before-swap', clearAll);
    window.addEventListener('pageshow', clearAll);
    runtime.listenersAttached = true;
  }
})();
