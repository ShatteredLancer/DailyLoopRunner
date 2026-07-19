export function triggerRewardFireworks(container, intensityValue, runtime = {}) {
  if (!container || !runtime.dom?.create || typeof runtime.requestFrame !== 'function') return;
  if (runtime.getComputedStyle?.(container)?.position === 'static') container.style.position = 'relative';
  container.style.isolation = 'isolate';

  const canvas = runtime.dom.create('canvas');
  canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:35%;pointer-events:none;z-index:-1;overflow:hidden;';
  container.insertBefore(canvas, container.firstChild);
  const width = Math.max(220, canvas.clientWidth);
  const height = Math.max(120, canvas.clientHeight);
  const dpr = Math.min(2, Number(runtime.devicePixelRatio?.() || 1));
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const context = canvas.getContext?.('2d');
  if (!context) {
    canvas.remove();
    return;
  }
  context.scale(dpr, dpr);

  const palette = ['#ffd54a', '#ff5c5c', '#5c8aff', '#5cffa0', '#7a5cff', '#ff9d4a', '#ff5cb1', '#5ce0ff'];
  const random = runtime.random || Math.random;
  const intensity = Math.max(1, Math.min(6, Number(intensityValue) || 1));
  const particlesPerBurst = 70 + intensity * 14;
  const particles = [];
  const burstSchedule = [80, 700, 1400];
  const columns = [0.22, 0.5, 0.78];
  const startMs = runtime.now?.() || 0;
  let lastBurstIndex = -1;

  function spawnBurst(x, y) {
    particles.push({ x, y, life: 1, decay: 0.05, color: '#fff', size: 14 + random() * 6, isFlash: true });
    for (let index = 0; index < particlesPerBurst; index++) {
      const angle = (index / particlesPerBurst) * Math.PI * 2 + (random() - 0.5) * 0.5;
      const speed = 1.5 + random() * 3.5;
      particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1.8,
        color: palette[Math.floor(random() * palette.length)],
        life: 1,
        decay: 0.006 + random() * 0.012,
        size: 0.9 + random() * 1.4,
      });
    }
  }

  function tick(now) {
    const elapsed = now - startMs;
    if (elapsed > 3000 || !canvas.isConnected) {
      canvas.remove();
      return;
    }
    for (let burst = lastBurstIndex + 1; burst < burstSchedule.length; burst++) {
      if (elapsed < burstSchedule[burst]) break;
      spawnBurst(width * columns[burst] + (random() - 0.5) * 30, height * (0.18 + random() * 0.12));
      lastBurstIndex = burst;
    }

    context.fillStyle = 'rgba(0, 0, 0, 0.18)';
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'lighter';
    for (let index = particles.length - 1; index >= 0; index--) {
      const particle = particles[index];
      particle.vy = Number(particle.vy || 0) + 0.06;
      particle.vx = Number(particle.vx || 0) * 0.985;
      particle.vy *= 0.985;
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.life -= particle.decay;
      if (particle.life <= 0 || particle.y > height + 30 || particle.x < -30 || particle.x > width + 30) {
        particles.splice(index, 1);
        continue;
      }
      context.shadowColor = particle.color;
      context.shadowBlur = particle.isFlash ? 18 : 9;
      context.fillStyle = particle.color;
      context.globalAlpha = Math.max(0, Math.min(1, particle.life));
      context.beginPath();
      context.arc(particle.x, particle.y, particle.isFlash ? particle.size * (1 + (1 - particle.life) * 0.6) : particle.size, 0, Math.PI * 2);
      context.fill();
    }
    context.shadowBlur = 0;
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    runtime.requestFrame(tick);
  }
  runtime.requestFrame(tick);
}
