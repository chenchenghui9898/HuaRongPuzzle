/**
 * Confetti — Canvas-based victory particle animation.
 * No external dependencies.
 */
window.Confetti = (function () {
  let canvas = null;
  let ctx = null;
  let particles = [];
  let animId = null;
  let running = false;

  const COLORS = [
    '#f5576c', '#f093fb', '#ffd452', '#52d4ff',
    '#52ff8f', '#ff8a52', '#a678f5', '#ff52a8',
    '#f5d742', '#42d7f5', '#42f5a1', '#f5427b',
  ];

  function init(canvasEl) {
    canvas = canvasEl;
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function resize() {
    if (canvas) {
      // Use document.documentElement to avoid iOS Safari innerWidth/scrollbar issues
      canvas.width = document.documentElement.clientWidth || window.innerWidth;
      canvas.height = document.documentElement.clientHeight || window.innerHeight;
    }
  }

  function start() {
    if (!canvas || !ctx) return;
    stop();
    resize();
    particles = createParticles(150);
    running = true;
    loop();
  }

  function stop() {
    running = false;
    if (animId) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    particles = [];
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  function createParticles(count) {
    const arr = [];
    for (let i = 0; i < count; i++) {
      arr.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height * -0.5, // start above viewport
        w: Math.random() * 10 + 5,
        h: Math.random() * 7 + 3,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        vx: (Math.random() - 0.5) * 4,
        vy: Math.random() * 3 + 2,
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 10,
        opacity: 1,
        decay: Math.random() * 0.006 + 0.003,
      });
    }
    return arr;
  }

  function loop() {
    if (!running) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    let alive = false;
    for (const p of particles) {
      if (p.opacity <= 0) continue;
      alive = true;

      p.x += p.vx;
      p.vy += 0.1; // gravity
      p.y += p.vy;
      p.rotation += p.rotSpeed;
      p.opacity -= p.decay;

      ctx.save();
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
      ctx.rotate((p.rotation * Math.PI) / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }

    if (alive) {
      animId = requestAnimationFrame(loop);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      running = false;
    }
  }

  return { init, start, stop };
})();
