import * as THREE from '../vendor/three.module.min.js';

/* ============================================================================
   تِرا ۲ — بوم هولوگرافیک
   توپوگرافی سیمی چندلایه + ذرات درخشان + بلوم واقعی + شیشه‌ی گلاسمورفیسم
   همه‌چیز لوکال. بدون WebGL → نسخه‌ی متنی بی‌سروصدا.
   ========================================================================== */

const canvas = document.getElementById('scene');
const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

/* بازخورد پیمایش با صفحه‌کلید. صحنه آرام می‌چرخد و برای کاربر کور این یعنی
   «هیچی». این تابع هم متن قابل‌خواندن را در ناحیه‌ی زنده می‌گذارد و هم
   مختصات را در تله‌متری نشان می‌دهد تا تغییر دیده شود.
   x و y در بازه‌ی -1..1 هستند (همان بازه‌ای که ماوس تولید می‌کند). */
let lastKeyMsg = '';
function announceKeys(x, y) {
  const deg = (n) => Math.round((n + 1) / 2 * 180) - 90;      // -1..1 ⇒ -90..+90
  const msg = `چرخش هولوگرام: افقی ${deg(x)} درجه، عمودی ${deg(y)} درجه`;
  if (msg === lastKeyMsg) return;
  lastKeyMsg = msg;
  const live = document.getElementById('kbd-live');
  if (live) live.textContent = msg;
  set('t-orbit', `${deg(x)}°`);
}

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) { return false; }
}

/* ============================================================================
   راند ۱ — بودجه‌ی رندر تطبیقی
   سه کیفیت تعریف می‌شود و اگر fps واقعی زیر آستانه بیفتد، خودکار یک پله پایین می‌آید.
   هدف: هیچ‌وقت نباید به تجربه‌ی لگ‌دار ختم شود، بدون آنکه کاربر چیزی تنظیم کند.
   ========================================================================== */
const TIERS = {
  ultra: { dpr: 1.6,  fps: 45, segMul: 1.00, particles: 1600, mobius: 160, bloom: true,  scan: true },
  high:  { dpr: 1.25, fps: 38, segMul: 0.85, particles: 1000, mobius: 130, bloom: true,  scan: true },
  eco:   { dpr: 1.0,  fps: 30, segMul: 0.60, particles: 450,  mobius: 90,  bloom: false, scan: false }
};
const TIER_ORDER = ['ultra', 'high', 'eco'];

/* انتخاب اولیه: قبل از اولین فریم فقط حدس می‌زنیم */
function initialTier() {
  const mobile = window.matchMedia('(max-width: 768px)').matches;
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 4;
  if (mobile || cores <= 4 || mem <= 4) return 'high';
  return 'ultra';
}

if (hasWebGL()) { try { boot(); } catch (err) { degrade(err); } }
else degrade(new Error('WebGL unavailable'));

/* راند ۶ — مسیر شکست محترمانه
   اگر حتی با وجود WebGL چیزی در ساخت صحنه ترک بخورد (کنسول پر از لاگ قرمز و صفحه‌ی سیاه)،
   سایت باید مثل بقیه‌ی بخش‌هایش قابل استفاده بماند. یعنی متن، دکمه‌ها و لینک‌ها سالم بمانند. */
function degrade(err) {
  console.warn('[ATLAS] fallback:', err && err.message);
  const fx = document.getElementById('scene');      // بوم سه‌بعدی را برمی‌داریم
  if (fx) fx.remove();
  document.documentElement.classList.add('no-webgl');
  set('status', 'بدون WebGL');
  set('fps', '--');
  set('t-mode', 'حالت متنی');
  const hint = document.getElementById('webgl-hint');
  if (hint) hint.classList.remove('hidden');
}

