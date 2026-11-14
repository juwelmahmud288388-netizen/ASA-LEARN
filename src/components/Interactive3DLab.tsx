import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Bot, Eye, EyeOff, Pause, Play, RotateCcw } from 'lucide-react';
import type { Ai3DObjectSpec, Ai3DSceneBlueprint, Language, ThreeDSceneType } from '../types';

interface Interactive3DLabProps {
  initialScene?: ThreeDSceneType;
  customBlueprint?: Ai3DSceneBlueprint | null;
  language: Language;
  onAskAi?: () => void;
}

const BUILTIN_SCENES: Array<{ id: ThreeDSceneType; labelEn: string; labelBn: string }> = [
  { id: 'trigonometry_triangle', labelEn: 'Trigonometry 3D Triangle', labelBn: 'ত্রিকোণমিতি থ্রিডি ত্রিভুজ' },
  { id: 'newton_orbit', labelEn: 'Newton Gravity & Orbit', labelBn: 'নিউটনের মহাকর্ষ ও কক্ষপথ' },
  { id: 'algebra_geometry', labelEn: 'Algebra (a + b)³ Cube', labelBn: 'বীজগণিত (a + b)³ ঘনক' },
  { id: 'molecule_atom', labelEn: 'Bohr 3D Atom Shells', labelBn: 'পরমাণু ও ইলেকট্রন কক্ষপথ' },
];

