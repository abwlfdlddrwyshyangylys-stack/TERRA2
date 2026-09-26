import * as THREE from '../vendor/three.module.min.js';

/* ============================================================================
   تِرا ۲ — بوم هولوگرافیک
   توپوگرافی سیمی چندلایه + ذرات درخشان + بلوم واقعی + شیشه‌ی گلاسمورفیسم
   همه‌چیز لوکال. بدون WebGL → نسخه‌ی متنی بی‌سروصدا.
   ========================================================================== */

const canvas = document.getElementById('scene');
const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) { return false; }
}

if (hasWebGL()) boot();
else { set('status', 'NO WEBGL'); set('fps', '--'); }

function boot() {
  const mobile = window.matchMedia('(max-width: 768px)').matches;
  const lowPower = mobile || (navigator.hardwareConcurrency || 4) <= 4;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- رندرر ---------- */
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, lowPower ? 1.25 : 1.6));
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
  const LAYERS = lowPower
    ? [
        { z: -70, amp: 26, freq: 0.0055, col: 0x0a2a4a, op: 0.30, seg: 128 },
        { z: -26, amp: 20, freq: 0.0082, col: 0x0d4a72, op: 0.42, seg: 128 },
        { z:  14, amp: 15, freq: 0.0125, col: 0x1177aa, op: 0.55, seg: 128 },
        { z:  54, amp: 10, freq: 0.0190, col: 0x18b8e0, op: 0.70, seg: 128 },
      ]
    : [
        { z: -70, amp: 26, freq: 0.0055, col: 0x0a2a4a, op: 0.30, seg: 220 },
        { z: -26, amp: 20, freq: 0.0082, col: 0x0d4a72, op: 0.42, seg: 200 },
        { z:  14, amp: 15, freq: 0.0125, col: 0x1177aa, op: 0.55, seg: 190 },
        { z:  54, amp: 10, freq: 0.0190, col: 0x18b8e0, op: 0.70, seg: 180 },
        { z:  92, amp:  6, freq: 0.0270, col: 0x2ee6ff, op: 0.85, seg: 160 },
      ];

  function terrainY(x, z, L) {
    // چند موج ضرب‌درهم با دانه‌ی متفاوت → قله و دره‌ی غیرتکراری
    let h = Math.sin(x * L.freq + z * L.freq * 0.42) * 0.60;
    h += Math.sin(x * L.freq * 2.17 - z * L.freq * 0.83) * 0.26;
    h += Math.sin((x + z) * L.freq * 3.91) * 0.12;
    h += Math.sin(x * L.freq * 7.13 + z * L.freq * 1.9) * 0.05;
    // تیزکردن قله‌ها
    return Math.sign(h) * Math.pow(Math.abs(h), 0.78) * L.amp;
  }

  const layerMeshes = [];
  LAYERS.forEach((L, li) => {
    // شبکه‌ی سیمی: دو دسته خط در دو جهت
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
          // تپش آرام مثل اسکنر هولوگرافیک
          p.y += sin(p.x * 0.05 + uTime * 1.2) * 0.35;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uTime;
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

  const mobSeg = lowPower ? 90 : 160;
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
    const n = lowPower ? 500 : 1600;
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
      size: lowPower ? 1.1 : 1.6, vertexColors: true, transparent: true,
      opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true
    }));
  })();
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

  function resize() {
    const w = innerWidth, h = innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    rt.setSize(w, h); brightRT.setSize(w, h);
    blurA.setSize(Math.round(w * BLOOM_SCALE), Math.round(h * BLOOM_SCALE));
    blurB.setSize(Math.round(w * BLOOM_SCALE), Math.round(h * BLOOM_SCALE));
    blurMat.uniforms.uTexel.value.set(1 / (w * BLOOM_SCALE), 1 / (h * BLOOM_SCALE));
  }
  addEventListener('resize', resize, { passive: true });

  /* ---------- HUD ---------- */
  set('status', 'ONLINE');
  set('mode', lowPower ? 'ECO' : 'ULTRA');
  set('segments', String(LAYERS.reduce((a, L) => a + L.seg, 0)));
  set('res', `${innerWidth}×${innerHeight}`);

  /* ---------- حلقه ---------- */
  const FRAME = 1000 / (lowPower ? 30 : 45);
  let last = 0, running = true, t = 0, acc = 0, frames = 0;
  const clock = new THREE.Clock();

  function frame(ts) {
    if (!running) return;
    requestAnimationFrame(frame);
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
      set('fps', String(Math.round(frames / acc)));
      acc = 0; frames = 0;
    }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) running = false;
    else if (!running) { running = true; last = 0; requestAnimationFrame(frame); }
  });

  if (reduced) { composite(); set('mode', 'STATIC'); return; }
  requestAnimationFrame(frame);
}