function boot() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let tierName = initialTier();
  let tier = TIERS[tierName];

  /* ---------- رندرر ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, tier.dpr));
  renderer.setSize(innerWidth, innerHeight, false);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.25;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x03060f, 0.0082);

  const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.1, 800);
  camera.position.set(0, 26, 118);

  /* ---------- گروه صحنه ---------- */
  const world = new THREE.Group();
  world.position.y = -12;
  scene.add(world);

  /* =========================================================
     ۱) توپوگرافی: ۵ لایه شبکه‌ی سیمی که روی هم می‌شوند
     ========================================================= */
  function buildLayers() {
    const eco = !tier.bloom;
    const base = [
      { z: -70, amp: 26, freq: 0.0055, col: 0x0a2a4a, op: 0.30, seg: 220 },
      { z: -26, amp: 20, freq: 0.0082, col: 0x0d4a72, op: 0.42, seg: 200 },
      { z:  14, amp: 15, freq: 0.0125, col: 0x1177aa, op: 0.55, seg: 190 },
      { z:  54, amp: 10, freq: 0.0190, col: 0x18b8e0, op: 0.70, seg: 180 },
      { z:  92, amp:  6, freq: 0.0270, col: 0x2ee6ff, op: 0.85, seg: 160 },
    ];
    if (eco) base.pop();                       // لایه نزدیک در eco حذف می‌شود
    return base.map((L) => ({ ...L, seg: Math.max(64, Math.round(L.seg * tier.segMul)) }));
  }
  const LAYERS = buildLayers();

  function terrainY(x, z, L) {
    // چند موج ضرب‌درهم با دانه‌ی متفاوت → قله و دره‌ی غیرتکراری
    let h = Math.sin(x * L.freq + z * L.freq * 0.42) * 0.60;
    h += Math.sin(x * L.freq * 2.17 - z * L.freq * 0.83) * 0.26;
    h += Math.sin((x + z) * L.freq * 3.91) * 0.12;
    h += Math.sin(x * L.freq * 7.13 + z * L.freq * 1.9) * 0.05;
    // تیزکردن قله‌ها
    return Math.sign(h) * Math.pow(Math.abs(h), 0.78) * L.amp;
  }

  /* راند ۱: ساخت لایه را از حلقه‌ی مقداردهی جدا کردیم تا تنزل کیفیت بتواند دوباره بسازد */
  function makeTerrainLayer(L) {
    const verts = [];
    const idx = [];
    const HALF = 340;
    const N = L.seg;
    const STEP = (HALF * 2) / N;

    for (let axis = 0; axis < 2; axis++) {
      for (let i = 0; i <= N; i++) {
        const t = -HALF + i * STEP;
        for (let j = 0; j < 2; j++) {
          const u = -HALF + j * HALF * 2;
          const x = axis === 0 ? t : u;
          const z = axis === 0 ? u : t;
          verts.push(x, terrainY(x, z, L), z);
        }
      }
      const base = axis * (N + 1) * 2;
      for (let i = 0; i < N; i++) {
        const a = base + i * 2;
        idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3);
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uColor: { value: new THREE.Color(L.col) },
        uOpacity: { value: L.op },
        uTime: { value: 0 },
        uPeak: { value: terrainY(0, 0, L) / (L.amp || 1) }
      },
      vertexShader: `
        uniform float uTime;
        varying float vH;
        void main() {
          vH = position.y;
          vec3 p = position;
          // تپش آرام مثل اسکانر هولوگرافیک
          p.y += sin(p.x * 0.05 + uTime * 1.2) * 0.35;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uTime;
        uniform float uPeak;
        varying float vH;
        void main() {
          // خط اسکنی که از روی سطح عبور می‌کند
          float scan = smoothstep(0.06, 0.0, abs(fract(vH * 0.06 - uTime * 0.25) - 0.5) - 0.42);
          vec3 c = uColor * (1.0 + scan * 1.8);
          gl_FragColor = vec4(c, uOpacity + scan * 0.35);
        }
      `
    });

    const mesh = new THREE.LineSegments(geo, mat);
    mesh.position.z = L.z;
    mesh.frustumCulled = false;
    return mesh;
  }

  const layerMeshes = [];
  LAYERS.forEach((L) => {
    const mesh = makeTerrainLayer(L);
    world.add(mesh);
    layerMeshes.push(mesh);
  });

  /* =========================================================
     ۲) موبیوس — نواری که از صفحه بیرون می‌پیچد
     ========================================================= */
  function mobiusPoints(segments, rings, R, width) {
    const pos = [];
    for (let i = 0; i < segments; i++) {
      for (let j = 0; j < rings; j++) {
        const u = (i / segments) * Math.PI * 2;
        const v = (j / rings - 0.5) * width;
        // فرمول کلاسیک موبیوس
        const x = (R + v * Math.cos(u / 2)) * Math.cos(u);
        const y = v * Math.sin(u / 2);
        const z = (R + v * Math.cos(u / 2)) * Math.sin(u);
        pos.push(x, y, z);
      }
    }
    return pos;
  }

  const mobSeg = tier.mobius;
  const mobRings = 3;
  const mobPos = mobiusPoints(mobSeg, mobRings, 60, 26);
  const mobIdx = [];
  for (let i = 0; i < mobSeg; i++) {
    const a = i * mobRings, b = ((i + 1) % mobSeg) * mobRings;
    for (let j = 0; j < mobRings - 1; j++) {
      mobIdx.push(a + j, a + j + 1, b + j, b + j, a + j + 1, b + j + 1);
    }
  }
  const mobGeo = new THREE.BufferGeometry();
  mobGeo.setAttribute('position', new THREE.Float32BufferAttribute(mobPos, 3));
  mobGeo.setIndex(mobIdx);
  const mobMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color(0x00e5ff) }, uB: { value: new THREE.Color(0x7c5cff) } },
    vertexShader: `uniform float uTime; varying float vU;
      void main(){ vU = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uTime; uniform vec3 uA; uniform vec3 uB; varying float vU;
      void main(){
        float g = 0.5 + 0.5 * sin(vU * 12.0 - uTime * 1.6);
        vec3 c = mix(uA, uB, g);
        gl_FragColor = vec4(c, 0.28 + g * 0.35);
      }`
  });
  // uvw لازم است برای vU
  const mobUv = [];
  for (let i = 0; i < mobSeg; i++) for (let j = 0; j < mobRings; j++) mobUv.push(i / mobSeg, j / (mobRings - 1));
  mobGeo.setAttribute('uv', new THREE.Float32BufferAttribute(mobUv, 2));
  const mobius = new THREE.Mesh(mobGeo, mobMat);
  mobius.position.set(150, 22, -40);
  mobius.rotation.set(0.6, 0, 0.35);
  world.add(mobius);

  /* =========================================================
     ۳) ذرات درخشان
     ========================================================= */
  const dust = (() => {
    const n = tier.particles;
    const g = new THREE.BufferGeometry();
    const p = new Float32Array(n * 3);
    const c = new Float32Array(n * 3);
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      p[i * 3] = (Math.random() - 0.5) * 900;
      p[i * 3 + 1] = (Math.random() - 0.35) * 220;
      p[i * 3 + 2] = -150 + Math.random() * 420;
      col.setHSL(0.5 + Math.random() * 0.12, 0.9, 0.6);
      c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return new THREE.Points(g, new THREE.PointsMaterial({
      size: tier.bloom ? 1.6 : 1.2, vertexColors: true, transparent: true,
      opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    }));
  })();
  const dustGeometry = dust.geometry;
  world.add(dust);

  /* =========================================================
     ۴) بلوم واقعی (UnrealBloomPass) — بدون کتابخانه‌ی جانبی
     پیاده‌سازی دستی: پس‌پردازش با چند پاس فید
     ========================================================= */
  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
    type: THREE.HalfFloatType, samples: 0
  });
  const scene2 = new THREE.Scene();
  const quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadGeo = new THREE.PlaneGeometry(2, 2);

  // پاس ۱: استخراج روشنایی‌ها
  const brightMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: rt.texture }, uThresh: { value: 0.55 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform float uThresh; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float k = smoothstep(uThresh, uThresh + 0.35, l);
        gl_FragColor = vec4(c * k, 1.0);
      }`
  });
  // پاس ۲: بلور جداگانه افقی/عمودی
  const blurMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(1, 0) }, uTexel: { value: new THREE.Vector2() } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
    fragmentShader: `
      uniform sampler2D tDiffuse; uniform vec2 uDir; uniform vec2 uTexel; varying vec2 vUv;
      void main(){
        vec2 o = uDir * uTexel;
        vec3 s = texture2D(tDiffuse, vUv).rgb * 0.2270270270;
        s += texture2D(tDiffuse, vUv + o * 1.3846153846).rgb * 0.3162162162;
        s += texture2D(tDiffuse, vUv - o * 1.3846153846).rgb * 0.3162162162;
        s += texture2D(tDiffuse, vUv + o * 3.2307692308).rgb * 0.0702702703;
        s += texture2D(tDiffuse, vUv - o * 3.2307692308).rgb * 0.0702702703;
        gl_FragColor = vec4(s, 1.0);
      }`
  });
  const compMat = new THREE.ShaderMaterial({
    uniforms: { tBase: { value: null }, tBloom: { value: null }, uStrength: { value: 1.15 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }`,
    fragmentShader: `
      uniform sampler2D tBase; uniform sampler2D tBloom; uniform float uStrength; varying vec2 vUv;
      void main(){
        vec3 base = texture2D(tBase, vUv).rgb;
        vec3 bloom = texture2D(tBloom, vUv).rgb;
        gl_FragColor = vec4(base + bloom * uStrength, 1.0);
      }`
  });

  const brightRT = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType });
  const blurA = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType });
  const blurB = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType });

  const brightQuad = new THREE.Mesh(quadGeo, brightMat); scene2.add(brightQuad);
  const blurQuad = new THREE.Mesh(quadGeo, blurMat); scene2.add(blurQuad);
  const compQuad = new THREE.Mesh(quadGeo, compMat); scene2.add(compQuad);

  const texel = new THREE.Vector2(1 / innerWidth, 1 / innerHeight);
  blurMat.uniforms.uTexel.value.copy(texel);
  const BLOOM_SCALE = 0.5;                       // نصف اندازه = ارزان‌تر
  blurMat.uniforms.uTexel.value.set(1 / (innerWidth * BLOOM_SCALE), 1 / (innerHeight * BLOOM_SCALE));

  function composite() {
    /* راند ۲ — مسیر ارزان: وقتی بلوم خاموش است، فقط یک رندر مستقیم.
       قبلاً حتی در eco چهار پاس فید اجرا می‌شد؛ حالا در همان فریم صفر هزینه‌ی اضافه دارد. */
    if (!tier.bloom) {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      return;
    }
    // ۱) رندر صحنه به rt
    renderer.setRenderTarget(rt);
    renderer.clear();
    renderer.render(scene, camera);

    // ۲) استخراج روشنایی
    brightMat.uniforms.tDiffuse.value = rt.texture;
    brightQuad.material = brightMat;
    renderer.setRenderTarget(brightRT);
    renderer.render(scene2, quadCam);

    // ۳) بلور افقی
    blurMat.uniforms.tDiffuse.value = brightRT.texture;
    blurMat.uniforms.uDir.value.set(1, 0);
    blurQuad.material = blurMat;
    renderer.setRenderTarget(blurA);
    renderer.render(scene2, quadCam);

    // ۴) بلور عمودی
    blurMat.uniforms.tDiffuse.value = blurA.texture;
    blurMat.uniforms.uDir.value.set(0, 1);
    renderer.setRenderTarget(blurB);
    renderer.render(scene2, quadCam);

    // ۵) ترکیب به صفحه
    compMat.uniforms.tBase.value = rt.texture;
    compMat.uniforms.tBloom.value = blurB.texture;
    compQuad.material = compMat;
    renderer.setRenderTarget(null);
    renderer.render(scene2, quadCam);
  }

  /* =========================================================
     ۵) تعامل
     ========================================================= */
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  if (!reduced) {
    addEventListener('pointermove', (e) => {
      ptr.tx = (e.clientX / innerWidth - 0.5) * 2;
      ptr.ty = (e.clientY / innerHeight - 0.5) * 2;
    }, { passive: true });
  }
  let scrollY = 0;
  addEventListener('scroll', () => { scrollY = window.scrollY; }, { passive: true });

  /* راند ۳ — resize هوشمند
     ۱) روی موبایل، اسکرول صفحه (URL bar) ارتفاع را مدام عوض می‌کند؛ آن‌وقت
        بازسازی ۵ رندر تارگت در هر تغییر، قاتل فریم است.
     ۲) اگر فقط چند پیکسل فرق کرده، اصلاً کاری نمی‌کنیم. */
  let lastW = innerWidth, lastH = innerHeight, resizeTimer = 0;
  function doResize(force) {
    const w = innerWidth, h = innerHeight;
    if (!force && w === lastW && h === lastH) return;    // راند ۳: تغییر چندپیکسلی = بی‌کار
    lastW = w; lastH = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    if (tier.bloom) {                                   // تارگت‌های بلوم فقط وقتی لازم‌اند
      rt.setSize(w, h); brightRT.setSize(w, h);
      blurA.setSize(Math.round(w * BLOOM_SCALE), Math.round(h * BLOOM_SCALE));
      blurB.setSize(Math.round(w * BLOOM_SCALE), Math.round(h * BLOOM_SCALE));
      blurMat.uniforms.uTexel.value.set(1 / (w * BLOOM_SCALE), 1 / (h * BLOOM_SCALE));
    }
    set('res', `${w}×${h}`);
  }
  function onResize() {                                  // هر ۱۲۰ms بیشتر نه
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(doResize, 120);
  }
  addEventListener('resize', onResize, { passive: true });
  addEventListener('orientationchange', onResize, { passive: true });
  doResize();

  /* ---------- HUD ---------- */
  set('status', 'برخط');
  set('mode', tierName.toUpperCase());
  set('segments', String(LAYERS.reduce((a, L) => a + L.seg, 0)));
  set('res', `${innerWidth}×${innerHeight}`);
  set('layers', String(LAYERS.length));
  set('particles', String(dustGeometry ? dustGeometry.attributes.position.count : 0));
  set('t-fps-cap', String(tier.fps));
  set('t-dpr', devicePixelRatio.toFixed(2).replace(/\.?0+$/, '') || '1');

  /* ---------- حلقه ---------- */
  let FRAME = 1000 / tier.fps;
  let last = 0, running = true, t = 0, acc = 0, frames = 0;
  const clock = new THREE.Clock();

  /* ============================================================================
     راند ۱ (ادامه) — تنزل خودکار کیفیت
     اگر fps واقعی زیر ۷۵٪ سقف کیفیت فعلی بیفتد، یک پله پایین می‌آییم.
     شرط: حداقل ۲ ثانیه پایداری، تا نوسان لحظه‌ای باعث جهش بی‌دلیل نشود.
     ========================================================================== */
  let watch = 0, downgrades = 0;
  function autoTune(fps) {
    if (reduced || downgrades >= 2) return;
    const idx = TIER_ORDER.indexOf(tierName);
    if (fps >= tier.fps * 0.75) { watch = 0; return; }
    watch++;
    if (watch < 4) return;                       // ~۲ ثانیه پایدار
    watch = 0; downgrades++;
    tierName = TIER_ORDER[Math.min(idx + 1, TIER_ORDER.length - 1)];
    tier = TIERS[tierName];
    FRAME = 1000 / tier.fps;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, tier.dpr));

    // بازسازی لایه‌های توپوگرافی با تراکم جدید
    if (typeof buildLayers === 'function' && typeof world !== 'undefined') {
      layerMeshes.forEach((m) => { world.remove(m); m.geometry.dispose(); m.material.dispose(); });
      layerMeshes.length = 0;
      const fresh = buildLayers();
      fresh.forEach((L) => {
        const mesh = makeTerrainLayer(L);
        world.add(mesh); layerMeshes.push(mesh);
      });
    }
    if (typeof dustGeometry !== 'undefined' && dustGeometry) {
      dustGeometry.setDrawRange(0, Math.min(tier.particles, dustGeometry.attributes.position.count));
    }
    if (typeof composite === 'function' && !tier.bloom) {
      renderer.toneMappingExposure = 1.55;       // جبران نبود بلوم: بدون بلوم تصویر تخت می‌شود
    }
    /* راند ۵ — آزادسازی بلوم وقتی خاموش شد: تارگت‌های نیم‌فلوت ۵ بافر
       (بزرگ‌ترین مصرف حافظه‌ی GPU) دیگر لازم نیستند و آزاد می‌شوند.
       بدون این، تنزل به eco روی گوشی‌های ضعیف = نشت حافظه. */
    if (!tier.bloom) {
      brightRT.dispose(); blurA.dispose(); blurB.dispose(); rt.dispose();
    }
    set('mode', tierName.toUpperCase() + '↓');
    set('segments', String(LAYERS.reduce((a, L) => a + L.seg, 0)));
    set('layers', String(LAYERS.length));
    set('particles', String(dustGeometry ? dustGeometry.attributes.position.count : 0));
    set('t-fps-cap', String(tier.fps));
  }

  function frame(ts) {
    if (!running) return;
    kick();                               // نگهبان تک‌نمونه‌ای صف (تعریف پایین‌تر)
    if (ts - last < FRAME) return;
    const dt = clock.getDelta();
    last = ts; t += dt;

    ptr.x += (ptr.tx - ptr.x) * 0.055;
    ptr.y += (ptr.ty - ptr.y) * 0.055;

    const sc = Math.min(window.scrollY / 1000, 1);

    world.rotation.y = ptr.x * 0.16 + t * 0.035;
    world.rotation.x = ptr.y * 0.07 - 0.04;
    world.position.y = -12 - sc * 30 + Math.sin(t * 0.25) * 1.4;
    world.position.x = ptr.x * 10;

    layerMeshes.forEach((m, i) => { m.material.uniforms.uTime.value = t; });
    mobMat.uniforms.uTime.value = t;
    mobius.rotation.z = t * 0.12;
    mobius.rotation.y = 0.35 + Math.sin(t * 0.3) * 0.25;

    dust.position.y = -sc * 20 + Math.sin(t * 0.18) * 3;
    dust.rotation.y = t * 0.01;

    camera.position.z = 118 - sc * 30 + Math.sin(t * 0.22) * 3;
    camera.position.y = 26 - sc * 12 + ptr.y * -6;
    camera.lookAt(0, world.position.y + 10, 0);

    composite();

    acc += dt; frames++;
    if (acc >= 0.5) {
      const fps = Math.round(frames / acc);
      // راند ۹ — بعد از برگشت از تب، اگر ساعت به هر دلیل کهنه مانده باشد
      // dt یک‌باره بزرگ است و این محاسبه fps=0 نشان می‌داد (یعنی «مرده»).
      // صفر یعنی اندازه‌گیری بی‌اعتبار است، نه رندر کم؛ پس اصلاً نمایش نمی‌دهیم.
      if (fps <= 0) { acc = 0; frames = 0; return; }
      set('fps', String(fps));
      autoTune(fps);                    // راند ۱: تصمیم بر پایه‌ی عدد واقعی
      acc = 0; frames = 0;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else if (!running) { running = true; last = 0; acc = 0; frames = 0; clock.getDelta(); kick(); }
  });

  /* راند ۴ — بازیابی از دست رفتن کانتکست گرافیکی
     روی موبایل‌های ضعیف (و بعد از هشدار OOM مرورگر) درایور GPU می‌تواند کانتکست را
     بگیرد. بدون این بخش، صفحه برای همیشه سیاه می‌ماند و راه برگشتی نیست.
     راند ۹ — نگهبان صف rAF: هر مسیر بازگشت (تب، کانتکست) خودش frame را دوباره
     صف می‌کرد و در نتیجه دو یا سه callback در هر تیک اجرا می‌شد (۲.۵ رندر در هر
     تیک — آزمایشگاه با t9-double.mjs اثبات کرد). قفل تک‌نمونه‌ای این را می‌بندد. */
  let rafId = 0;
  const kick = () => {
    if (rafId) return;            // یک نمونه در صف کافی است
    rafId = requestAnimationFrame((ts) => { rafId = 0; frame(ts); });
  };
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    set('status', 'قطع کانتکست');
    set('t-mode', 'در حال بازیابی');
  }, false);
  canvas.addEventListener('webglcontextrestored', () => {
    // همه‌ی بافرها باطل شده‌اند: رندر تارگت‌ها و یک فریم تازه می‌سازیم
    doResize(true);
    running = true; last = 0; acc = 0; frames = 0;
    clock.getDelta();             // ساعت کهنه بعد از وقفه، fps را صفر نشان می‌داد
    set('status', 'برخط');
    set('t-mode', 'بازیابی شد');
    kick();
  }, false);

  /* راند ۷ (ادامه) — دسترس‌پذیری: پیمایش با صفحه‌کلید
     تعامل اصلی سایت (چرخش هولوگرام با ماوس) برای کاربر صفحه‌کلید غیرقابل
     دسترس بود. با کلیدهای جهت‌نما همان کار با گام‌های ۲۰ درصدی انجام می‌شود.
     عمداً فقط وقتی فوکوس جای دیگری نیست تا با اسکرول صفحه تداخل نکند. */
  if (!reduced) {
    addEventListener('keydown', (e) => {
      const el = document.activeElement;
      const tag = el && el.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // روی لینک‌های ناوبری، کلید جهت‌نما کار خودش را دارد (پیمایش فوکوس).
      // صحنه را نچرخان تا هم‌زمان دو چیز حرکت نکند.
      if (el && el.closest && el.closest('a, button, [tabindex]')) return;
      const step = 0.2;
      const before = { x: ptr.tx, y: ptr.ty };
      if (e.key === 'ArrowRight') ptr.tx = Math.min(1, ptr.tx + step);
      else if (e.key === 'ArrowLeft') ptr.tx = Math.max(-1, ptr.tx - step);
      else if (e.key === 'ArrowUp') ptr.ty = Math.max(-1, ptr.ty - step);
      else if (e.key === 'ArrowDown') ptr.ty = Math.min(1, ptr.ty + step);
      else return;
      e.preventDefault();
      // بازخورد دیداری: بدون این، پیمایش کاملاً بی‌صدا و بی‌اثر به نظر می‌رسد.
      if (ptr.tx !== before.x || ptr.ty !== before.y) announceKeys(ptr.tx, ptr.ty);
    }, { passive: false });
  }

  /* راند ۸ — آزادسازی منابع در خروج
     مرورگرها معمولاً خودشان پاک می‌کنند، ولی در Safari/iOS و در بازگشت از
     بک‌کش (bfcache) این کار انجام نمی‌شود و چند سایت باز و بسته = چند مگابایت نشت. */
  addEventListener('pagehide', (e) => {
    if (!e.persisted) {                     // در bfcache نباید پاک کنیم
      running = false;
      layerMeshes.forEach((m) => { m.geometry.dispose(); m.material.dispose(); });
      [mobGeo, dustGeometry, quadGeo].forEach((g) => g && g.dispose());
      [mobMat, brightMat, blurMat, compMat].forEach((m) => m && m.dispose());
      [rt, brightRT, blurA, blurB].forEach((t) => t && t.dispose());
      renderer.dispose();
    }
  }, { once: true });

  if (reduced) { composite(); set('mode', 'ایستا'); return; }
  kick();
}
