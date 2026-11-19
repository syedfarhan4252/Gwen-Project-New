import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { GwenState, ThemeId } from '../types/gwen';

interface GwenAvatar3DProps {
  state: GwenState;
  audioLevel: number;
  personaId: string;
  themeId: ThemeId;
  customAccent: string | null;
  isPushToTalk?: boolean;
  isPttActive?: boolean;
  onPrimaryClick: () => void;
  onPttStart?: () => void;
  onPttEnd?: () => void;
}

const _colorAccent = new THREE.Color();
const _colorSecondary = new THREE.Color();

function probeSoftwareWebGL(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export const GwenAvatar3D: React.FC<GwenAvatar3DProps> = ({
  state,
  audioLevel,
  personaId,
  themeId,
  customAccent,
  isPushToTalk = false,
  isPttActive = false,
  onPrimaryClick,
  onPttStart,
  onPttEnd,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [webglFailed, setWebglFailed] = useState(false);

  const stateRef = useRef(state);
  stateRef.current = state;
  const audioLevelRef = useRef(audioLevel);
  audioLevelRef.current = audioLevel;
  const personaIdRef = useRef(personaId);
  personaIdRef.current = personaId;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = probeSoftwareWebGL();
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    ).matches;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);

    const width = Math.max(container.clientWidth, 260);
    const height = Math.max(container.clientHeight, 260);
    renderer.setSize(width, height);
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();

    // Studio RoomEnvironment reflection map
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 40);
    camera.position.set(0, 0.22, 4.1);
    camera.lookAt(0, 0.05, 0);

    // 3-Point Studio Lighting (Warm Key, Cool Hemisphere Fill, Accent Rim)
    const hemiLight = new THREE.HemisphereLight(0xbcd8ff, 0x181c28, 0.85);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1e0, 1.85);
    keyLight.position.set(2.4, 3.2, 3.4);
    keyLight.castShadow = !isSoftwareGl;
    if (!isSoftwareGl) {
      keyLight.shadow.mapSize.set(512, 512);
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 12;
      keyLight.shadow.camera.left = -2.5;
      keyLight.shadow.camera.right = 2.5;
      keyLight.shadow.camera.top = 2.5;
      keyLight.shadow.camera.bottom = -2.5;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x2dd4bf, 1.5);
    rimLight.position.set(-2.6, 1.6, -2.5);
    scene.add(rimLight);

    // Shared PBR materials with distinct roughness/metalness contrast
    const ceramicShellMat = new THREE.MeshPhysicalMaterial({
      color: 0xeaf0f6,
      roughness: 0.2,
      metalness: 0.08,
      clearcoat: 0.9,
      clearcoatRoughness: 0.14,
    });

    const obsidianTitaniumMat = new THREE.MeshStandardMaterial({
      color: 0x161b24,
      roughness: 0.48,
      metalness: 0.82,
    });

    const matteCollarTrimMat = new THREE.MeshStandardMaterial({
      color: 0x252d3b,
      roughness: 0.72,
      metalness: 0.2,
    });

    const accentGlowMat = new THREE.MeshStandardMaterial({
      color: 0x2dd4bf,
      emissive: 0x2dd4bf,
      emissiveIntensity: 1.4,
      roughness: 0.2,
      metalness: 0.3,
    });

    const secondaryGlowMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x38bdf8,
      emissiveIntensity: 0.9,
      roughness: 0.25,
      metalness: 0.35,
      transparent: true,
      opacity: 0.75,
    });

    const darkVisorMat = new THREE.MeshPhysicalMaterial({
      color: 0x0b1019,
      roughness: 0.08,
      metalness: 0.15,
      clearcoat: 1.0,
      clearcoatRoughness: 0.06,
    });

    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x04070d });

    // Composite 12-Part Talking Character Group (pivoted at bottom-center)
    const rootGroup = new THREE.Group();
    rootGroup.position.set(0, -0.82, 0);
    scene.add(rootGroup);

    // 1. Soft radial contact shadow grounding disc
    const shadowCanvas = document.createElement('canvas');
    shadowCanvas.width = 128;
    shadowCanvas.height = 128;
    const sCtx = shadowCanvas.getContext('2d');
    if (sCtx) {
      const grad = sCtx.createRadialGradient(64, 64, 6, 64, 64, 60);
      grad.addColorStop(0, 'rgba(0,0,0,0.52)');
      grad.addColorStop(0.65, 'rgba(0,0,0,0.18)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      sCtx.fillStyle = grad;
      sCtx.fillRect(0, 0, 128, 128);
    }
    const shadowTex = new THREE.CanvasTexture(shadowCanvas);
    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.1, 2.1),
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.55,
      })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.02;
    rootGroup.add(contactShadow);

    // 2. Sculpted Pedestal Collar & Shoulders (LatheGeometry + Shoulder Plates)
    const bustGroup = new THREE.Group();
    bustGroup.position.y = 0.06;
    rootGroup.add(bustGroup);

    const torsoProfile = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.76, 0.02),
      new THREE.Vector2(0.72, 0.18),
      new THREE.Vector2(0.54, 0.34),
      new THREE.Vector2(0.28, 0.44),
      new THREE.Vector2(0.22, 0.62),
      new THREE.Vector2(0.2, 0.72),
    ];
    const torsoMesh = new THREE.Mesh(
      new THREE.LatheGeometry(torsoProfile, 40),
      obsidianTitaniumMat
    );
    torsoMesh.castShadow = !isSoftwareGl;
    torsoMesh.receiveShadow = !isSoftwareGl;
    bustGroup.add(torsoMesh);

    // 3. Chest Neural Core Ring
    const chestRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.32, 0.024, 16, 48),
      accentGlowMat
    );
    chestRing.rotation.x = Math.PI * 0.42;
    chestRing.position.set(0, 0.34, 0.28);
    bustGroup.add(chestRing);

    // 4. Matte Collar Trim Ring
    const collarTrim = new THREE.Mesh(
      new THREE.TorusGeometry(0.25, 0.032, 16, 40),
      matteCollarTrimMat
    );
    collarTrim.rotation.x = Math.PI / 2;
    collarTrim.position.set(0, 0.48, 0);
    bustGroup.add(collarTrim);

    // Head Pivot Group (expressive tilts, nods, breathing)
    const headGroup = new THREE.Group();
    headGroup.position.set(0, 1.12, 0);
    bustGroup.add(headGroup);

    // 5. Primary Cranium (sculpted oval)
    const craniumGeo = new THREE.SphereGeometry(0.56, 36, 32);
    craniumGeo.scale(0.92, 1.06, 0.96);
    const cranium = new THREE.Mesh(craniumGeo, ceramicShellMat);
    cranium.position.set(0, 0.06, 0);
    cranium.castShadow = !isSoftwareGl;
    headGroup.add(cranium);

    // 6. Sculpted Cybernetic Hair / Crown Shell (sleek dark swept dome)
    const crownGeo = new THREE.SphereGeometry(0.585, 36, 24, 0, Math.PI * 2, 0, Math.PI * 0.58);
    crownGeo.scale(0.95, 1.04, 1.0);
    const crownShell = new THREE.Mesh(crownGeo, obsidianTitaniumMat);
    crownShell.position.set(0, 0.1, -0.04);
    crownShell.rotation.x = -0.26;
    headGroup.add(crownShell);

    // 7. Crown Luminous Brow Seam
    const browArc = new THREE.Mesh(
      new THREE.TorusGeometry(0.52, 0.014, 12, 48, Math.PI * 0.78),
      accentGlowMat
    );
    browArc.position.set(0, 0.27, 0.12);
    browArc.rotation.set(0.32, 0, Math.PI * 0.11);
    headGroup.add(browArc);

    // 8. Dual Acoustic Ear Nodes
    const earGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.08, 24);
    earGeo.rotateZ(Math.PI / 2);
    const leftEar = new THREE.Mesh(earGeo, obsidianTitaniumMat);
    leftEar.position.set(-0.52, 0.04, -0.02);
    headGroup.add(leftEar);

    const rightEar = new THREE.Mesh(earGeo, obsidianTitaniumMat);
    rightEar.position.set(0.52, 0.04, -0.02);
    headGroup.add(rightEar);

    const earRingGeo = new THREE.TorusGeometry(0.115, 0.014, 12, 28);
    earRingGeo.rotateY(Math.PI / 2);
    const leftEarRing = new THREE.Mesh(earRingGeo, accentGlowMat);
    leftEarRing.position.set(-0.565, 0.04, -0.02);
    headGroup.add(leftEarRing);

    const rightEarRing = new THREE.Mesh(earRingGeo, accentGlowMat);
    rightEarRing.position.set(0.565, 0.04, -0.02);
    headGroup.add(rightEarRing);

    // 9. Curved Glassy Faceplate Mask (eye & expression zone)
    const visorGeo = new THREE.SphereGeometry(
      0.525,
      32,
      24,
      -Math.PI * 0.34,
      Math.PI * 0.68,
      Math.PI * 0.3,
      Math.PI * 0.34
    );
    visorGeo.scale(0.95, 1.04, 0.99);
    const visorMesh = new THREE.Mesh(visorGeo, darkVisorMat);
    visorMesh.rotation.y = Math.PI / 2;
    visorMesh.position.set(0, 0.08, 0.03);
    headGroup.add(visorMesh);

    // 10. Expressive Eyes (Left & Right Assemblies with Blinking Eyelids & Brows)
    const createEyeAssembly = (side: -1 | 1) => {
      const eyeGroup = new THREE.Group();
      eyeGroup.position.set(side * 0.185, 0.1, 0.49);
      eyeGroup.rotation.y = side * 0.24;

      const iris = new THREE.Mesh(new THREE.CircleGeometry(0.072, 24), accentGlowMat);
      eyeGroup.add(iris);

      const pupil = new THREE.Mesh(new THREE.CircleGeometry(0.032, 20), pupilMat);
      pupil.position.z = 0.004;
      eyeGroup.add(pupil);

      const glint = new THREE.Mesh(
        new THREE.CircleGeometry(0.014, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      glint.position.set(0.022, 0.024, 0.007);
      eyeGroup.add(glint);

      // Articulated eyelid curtain for natural blinking & sleepy/smile squint
      const eyelid = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.16), darkVisorMat);
      eyelid.position.set(0, 0.145, 0.009);
      eyeGroup.add(eyelid);

      // Expressive brow strip
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.018, 0.01), accentGlowMat);
      brow.position.set(0, 0.115, 0.008);
      eyeGroup.add(brow);

      return { eyeGroup, iris, pupil, eyelid, brow };
    };

    const leftEye = createEyeAssembly(-1);
    const rightEye = createEyeAssembly(1);
    headGroup.add(leftEye.eyeGroup, rightEye.eyeGroup);

    // 11. Articulated Lower Jaw & Real-Time Audio Lip-Sync Mouth Matrix
    const jawGroup = new THREE.Group();
    jawGroup.position.set(0, -0.18, 0.06);
    headGroup.add(jawGroup);

    const chinGeo = new THREE.SphereGeometry(0.32, 24, 18);
    chinGeo.scale(1.05, 0.65, 1.0);
    const chinMesh = new THREE.Mesh(chinGeo, ceramicShellMat);
    chinMesh.position.set(0, -0.13, 0.12);
    jawGroup.add(chinMesh);

    // Mouth recess + glowing lip-sync bars (5 viseme equalizer bars)
    const mouthGroup = new THREE.Group();
    mouthGroup.position.set(0, -0.02, 0.445);
    jawGroup.add(mouthGroup);

    const lipOuter = new THREE.Mesh(
      new THREE.TorusGeometry(0.088, 0.012, 10, 28),
      accentGlowMat
    );
    lipOuter.scale.set(1.38, 0.34, 1);
    mouthGroup.add(lipOuter);

    const visemeBars: THREE.Mesh[] = [];
    const barGeo = new THREE.BoxGeometry(0.026, 0.026, 0.014);
    for (let i = 0; i < 5; i++) {
      const bar = new THREE.Mesh(barGeo, accentGlowMat);
      bar.position.set((i - 2) * 0.042, 0, 0.004);
      mouthGroup.add(bar);
      visemeBars.push(bar);
    }

    // 12. Orbiting Holographic Neural Halo Rings
    const haloOuter = new THREE.Mesh(
      new THREE.TorusGeometry(1.12, 0.011, 12, 72),
      secondaryGlowMat
    );
    haloOuter.position.set(0, 1.12, -0.35);
    haloOuter.rotation.set(0.35, -0.25, 0);
    bustGroup.add(haloOuter);

    const haloInner = new THREE.Mesh(
      new THREE.TorusGeometry(0.92, 0.014, 12, 64, Math.PI * 1.45),
      accentGlowMat
    );
    haloInner.position.set(0, 1.12, -0.25);
    haloInner.rotation.set(-0.4, 0.3, 0.5);
    bustGroup.add(haloInner);

    // Pre-compile shaders on hardware GPU
    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Read theme CSS variables for live accent sync
    const syncColorsFromTheme = () => {
      const style = getComputedStyle(document.documentElement);
      const accentHex = style.getPropertyValue('--accent').trim() || '#2dd4bf';
      const secHex = style.getPropertyValue('--orb-secondary').trim() || '#38bdf8';
      _colorAccent.set(accentHex);
      _colorSecondary.set(secHex);
      accentGlowMat.color.copy(_colorAccent);
      accentGlowMat.emissive.copy(_colorAccent);
      secondaryGlowMat.color.copy(_colorSecondary);
      secondaryGlowMat.emissive.copy(_colorSecondary);
      rimLight.color.copy(_colorAccent);
    };
    syncColorsFromTheme();

    // Animation state (zero GC allocations inside tick)
    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;
    let smoothAmp = 0;
    let blinkTimer = 2.6;
    let blinkAmount = 0;
    let currentJawOpen = 0;

    // Context loss safety
    const onContextLost = (e: Event) => {
      e.preventDefault();
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
    };
    const onContextRestored = () => {
      if (!disposed) tick();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', onContextRestored);

    const resizeObserver = new ResizeObserver(() => {
      if (!container || disposed) return;
      const w = Math.max(container.clientWidth, 240);
      const h = Math.max(container.clientHeight, 240);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    const afterDraw = (cb: () => void) => {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync?.(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (status === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 6);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 6);
    };

    const tick = () => {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.1);
      const t = clock.getElapsedTime();

      const curState = stateRef.current;
      const curPersona = personaIdRef.current;
      const targetAmp = curState === 'speaking' || curState === 'listening' ? audioLevelRef.current : 0;
      smoothAmp = THREE.MathUtils.damp(smoothAmp, targetAmp, 14, delta);

      const motionScale = prefersReducedMotion ? 0.12 : 1.0;

      // Persona-matched expressive head posture & brow curves
      let targetTiltZ = Math.sin(t * 0.7) * 0.045 * motionScale;
      let targetYawY = Math.sin(t * 0.5) * 0.08 * motionScale;
      let targetPitchX = Math.sin(t * 0.9) * 0.03 * motionScale;
      let browLift = 0;
      let browAngle = 0;

      if (curPersona === 'girlfriend-gf' || curPersona === 'boyfriend-bf') {
        targetTiltZ += 0.065 * motionScale;
        browLift = 0.01;
        browAngle = 0.08;
      } else if (curPersona === 'funny-witty' || curPersona === 'best-friend') {
        targetTiltZ += Math.sin(t * 1.4) * 0.06 * motionScale;
        browLift = 0.016;
        browAngle = -0.06;
      } else if (curPersona === 'tech-coding-buddy' || curPersona === 'productivity-coach') {
        targetPitchX -= 0.03;
        browAngle = -0.05;
      }

      if (curState === 'listening') {
        targetPitchX -= 0.045;
        browLift += 0.015;
      } else if (curState === 'thinking' || curState === 'connecting') {
        targetYawY = Math.sin(t * 1.6) * 0.16 * motionScale;
        targetPitchX = -0.07;
      } else if (curState === 'speaking') {
        targetPitchX += Math.sin(t * 4.2) * 0.04 * (0.3 + smoothAmp);
        targetYawY += Math.cos(t * 2.1) * 0.05;
      } else if (curState === 'dormant') {
        targetPitchX = 0.18;
        targetTiltZ = 0.05;
        targetYawY = 0;
      }

      headGroup.rotation.z = THREE.MathUtils.damp(headGroup.rotation.z, targetTiltZ, 6, delta);
      headGroup.rotation.y = THREE.MathUtils.damp(headGroup.rotation.y, targetYawY, 6, delta);
      headGroup.rotation.x = THREE.MathUtils.damp(headGroup.rotation.x, targetPitchX, 6, delta);

      // Gentle breathing bob
      bustGroup.position.y =
        0.06 + (curState === 'dormant' ? 0 : Math.sin(t * 1.5) * 0.02 * motionScale);

      // Natural eye blinking + Dormant eyelid close
      if (curState === 'dormant') {
        blinkAmount = THREE.MathUtils.damp(blinkAmount, 0.92, 5, delta);
      } else {
        blinkTimer -= delta;
        if (blinkTimer <= 0) {
          blinkTimer = 2.8 + Math.random() * 2.6;
          blinkAmount = 1.0;
        } else {
          blinkAmount = THREE.MathUtils.damp(blinkAmount, 0, 18, delta);
        }
      }

      const lidY = 0.145 - blinkAmount * 0.145;
      leftEye.eyelid.position.y = lidY;
      rightEye.eyelid.position.y = lidY;

      leftEye.brow.position.y = 0.115 + browLift;
      rightEye.brow.position.y = 0.115 + browLift;
      leftEye.brow.rotation.z = browAngle;
      rightEye.brow.rotation.z = -browAngle;

      // Subtle eye pupil gaze
      const gazeX = curState === 'dormant' ? 0 : Math.sin(t * 0.85) * 0.018 * motionScale;
      const gazeY = curState === 'thinking' ? 0.016 : Math.cos(t * 0.6) * 0.01 * motionScale;
      leftEye.pupil.position.x = gazeX;
      rightEye.pupil.position.x = gazeX;
      leftEye.pupil.position.y = gazeY;
      rightEye.pupil.position.y = gazeY;

      // Real-Time Audio Lip-Sync (Jaw + Vocal Aperture + 5 Viseme Bars)
      const speechEnergy =
        curState === 'speaking' ? Math.max(0.12, smoothAmp * 1.35) : 0;
      currentJawOpen = THREE.MathUtils.damp(currentJawOpen, speechEnergy, 18, delta);

      jawGroup.position.y = -0.18 - currentJawOpen * 0.06;
      lipOuter.scale.y = 0.32 + currentJawOpen * 1.05;
      lipOuter.scale.x = 1.36 - currentJawOpen * 0.16;

      for (let i = 0; i < visemeBars.length; i++) {
        const wave = Math.abs(Math.sin(t * (9 + i * 2.3) + i * 0.9));
        const h =
          curState === 'speaking'
            ? 0.45 + currentJawOpen * (1.8 + wave * 2.6)
            : curState === 'listening'
              ? 0.35 + smoothAmp * 1.5
              : curState === 'dormant'
                ? 0.15
                : 0.3;
        visemeBars[i].scale.y = THREE.MathUtils.damp(visemeBars[i].scale.y, h, 20, delta);
      }

      // Emissive intensity & Halo ring motion
      const targetEmissive =
        curState === 'dormant'
          ? 0.25
          : curState === 'speaking'
            ? 1.55 + smoothAmp * 1.1
            : curState === 'listening'
              ? 1.25 + smoothAmp * 0.8
              : curState === 'thinking' || curState === 'connecting'
                ? 1.5
                : 0.95;
      accentGlowMat.emissiveIntensity = THREE.MathUtils.damp(
        accentGlowMat.emissiveIntensity,
        targetEmissive,
        10,
        delta
      );

      const haloSpeed =
        curState === 'dormant'
          ? 0.06
          : curState === 'thinking' || curState === 'connecting'
            ? 1.35
            : curState === 'speaking'
              ? 0.85
              : 0.32;
      haloOuter.rotation.z += delta * haloSpeed * 0.65 * motionScale;
      haloInner.rotation.z -= delta * haloSpeed * 1.05 * motionScale;

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', onContextRestored);

      scene.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          const mesh = obj as THREE.Mesh;
          mesh.geometry?.dispose();
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach((m) => m.dispose());
          } else {
            mesh.material?.dispose();
          }
        }
      });
      shadowTex.dispose();
      envTex.dispose();
      renderer.dispose();
    };
  }, [themeId, customAccent]);

  const ariaLabel =
    state === 'dormant'
      ? 'Gwen is asleep. Tap to wake Gwen.'
      : state === 'idle'
        ? 'Start live voice conversation with Gwen 3D Avatar'
        : isPushToTalk
          ? isPttActive
            ? 'Release to finish speaking'
            : 'Hold 3D avatar to speak'
          : state === 'speaking'
            ? 'Tap to interrupt Gwen'
            : 'End live voice conversation';

  if (webglFailed) {
    return (
      <button
        type="button"
        onClick={onPrimaryClick}
        className="w-64 h-64 rounded-full border flex flex-col items-center justify-center gap-2 cursor-pointer"
        style={{
          backgroundColor: 'var(--bg-elevated)',
          borderColor: 'var(--accent)',
        }}
      >
        <span className="font-display text-3xl font-bold text-[var(--accent)]">G</span>
        <span className="text-xs text-[var(--text-secondary)]">Tap to talk with Gwen</span>
      </button>
    );
  }

  return (
    <div className="relative w-full max-w-[300px] lg:max-w-[340px] h-[235px] sm:h-[275px] lg:h-[325px] mx-auto select-none">
      {/* Ultra-subtle open orbital halo ring behind 3D avatar (no boxy corner brackets) */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 w-full h-full opacity-30"
        viewBox="0 0 300 272"
        fill="none"
      >
        <circle
          cx="150"
          cy="138"
          r="114"
          stroke="url(#gwenOrbitalGrad)"
          strokeWidth="1"
          strokeDasharray="3 8"
        />
        <defs>
          <linearGradient id="gwenOrbitalGrad" x1="36" y1="24" x2="264" y2="252" gradientUnits="userSpaceOnUse">
            <stop stopColor="#22d3ee" stopOpacity="0.65" />
            <stop offset="1" stopColor="#8b5cf6" stopOpacity="0.55" />
          </linearGradient>
        </defs>
      </svg>

      {/* Isolated WebGL Mount Container */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Transparent interactive touch target layered over 3D bust */}
      <button
        type="button"
        aria-label={ariaLabel}
        onClick={() => {
          if (!isPushToTalk || state === 'idle' || state === 'error' || state === 'dormant') {
            onPrimaryClick();
          }
        }}
        onPointerDown={() => {
          if (isPushToTalk && state !== 'idle' && state !== 'error' && state !== 'dormant') {
            onPttStart?.();
          }
        }}
        onPointerUp={() => {
          if (isPushToTalk && state !== 'idle' && state !== 'error' && state !== 'dormant') {
            onPttEnd?.();
          }
        }}
        onPointerLeave={() => {
          if (isPushToTalk && isPttActive) {
            onPttEnd?.();
          }
        }}
        className="absolute inset-0 z-10 rounded-full focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/50 cursor-pointer touch-none"
      >
        <span className="sr-only">{ariaLabel}</span>
      </button>
    </div>
  );
};
