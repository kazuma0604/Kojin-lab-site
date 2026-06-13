// ===== Header scroll state + scroll progress =====
const header = document.querySelector('.site-header');
const progress = document.getElementById('scrollProgress');
function onScroll(){
  const y = window.scrollY;
  header.classList.toggle('scrolled', y > 20);
  const h = document.documentElement.scrollHeight - window.innerHeight;
  progress.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
}
window.addEventListener('scroll', onScroll, {passive:true});
onScroll();

// ===== Mobile nav =====
const toggle = document.getElementById('navToggle');
const nav = document.getElementById('nav');
toggle.addEventListener('click', () => {
  nav.classList.toggle('open');
  toggle.classList.toggle('open');
});
nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
  nav.classList.remove('open');
  toggle.classList.remove('open');
}));

// ===== Reveal on scroll (scroll-driven, reliable) =====
const reveals = [...document.querySelectorAll('.reveal')];
function checkReveals(){
  const trigger = window.innerHeight * 0.88;
  for (const el of reveals){
    if (el.classList.contains('in')) continue;
    const r = el.getBoundingClientRect();
    if (r.top < trigger && r.bottom > -40){
      el.classList.add('in');
      const num = el.querySelector && el.querySelector('.num[data-count]');
      if (num) countUp(el);
    }
  }
}
window.addEventListener('scroll', checkReveals, {passive:true});
window.addEventListener('resize', checkReveals, {passive:true});
checkReveals();
// failsafe: 何があっても1.5秒で全表示（不可視のまま残さない）
setTimeout(() => reveals.forEach(el => el.classList.add('in')), 1500);

// ===== Count-up numbers =====
function countUp(scope){
  scope.querySelectorAll('.num[data-count]').forEach(el => {
    const target = parseInt(el.dataset.count, 10);
    const dur = 900; const t0 = performance.now();
    function tick(now){
      const p = Math.min((now - t0) / dur, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(eased * target);
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

// ===== Cursor glow (desktop only) =====
const glow = document.getElementById('cursorGlow');
if (window.matchMedia('(pointer:fine)').matches){
  let gx = innerWidth/2, gy = innerHeight/2, cx = gx, cy = gy;
  window.addEventListener('mousemove', e => { gx = e.clientX; gy = e.clientY; glow.style.opacity = '1'; });
  (function loop(){
    cx += (gx - cx) * 0.12; cy += (gy - cy) * 0.12;
    glow.style.transform = `translate(${cx}px,${cy}px) translate(-50%,-50%)`;
    requestAnimationFrame(loop);
  })();
}

// ===== Card spotlight (mouse-follow gradient) =====
document.querySelectorAll('.card').forEach(card => {
  card.addEventListener('mousemove', e => {
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
    card.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100) + '%');
  });
});

// ===== Hero glow parallax =====
const heroGlow = document.querySelector('.hero-glow');
window.addEventListener('mousemove', e => {
  const dx = (e.clientX / innerWidth - 0.5);
  const dy = (e.clientY / innerHeight - 0.5);
  if (heroGlow) heroGlow.style.transform = `translateX(-50%) translate(${dx*30}px,${dy*20}px)`;
});

// ===== Animated particle network background =====
const canvas = document.getElementById('bg-canvas');
const ctx = canvas.getContext('2d');
let W, H, particles = [];
const COUNT = Math.min(70, Math.floor((innerWidth * innerHeight) / 22000));
function resize(){
  W = canvas.width = innerWidth * devicePixelRatio;
  H = canvas.height = innerHeight * devicePixelRatio;
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
}
resize();
window.addEventListener('resize', resize);
for (let i = 0; i < COUNT; i++){
  particles.push({
    x: Math.random() * W, y: Math.random() * H,
    vx: (Math.random() - 0.5) * 0.25 * devicePixelRatio,
    vy: (Math.random() - 0.5) * 0.25 * devicePixelRatio,
    r: (Math.random() * 1.6 + 0.6) * devicePixelRatio
  });
}
// ===== Scroll-spy: highlight current section in nav (scroll-driven) =====
const navLinks = [...document.querySelectorAll('.nav a[href^="#"]')];
const spyMap = navLinks
  .map(a => ({ link: a, sec: document.querySelector(a.getAttribute('href')) }))
  .filter(o => o.sec);
function updateSpy(){
  const line = window.innerHeight * 0.35;
  let current = null;
  for (const o of spyMap){
    const r = o.sec.getBoundingClientRect();
    if (r.top <= line && r.bottom > line) current = o.link;
  }
  navLinks.forEach(a => a.classList.toggle('active', a === current));
}
window.addEventListener('scroll', updateSpy, {passive:true});
updateSpy();

// ===== Floating CTA: show after hero, hide on contact / when menu open =====
const fab = document.getElementById('fab');
const contactSec = document.getElementById('contact');
function toggleFab(){
  const past = window.scrollY > window.innerHeight * 0.6;
  const r = contactSec.getBoundingClientRect();
  const contactVisible = r.top < window.innerHeight * 0.85 && r.bottom > 0;
  fab.classList.toggle('show', past && !contactVisible && !nav.classList.contains('open'));
}
window.addEventListener('scroll', toggleFab, {passive:true});
toggleFab();

const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
function draw(){
  ctx.clearRect(0, 0, W, H);
  for (let i = 0; i < particles.length; i++){
    const p = particles[i];
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0 || p.x > W) p.vx *= -1;
    if (p.y < 0 || p.y > H) p.vy *= -1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56,189,248,.55)';
    ctx.fill();
    for (let j = i + 1; j < particles.length; j++){
      const q = particles[j];
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      const max = 130 * devicePixelRatio;
      if (d < max){
        ctx.beginPath();
        ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
        ctx.strokeStyle = `rgba(99,102,241,${0.16 * (1 - d / max)})`;
        ctx.lineWidth = devicePixelRatio * 0.6;
        ctx.stroke();
      }
    }
  }
  if (!reduce) requestAnimationFrame(draw);
}
draw();
