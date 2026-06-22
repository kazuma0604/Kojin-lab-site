(() => {
  'use strict';

  // ===== Tunable constants (values unchanged from original) =====
  const SCROLL_SHADOW_THRESHOLD = 20;      // px scrolled before header gains "scrolled"
  const REVEAL_TRIGGER_RATIO = 0.88;       // viewport fraction at which elements reveal
  const REVEAL_BOTTOM_MARGIN = -40;        // px slack below viewport for reveal
  const REVEAL_FAILSAFE_MS = 1500;         // force-reveal everything after this delay
  const GLOW_LERP = 0.12;                  // cursor glow easing factor
  const HERO_PARALLAX_X = 30;              // hero glow horizontal parallax range (px)
  const HERO_PARALLAX_Y = 20;              // hero glow vertical parallax range (px)
  const PARTICLE_MAX = 70;                 // hard cap on particle count
  const PARTICLE_AREA_PER = 22000;         // screen area per particle
  const PARTICLE_SPEED = 0.25;             // base velocity factor
  const PARTICLE_R_RANGE = 1.6;            // radius randomness range
  const PARTICLE_R_MIN = 0.6;              // minimum radius
  const LINK_DISTANCE = 130;               // max px distance to draw a connecting line
  const LINK_OPACITY = 0.16;               // base opacity of connecting lines
  const LINE_WIDTH = 0.6;                  // connecting line width factor
  const SPY_LINE_RATIO = 0.35;             // viewport fraction used as scroll-spy line
  const FAB_SHOW_RATIO = 0.6;              // scroll past this fraction of viewport to show FAB
  const CONTACT_VISIBLE_RATIO = 0.85;      // contact section visibility threshold for FAB
  const dpr = window.devicePixelRatio;

  // ===== Header scroll state + scroll progress =====
  const header = document.querySelector('.site-header');
  const progress = document.getElementById('scrollProgress');
  function onScroll(){
    const y = window.scrollY;
    if (header) header.classList.toggle('scrolled', y > SCROLL_SHADOW_THRESHOLD);
    const h = document.documentElement.scrollHeight - window.innerHeight;
    if (progress) progress.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
  }
  window.addEventListener('scroll', onScroll, {passive:true});
  onScroll();

  // ===== Mobile nav =====
  const toggle = document.getElementById('navToggle');
  const nav = document.getElementById('nav');
  if (toggle && nav){
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    }));
  }

  // ===== Reveal on scroll (scroll-driven, reliable) =====
  const reveals = [...document.querySelectorAll('.reveal')];
  function checkReveals(){
    const trigger = window.innerHeight * REVEAL_TRIGGER_RATIO;
    for (const el of reveals){
      if (el.classList.contains('in')) continue;
      const r = el.getBoundingClientRect();
      if (r.top < trigger && r.bottom > REVEAL_BOTTOM_MARGIN){
        el.classList.add('in');
      }
    }
  }
  window.addEventListener('scroll', checkReveals, {passive:true});
  window.addEventListener('resize', checkReveals, {passive:true});
  checkReveals();
  // failsafe: 何があっても1.5秒で全表示（不可視のまま残さない）
  setTimeout(() => reveals.forEach(el => el.classList.add('in')), REVEAL_FAILSAFE_MS);

  // ===== Cursor glow (desktop only) =====
  const glow = document.getElementById('cursorGlow');
  if (glow && window.matchMedia('(pointer:fine)').matches){
    let gx = window.innerWidth/2, gy = window.innerHeight/2, cx = gx, cy = gy;
    window.addEventListener('mousemove', e => { gx = e.clientX; gy = e.clientY; glow.style.opacity = '1'; });
    (function loop(){
      cx += (gx - cx) * GLOW_LERP; cy += (gy - cy) * GLOW_LERP;
      glow.style.transform = `translate(${cx}px,${cy}px) translate(-50%,-50%)`;
      window.requestAnimationFrame(loop);
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
    const dx = (e.clientX / window.innerWidth - 0.5);
    const dy = (e.clientY / window.innerHeight - 0.5);
    if (heroGlow) heroGlow.style.transform = `translateX(-50%) translate(${dx*HERO_PARALLAX_X}px,${dy*HERO_PARALLAX_Y}px)`;
  });

  // ===== Scroll-spy: highlight current section in nav (scroll-driven) =====
  const navLinks = [...document.querySelectorAll('.nav a[href^="#"]')];
  const spyMap = navLinks
    .map(a => ({ link: a, sec: document.querySelector(a.getAttribute('href')) }))
    .filter(o => o.sec);
  function updateSpy(){
    const line = window.innerHeight * SPY_LINE_RATIO;
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
    if (!fab) return;
    const past = window.scrollY > window.innerHeight * FAB_SHOW_RATIO;
    const r = contactSec ? contactSec.getBoundingClientRect() : null;
    const contactVisible = r ? (r.top < window.innerHeight * CONTACT_VISIBLE_RATIO && r.bottom > 0) : false;
    const navOpen = nav ? nav.classList.contains('open') : false;
    fab.classList.toggle('show', past && !contactVisible && !navOpen);
  }
  window.addEventListener('scroll', toggleFab, {passive:true});
  toggleFab();

  // ===== Animated particle network background =====
  const canvas = document.getElementById('bg-canvas');
  if (canvas){
    const ctx = canvas.getContext('2d');
    let W, H;
    const particles = [];
    const COUNT = Math.min(PARTICLE_MAX, Math.floor((window.innerWidth * window.innerHeight) / PARTICLE_AREA_PER));
    function resize(){
      W = canvas.width = window.innerWidth * dpr;
      H = canvas.height = window.innerHeight * dpr;
      canvas.style.width = window.innerWidth + 'px';
      canvas.style.height = window.innerHeight + 'px';
    }
    resize();
    window.addEventListener('resize', resize);
    for (let i = 0; i < COUNT; i++){
      particles.push({
        x: Math.random() * W, y: Math.random() * H,
        vx: (Math.random() - 0.5) * PARTICLE_SPEED * dpr,
        vy: (Math.random() - 0.5) * PARTICLE_SPEED * dpr,
        r: (Math.random() * PARTICLE_R_RANGE + PARTICLE_R_MIN) * dpr
      });
    }
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
          const max = LINK_DISTANCE * dpr;
          if (d < max){
            ctx.beginPath();
            ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y);
            ctx.strokeStyle = `rgba(99,102,241,${LINK_OPACITY * (1 - d / max)})`;
            ctx.lineWidth = dpr * LINE_WIDTH;
            ctx.stroke();
          }
        }
      }
      if (!reduce) window.requestAnimationFrame(draw);
    }
    draw();
  }
})();