export const Interactive3DLab: React.FC<Interactive3DLabProps> = ({
  initialScene = 'trigonometry_triangle',
  customBlueprint = null,
  language,
  onAskAi,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [sceneType, setSceneType] = useState<ThreeDSceneType>(
    customBlueprint ? 'ai_custom' : initialScene
  );
  const [paramValue, setParamValue] = useState<number>(
    customBlueprint?.sliderDefault ?? (initialScene === 'trigonometry_triangle' ? 35 : 55)
  );
  const [playing, setPlaying] = useState(true);
  const [showHud, setShowHud] = useState(true);
  const [selectedPart, setSelectedPart] = useState<Ai3DObjectSpec | null>(null);
  const [webglError, setWebglError] = useState<string | null>(null);

  const paramRef = useRef(paramValue);
  const playingRef = useRef(playing);
  const resetCamFnRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (customBlueprint) {
      setSceneType('ai_custom');
      setParamValue(customBlueprint.sliderDefault ?? 50);
      setSelectedPart(customBlueprint.objects?.[0] || null);
    } else {
      setSceneType(initialScene === 'ai_custom' ? 'trigonometry_triangle' : initialScene);
      setParamValue(initialScene === 'trigonometry_triangle' ? 35 : 55);
      setSelectedPart(null);
    }
  }, [initialScene, customBlueprint]);

  useEffect(() => {
    paramRef.current = paramValue;
  }, [paramValue]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  const sceneOptions = useMemo(() => {
    if (!customBlueprint) return BUILTIN_SCENES;
    return [
      {
        id: 'ai_custom' as ThreeDSceneType,
        labelEn: `AI 3D: ${customBlueprint.title}`,
        labelBn: `এআই ৩ডি: ${customBlueprint.titleBn || customBlueprint.title}`,
      },
      ...BUILTIN_SCENES,
    ];
  }, [customBlueprint]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
        alpha: false,
      });
    } catch {
      setWebglError('WebGL 3D context is unavailable in this browser.');
      return;
    }

    setWebglError(null);

    const gl = renderer.getContext();
    const dbgInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const rendererStr = dbgInfo ? String(gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL)) : '';
    const isSoftwareGl = /SwiftShader|llvmpipe|Software/i.test(rendererStr);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSoftwareGl ? 1.25 : 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bgHex =
      sceneType === 'ai_custom' && customBlueprint?.backgroundColor
        ? customBlueprint.backgroundColor
        : '#091332';
    scene.background = new THREE.Color(bgHex);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTarget = pmrem.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envTarget.texture;

    const camera = new THREE.PerspectiveCamera(
      44,
      Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1),
      0.1,
      100
    );
    camera.position.set(4.8, 3.6, 5.8);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.minDistance = 2.5;
    controls.maxDistance = 16;
    controls.target.set(0, 0.35, 0);

    resetCamFnRef.current = () => {
      camera.position.set(4.8, 3.6, 5.8);
      controls.target.set(0, 0.35, 0);
      controls.update();
    };

    const keyLight = new THREE.DirectionalLight('#ffffff', 2.0);
    keyLight.position.set(5, 8, 6);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight('#BFE8FF', 1.15);
    fillLight.position.set(-5, 3, -4);
    scene.add(fillLight);

    const ambientLight = new THREE.AmbientLight('#8fb8ff', 0.48);
    scene.add(ambientLight);

    const grid = new THREE.GridHelper(10, 20, '#263B91', '#162454');
    grid.position.y = -1.25;
    scene.add(grid);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);

    const geometries: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
      geometries.push(g);
      return g;
    };
    const trackMat = <T extends THREE.Material>(m: T): T => {
      materials.push(m);
      return m;
    };

    let updateSceneFn: (dt: number, elapsed: number, p: number) => void = () => {};

    if (sceneType === 'ai_custom' && customBlueprint?.objects?.length) {
      const createGeometryForSpec = (spec: Ai3DObjectSpec): THREE.BufferGeometry => {
        switch (spec.kind) {
          case 'sphere':
            return trackGeo(new THREE.SphereGeometry(0.5, 28, 28));
          case 'cylinder':
            return trackGeo(new THREE.CylinderGeometry(0.45, 0.45, 1, 24));
          case 'cone':
            return trackGeo(new THREE.ConeGeometry(0.5, 1, 24));
          case 'torus':
            return trackGeo(new THREE.TorusGeometry(0.55, 0.14, 18, 48));
          case 'octahedron':
            return trackGeo(new THREE.OctahedronGeometry(0.58, 0));
          case 'ring':
            return trackGeo(new THREE.TorusGeometry(0.85, 0.04, 14, 64));
          case 'box':
          default:
            return trackGeo(new THREE.BoxGeometry(1, 1, 1));
        }
      };

      const spawned = customBlueprint.objects.map((spec, idx) => {
        const geo = createGeometryForSpec(spec);
        const opacity = typeof spec.opacity === 'number' ? THREE.MathUtils.clamp(spec.opacity, 0.15, 1) : 1;
        const mat = trackMat(
          new THREE.MeshStandardMaterial({
            color: spec.color || '#38BDF8',
            metalness: typeof spec.metalness === 'number' ? spec.metalness : 0.25,
            roughness: typeof spec.roughness === 'number' ? spec.roughness : 0.3,
            transparent: opacity < 0.99,
            opacity,
          })
        );
        const mesh = new THREE.Mesh(geo, mat);
        const [px = 0, py = 0, pz = 0] = spec.position || [0, 0, 0];
        const [sx = 1, sy = 1, sz = 1] = spec.scale || [1, 1, 1];
        const [rx = 0, ry = 0, rz = 0] = spec.rotation || [0, 0, 0];

        mesh.position.set(px, py, pz);
        mesh.scale.set(
          THREE.MathUtils.clamp(sx, 0.08, 4),
          THREE.MathUtils.clamp(sy, 0.08, 4),
          THREE.MathUtils.clamp(sz, 0.08, 4)
        );
        if (spec.kind === 'ring' && !spec.rotation) {
          mesh.rotation.set(Math.PI / 2, 0, 0);
        } else {
          mesh.rotation.set(rx, ry, rz);
        }

        rootGroup.add(mesh);

        const basePos = new THREE.Vector3(px, py, pz);
        const radialDir = basePos.lengthSq() > 0.001 ? basePos.clone().normalize() : new THREE.Vector3(idx % 2 === 0 ? 1 : -1, 0.35, 0.2).normalize();
        const orbitRadius = spec.orbitRadius && spec.orbitRadius > 0 ? spec.orbitRadius : Math.max(Math.hypot(px, pz), 1.4);

        return {
          spec,
          mesh,
          basePos,
          radialDir,
          orbitRadius,
          initialAngle: Math.atan2(pz, px || 0.001) + idx * 0.65,
          speed: spec.motionSpeed || 1.1,
        };
      });

      const minSlider = customBlueprint.sliderMin ?? 0;
      const maxSlider = customBlueprint.sliderMax ?? 100;

      updateSceneFn = (dt, elapsed, rawP) => {
        const normP = maxSlider > minSlider ? (rawP - minSlider) / (maxSlider - minSlider) : rawP / 100;
        const pFactor = THREE.MathUtils.clamp(normP, 0, 1.5);

        spawned.forEach((entry, idx) => {
          const motion = entry.spec.motion || 'static';
          if (motion === 'orbit') {
            const angle = entry.initialAngle + (playingRef.current ? elapsed * entry.speed * (0.6 + pFactor) : pFactor * Math.PI * 2);
            const r = entry.orbitRadius * (0.65 + pFactor * 0.7);
            entry.mesh.position.set(Math.cos(angle) * r, entry.basePos.y, Math.sin(angle) * r);
          } else if (motion === 'spin') {
            if (playingRef.current) {
              entry.mesh.rotation.y += dt * entry.speed * (0.6 + pFactor * 1.6);
              entry.mesh.rotation.x += dt * 0.25 * entry.speed;
            }
          } else if (motion === 'oscillate') {
            const amp = 0.2 + pFactor * 0.55;
            entry.mesh.position.y = entry.basePos.y + Math.sin(elapsed * entry.speed * 1.8 + idx) * amp;
          } else if (motion === 'explode') {
            const offset = pFactor * 1.15;
            const target = entry.basePos.clone().addScaledVector(entry.radialDir, offset);
            entry.mesh.position.lerp(target, Math.min(1, dt * 8));
          }
        });

        if (playingRef.current) {
          rootGroup.rotation.y += dt * 0.14;
        }
      };
    } else if (sceneType === 'trigonometry_triangle') {
      const origin = new THREE.Vector3(-1.8, -0.7, 0);
      const hypLen = 3.6;

      const matBase = trackMat(new THREE.MeshStandardMaterial({ color: '#38BDF8', roughness: 0.25, metalness: 0.35 }));
      const matOpp = trackMat(new THREE.MeshStandardMaterial({ color: '#F472B6', roughness: 0.25, metalness: 0.35 }));
      const matHyp = trackMat(new THREE.MeshStandardMaterial({ color: '#FACC15', roughness: 0.2, metalness: 0.45 }));
      const matJoint = trackMat(new THREE.MeshStandardMaterial({ color: '#FFFFFF', roughness: 0.2, metalness: 0.6 }));
      const matArc = trackMat(new THREE.MeshStandardMaterial({ color: '#BFE8FF', roughness: 0.3, transparent: true, opacity: 0.45, side: THREE.DoubleSide }));

      const baseMesh = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.08, 1, 20)), matBase);
      const oppMesh = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.08, 0.08, 1, 20)), matOpp);
      const hypMesh = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(0.09, 0.09, 1, 20)), matHyp);

      const jA = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.15, 20, 20)), matJoint);
      const jB = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.15, 20, 20)), matJoint);
      const jC = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(0.15, 20, 20)), matJoint);

      const rightBox = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(0.28, 0.28, 0.14)),
        trackMat(new THREE.MeshStandardMaterial({ color: '#10B981', roughness: 0.3, transparent: true, opacity: 0.7 }))
      );

      const arcMesh = new THREE.Mesh(trackGeo(new THREE.CircleGeometry(0.95, 32, 0, Math.PI / 4)), matArc);
      arcMesh.position.copy(origin);

      const fillTriGeo = trackGeo(new THREE.BufferGeometry());
      const fillTriMat = trackMat(
        new THREE.MeshStandardMaterial({
          color: '#263B91',
          transparent: true,
          opacity: 0.35,
          side: THREE.DoubleSide,
          roughness: 0.5,
        })
      );
      const fillTriMesh = new THREE.Mesh(fillTriGeo, fillTriMat);

      rootGroup.add(baseMesh, oppMesh, hypMesh, jA, jB, jC, rightBox, arcMesh, fillTriMesh);

      const alignRod = (mesh: THREE.Mesh, start: THREE.Vector3, end: THREE.Vector3) => {
        const diff = new THREE.Vector3().subVectors(end, start);
        const len = Math.max(diff.length(), 0.01);
        mesh.position.copy(start).addScaledVector(diff, 0.5);
        mesh.scale.set(1, len, 1);
        mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), diff.normalize());
      };

      let lastTheta = -1;
      updateSceneFn = (dt, elapsed, p) => {
        const thetaDeg = THREE.MathUtils.clamp(p, 15, 75);
        const thetaRad = THREE.MathUtils.degToRad(thetaDeg);
        const adj = hypLen * Math.cos(thetaRad);
        const opp = hypLen * Math.sin(thetaRad);

        const pA = origin;
        const pB = new THREE.Vector3(origin.x + adj, origin.y, 0);
        const pC = new THREE.Vector3(origin.x + adj, origin.y + opp, 0);

        jA.position.copy(pA);
        jB.position.copy(pB);
        jC.position.copy(pC);
        alignRod(baseMesh, pA, pB);
        alignRod(oppMesh, pB, pC);
        alignRod(hypMesh, pA, pC);

        rightBox.position.set(pB.x - 0.16, pB.y + 0.16, 0);

        fillTriGeo.setAttribute(
          'position',
          new THREE.Float32BufferAttribute([pA.x, pA.y, 0, pB.x, pB.y, 0, pC.x, pC.y, 0], 3)
        );
        fillTriGeo.computeVertexNormals();

        if (Math.abs(lastTheta - thetaDeg) > 0.25) {
          lastTheta = thetaDeg;
          arcMesh.geometry.dispose();
          arcMesh.geometry = trackGeo(new THREE.CircleGeometry(0.9, 28, 0, thetaRad));
        }

        const targetY = playingRef.current ? Math.sin(elapsed * 0.45) * 0.18 : 0;
        rootGroup.rotation.y = THREE.MathUtils.damp(rootGroup.rotation.y, targetY, 4, dt);
      };
    } else if (sceneType === 'newton_orbit') {
      const sun = new THREE.Mesh(
        trackGeo(new THREE.SphereGeometry(0.68, 32, 32)),
        trackMat(new THREE.MeshStandardMaterial({ color: '#F59E0B', emissive: '#D97706', emissiveIntensity: 0.7, roughness: 0.2 }))
      );
      const planet = new THREE.Mesh(
        trackGeo(new THREE.SphereGeometry(0.28, 28, 28)),
        trackMat(new THREE.MeshStandardMaterial({ color: '#38BDF8', roughness: 0.3, metalness: 0.25 }))
      );
      const orbitRing = new THREE.Mesh(
        trackGeo(new THREE.TorusGeometry(2.4, 0.025, 16, 80)),
        trackMat(new THREE.MeshStandardMaterial({ color: '#BFE8FF', transparent: true, opacity: 0.5 }))
      );
      orbitRing.rotation.x = Math.PI / 2;

      const gravArrow = new THREE.ArrowHelper(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(2.4, 0, 0), 1.0, 0xf43f5e, 0.22, 0.14);
      const velArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, -1), new THREE.Vector3(2.4, 0, 0), 1.1, 0x10b981, 0.22, 0.14);

      rootGroup.add(sun, planet, orbitRing, gravArrow, velArrow);

      let angle = 0;
      updateSceneFn = (dt, _elapsed, p) => {
        const radius = 1.6 + (p / 100) * 1.5;
        const omega = 2.6 / Math.pow(radius, 1.15);
        if (playingRef.current) {
          angle += dt * omega;
        }
        orbitRing.scale.set(radius / 2.4, radius / 2.4, 1);

        const px = Math.cos(angle) * radius;
        const pz = Math.sin(angle) * radius;
        planet.position.set(px, 0, pz);

        const toCenter = new THREE.Vector3(-px, 0, -pz).normalize();
        const tangent = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)).normalize();
        gravArrow.position.copy(planet.position);
        gravArrow.setDirection(toCenter);
        gravArrow.setLength(THREE.MathUtils.clamp(2.3 / radius, 0.65, 1.35), 0.22, 0.14);

        velArrow.position.copy(planet.position);
        velArrow.setDirection(tangent);
        velArrow.setLength(THREE.MathUtils.clamp(omega * 0.9, 0.7, 1.4), 0.22, 0.14);
      };
    } else if (sceneType === 'algebra_geometry') {
      const a = 1.35;
      const b = 0.75;
      const cubeData = [
        { pos: [-b / 2, -b / 2, -b / 2], size: [a, a, a], color: '#263B91' },
        { pos: [a / 2, -b / 2, -b / 2], size: [b, a, a], color: '#38BDF8' },
        { pos: [-b / 2, a / 2, -b / 2], size: [a, b, a], color: '#38BDF8' },
        { pos: [-b / 2, -b / 2, a / 2], size: [a, a, b], color: '#38BDF8' },
        { pos: [a / 2, a / 2, -b / 2], size: [b, b, a], color: '#F59E0B' },
        { pos: [a / 2, -b / 2, a / 2], size: [b, a, b], color: '#F59E0B' },
        { pos: [-b / 2, a / 2, a / 2], size: [a, b, b], color: '#F59E0B' },
        { pos: [a / 2, a / 2, a / 2], size: [b, b, b], color: '#10B981' },
      ];

      const blocks = cubeData.map((cfg) => {
        const mesh = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(cfg.size[0], cfg.size[1], cfg.size[2])),
          trackMat(new THREE.MeshStandardMaterial({ color: cfg.color, roughness: 0.28, metalness: 0.15 }))
        );
        mesh.userData.basePos = new THREE.Vector3(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
        rootGroup.add(mesh);
        return mesh;
      });
      rootGroup.position.y = 0.35;

      updateSceneFn = (dt, _elapsed, p) => {
        const explode = (p / 100) * 0.95;
        blocks.forEach((m) => {
          const base = m.userData.basePos as THREE.Vector3;
          const dir = base.clone().normalize();
          const target = base.clone().addScaledVector(dir, explode);
          m.position.lerp(target, Math.min(1, dt * 8));
        });
        if (playingRef.current) {
          rootGroup.rotation.y += dt * 0.35;
        }
      };
    } else {
      const nucleusGroup = new THREE.Group();
      const protonMat = trackMat(new THREE.MeshStandardMaterial({ color: '#F43F5E', roughness: 0.25 }));
      const neutronMat = trackMat(new THREE.MeshStandardMaterial({ color: '#38BDF8', roughness: 0.25 }));
      const nucleonGeo = trackGeo(new THREE.SphereGeometry(0.16, 18, 18));
      const offsets = [
        [0, 0, 0],
        [0.18, 0.1, 0.08],
        [-0.16, 0.12, -0.06],
        [0.06, -0.17, 0.12],
        [-0.08, -0.12, -0.15],
        [0.14, -0.04, -0.14],
      ];
      offsets.forEach((off, idx) => {
        const sp = new THREE.Mesh(nucleonGeo, idx % 2 === 0 ? protonMat : neutronMat);
        sp.position.set(off[0], off[1], off[2]);
        nucleusGroup.add(sp);
      });
      rootGroup.add(nucleusGroup);

      const shells: Array<{ ring: THREE.Mesh; electron: THREE.Mesh; radius: number; speed: number }> = [];
      const radii = [1.2, 1.9, 2.55];
      const tilts: Array<[number, number]> = [
        [0.35, 0.2],
        [-0.75, 0.5],
        [1.1, -0.45],
      ];
      radii.forEach((r, idx) => {
        const shellGroup = new THREE.Group();
        shellGroup.rotation.set(tilts[idx][0], 0, tilts[idx][1]);
        const ring = new THREE.Mesh(
          trackGeo(new THREE.TorusGeometry(r, 0.02, 14, 72)),
          trackMat(new THREE.MeshStandardMaterial({ color: '#BFE8FF', transparent: true, opacity: 0.48 }))
        );
        ring.rotation.x = Math.PI / 2;
        const electron = new THREE.Mesh(
          trackGeo(new THREE.SphereGeometry(0.13, 18, 18)),
          trackMat(new THREE.MeshStandardMaterial({ color: '#FACC15', emissive: '#EAB308', emissiveIntensity: 0.65 }))
        );
        shellGroup.add(ring, electron);
        rootGroup.add(shellGroup);
        shells.push({ ring, electron, radius: r, speed: 2.2 - idx * 0.45 });
      });
      rootGroup.position.y = 0.25;

      let phase = 0;
      updateSceneFn = (dt, _elapsed, p) => {
        const speedMul = 0.4 + (p / 100) * 2.0;
        if (playingRef.current) {
          phase += dt * speedMul;
          nucleusGroup.rotation.y += dt * 0.7;
        }
        shells.forEach((s, idx) => {
          const ang = phase * s.speed + idx * 2.1;
          s.electron.position.set(Math.cos(ang) * s.radius, 0, Math.sin(ang) * s.radius);
        });
      };
    }

    const handleResize = () => {
      if (!container) return;
      const w = Math.max(container.clientWidth, 1);
      const h = Math.max(container.clientHeight, 1);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    const clock = new THREE.Clock();
    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      updateSceneFn(dt, clock.elapsedTime, paramRef.current);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      envTarget.dispose();
      pmrem.dispose();
      renderer.dispose();
    };
  }, [sceneType, customBlueprint]);

  const readoutText = (() => {
    if (sceneType === 'ai_custom' && customBlueprint) {
      const label = language === 'bn' ? customBlueprint.sliderLabelBn : customBlueprint.sliderLabel;
      const activeLabel = selectedPart
        ? ` · ${language === 'bn' ? selectedPart.labelBn || selectedPart.label : selectedPart.label}`
        : '';
      return `${language === 'bn' ? customBlueprint.titleBn : customBlueprint.title} | ${label}: ${Math.round(paramValue)}${activeLabel}`;
    }
    if (sceneType === 'trigonometry_triangle') {
      const deg = Math.round(paramValue);
      const rad = (deg * Math.PI) / 180;
      return `θ = ${deg}°  |  sin θ = ${Math.sin(rad).toFixed(2)}  |  cos θ = ${Math.cos(rad).toFixed(2)}  |  tan θ = ${Math.tan(rad).toFixed(2)}`;
    }
    if (sceneType === 'newton_orbit') {
      const r = (1.6 + (paramValue / 100) * 1.5).toFixed(2);
      return `${language === 'bn' ? 'কক্ষপথ ব্যাসার্ধ' : 'Orbit Radius'}: ${r} AU  |  F ∝ 1/r²`;
    }
    if (sceneType === 'algebra_geometry') {
      return `(a + b)³ = a³ + 3a²b + 3ab² + b³  (${Math.round(paramValue)}% ${language === 'bn' ? 'বিভাজন' : 'expanded'})`;
    }
    return `${language === 'bn' ? 'ইলেকট্রন গতি' : 'Orbital Velocity'}: ${(0.4 + (paramValue / 100) * 2).toFixed(1)}x`;
  })();

  const sliderMin = sceneType === 'ai_custom' ? customBlueprint?.sliderMin ?? 0 : sceneType === 'trigonometry_triangle' ? 15 : 0;
  const sliderMax = sceneType === 'ai_custom' ? customBlueprint?.sliderMax ?? 100 : sceneType === 'trigonometry_triangle' ? 75 : 100;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl bg-[#091332]">
      {webglError ? (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-200">{webglError}</div>
      ) : (
        <div ref={mountRef} className="h-full w-full" />
      )}

      {/* Top Left Status Pill (Solid surface, no backdrop-blur over WebGL) */}
      <div className="pointer-events-none absolute left-3 top-3 right-32 flex flex-col items-start gap-1.5">
        <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-xl border border-white/15 bg-[#091332]/92 px-3 py-1.5 text-[11px] font-semibold text-[#BFE8FF]">
          <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
          <span className="truncate font-mono-nums">{readoutText}</span>
        </div>

        {/* AI Scene Part Legend Strip */}
        {sceneType === 'ai_custom' && customBlueprint?.objects && customBlueprint.objects.length > 0 && (
          <div className="pointer-events-auto flex max-w-full flex-wrap gap-1.5">
            {customBlueprint.objects.slice(0, 6).map((obj, idx) => (
              <button
                key={`${obj.label}-${idx}`}
                type="button"
                onClick={() => setSelectedPart(obj)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-0.5 text-[10px] font-semibold transition ${
                  selectedPart?.label === obj.label
                    ? 'border-[#BFE8FF] bg-[#172554] text-white'
                    : 'border-white/15 bg-[#091332]/90 text-slate-200 hover:border-white/40'
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: obj.color || '#38BDF8' }} />
                <span>{language === 'bn' ? obj.labelBn || obj.label : obj.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Top Right Quick Buttons */}
      <div className="absolute right-3 top-3 flex items-center gap-1.5">
        {onAskAi && (
          <button
            type="button"
            onClick={onAskAi}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#BFE8FF] px-3 py-1.5 text-[11px] font-bold text-[#172554] shadow-sm transition hover:bg-white"
          >
            <Bot className="h-3.5 w-3.5" />
            <span>{language === 'bn' ? '৩ডি এআই গাইড' : 'AI 3D Guide'}</span>
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowHud((v) => !v)}
          aria-label="Toggle 3D controls"
          className="rounded-xl border border-white/15 bg-[#091332]/90 p-1.5 text-white hover:bg-[#172554]"
        >
          {showHud ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>

      {/* Collapsible Bottom Control Dock */}
      {showHud && (
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/15 bg-[#091332]/92 px-3.5 py-2.5 text-xs text-white">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-[#263B91] text-white hover:bg-[#3551bd]"
              title={playing ? 'Pause' : 'Play'}
            >
              {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => resetCamFnRef.current?.()}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-slate-200 hover:bg-white/10"
              title="Reset Camera"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
            <select
              value={sceneType}
              onChange={(e) => {
                const next = e.target.value as ThreeDSceneType;
                setSceneType(next);
                setParamValue(
                  next === 'ai_custom'
                    ? customBlueprint?.sliderDefault ?? 50
                    : next === 'trigonometry_triangle'
                      ? 35
                      : 55
                );
              }}
              className="max-w-[180px] rounded-lg border border-white/15 bg-[#111f4d] px-2.5 py-1.5 text-[11px] font-medium text-white focus:outline-none"
            >
              {sceneOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {language === 'bn' ? opt.labelBn : opt.labelEn}
                </option>
              ))}
            </select>
          </div>

          <div className="flex min-w-[160px] flex-1 items-center gap-2.5 sm:max-w-xs">
            <span className="whitespace-nowrap text-[11px] text-[#BFE8FF]">
              {sceneType === 'ai_custom' && customBlueprint
                ? language === 'bn'
                  ? customBlueprint.sliderLabelBn
                  : customBlueprint.sliderLabel
                : sceneType === 'trigonometry_triangle'
                  ? language === 'bn'
                    ? 'কোণ θ'
                    : 'Angle θ'
                  : language === 'bn'
                    ? 'নিয়ন্ত্রণ'
                    : 'Control'}
            </span>
            <input
              type="range"
              min={sliderMin}
              max={sliderMax}
              value={paramValue}
              onChange={(e) => setParamValue(Number(e.target.value))}
              className="h-1.5 w-full cursor-pointer accent-[#BFE8FF]"
            />
          </div>
        </div>
      )}
    </div>
  );
};
