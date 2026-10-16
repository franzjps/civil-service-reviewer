export function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Remaining time is always derived from the stored deadline, so it cannot drift.
export function createTimer({ deadline, onTick, onExpire }) {
  let handle = null;
  let expired = false;

  function tick() {
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      if (!expired) {
        expired = true;
        stop();
        onTick(0);
        onExpire();
      }
      return;
    }
    onTick(remaining);
  }

  function stop() {
    if (handle !== null) { clearInterval(handle); handle = null; }
  }

  tick();
  if (!expired) handle = setInterval(tick, 250);
  return { stop };
}
