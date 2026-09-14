import type { BLEND_MODES } from "pixi.js";
import {
  Application,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Texture,
  type Ticker,
} from "pixi.js";
import type {
  BurstConfig,
  GradientStop,
  ParticleConfig,
  ShapeConfig,
  SpawnerData,
  VFXData,
} from "./types";
import { DEFAULT_SHAPE, normalizeParticleConfig } from "./types";

/** Evaluate curve [[t,v],...] at normalized t in [0,1] */
function evaluateCurve(curve: number[][], t: number): number {
  if (!curve?.length) return 1;
  const sorted = [...curve].sort((a, b) => a[0] - b[0]);
  if (t <= sorted[0][0]) return sorted[0][1];
  if (t >= sorted[sorted.length - 1][0]) return sorted[sorted.length - 1][1];
  for (let i = 0; i < sorted.length - 1; i++) {
    const [t0, v0] = sorted[i];
    const [t1, v1] = sorted[i + 1];
    if (t >= t0 && t <= t1) {
      const u = (t - t0) / (t1 - t0);
      return v0 + (v1 - v0) * u;
    }
  }
  return sorted[0][1];
}

/** Sample gradient at normalized t in [0,1], returns {r,g,b,a} 0-255 */
function sampleGradient(
  stops: GradientStop[],
  t: number,
): {
  r: number;
  g: number;
  b: number;
  a: number;
} {
  if (!stops?.length) return { r: 255, g: 255, b: 255, a: 255 };
  const sorted = [...stops].sort((a, b) => a.t - b.t);
  if (t <= sorted[0].t)
    return {
      r: sorted[0].r,
      g: sorted[0].g,
      b: sorted[0].b,
      a: sorted[0].a,
    };
  if (t >= sorted[sorted.length - 1].t) {
    const last = sorted[sorted.length - 1];
    return { r: last.r, g: last.g, b: last.b, a: last.a };
  }
  for (let i = 0; i < sorted.length - 1; i++) {
    const s0 = sorted[i];
    const s1 = sorted[i + 1];
    if (t >= s0.t && t <= s1.t) {
      const u = (t - s0.t) / (s1.t - s0.t);
      return {
        r: Math.round(s0.r + (s1.r - s0.r) * u),
        g: Math.round(s0.g + (s1.g - s0.g) * u),
        b: Math.round(s0.b + (s1.b - s0.b) * u),
        a: s0.a + (s1.a - s0.a) * u,
      };
    }
  }
  return { r: 255, g: 255, b: 255, a: 255 };
}

interface Particle {
  particle: Sprite;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  angularVelocity: number;
  startScale: number;
  endScale: number;
  startAlpha: number;
  endAlpha: number;
  spawnAngle?: number;
  trailVertices?: { x: number; y: number; life: number; maxLife: number }[];
  lastTrailX?: number;
  lastTrailY?: number;
  startR: number;
  startG: number;
  startB: number;
}

interface RuntimeSpawner {
  id: string;
  name: string;
  data: SpawnerData;
  config: ParticleConfig;
  container: Container;
  trailGraphics: Graphics;
  particles: Particle[];
  texture: Texture;
  enabled: boolean;
  spawnX: number;
  spawnY: number;
  emitterLife: number;
  emitterMaxLife: number;
  isEmitterDead: boolean;
  hasBurst: boolean;
  burstsTriggered: Set<string>;
  delayTimer: number;
  hasStarted: boolean;
  timeSinceLastSpawn: number;
}

function deepCloneConfig(config: ParticleConfig): ParticleConfig {
  const c = normalizeParticleConfig(config);
  return {
    ...c,
    colorStart: { ...c.colorStart },
    colorEnd: { ...c.colorEnd },
    shape: c.shape ? { ...DEFAULT_SHAPE, ...c.shape } : { ...DEFAULT_SHAPE },
    bursts: c.bursts ? c.bursts.map((b) => ({ ...b })) : undefined,
    velocityOverLifetime: c.velocityOverLifetime
      ? { ...c.velocityOverLifetime }
      : undefined,
    noise: c.noise ? { ...c.noise } : undefined,
    limitVelocity: c.limitVelocity ? { ...c.limitVelocity } : undefined,
    forceOverLifetime: c.forceOverLifetime
      ? { ...c.forceOverLifetime }
      : undefined,
    startColorKeys: c.startColorKeys ? [...c.startColorKeys] : undefined,
  };
}

/** Pick start color for a particle (constant or random from keys) */
function getStartColor(config: ParticleConfig): {
  r: number;
  g: number;
  b: number;
} {
  const mode = config.startColorMode ?? "constant";
  if (mode === "constant") {
    return { ...config.colorStart };
  }
  const keys = config.startColorKeys;
  if (!keys?.length) {
    return Math.random() < 0.5
      ? { ...config.colorStart }
      : { ...config.colorEnd };
  }
  const idx = Math.floor(Math.random() * keys.length);
  const k = keys[idx];
  return { r: k.r, g: k.g, b: k.b };
}

/** Get spawn position (offset from center) and velocity angle from shape */
function getShapeSpawn(
  shape: ShapeConfig,
  spawnX: number,
  spawnY: number,
): { x: number; y: number; angle: number } {
  const sh = { ...DEFAULT_SHAPE, ...shape };
  const type = sh.type ?? "point";
  const radius = sh.radius ?? 10;
  const radiusThickness = sh.radiusThickness ?? 0;
  const arc = ((sh.arc ?? 360) * Math.PI) / 180;
  const angleDeg = sh.angle ?? 270;
  const baseAngle = (angleDeg * Math.PI) / 180;

  if (type === "point") {
    return { x: spawnX, y: spawnY, angle: baseAngle };
  }

  if (type === "circle") {
    const arcStart = -arc / 2;
    const theta = arcStart + Math.random() * arc;
    const rMin = radius * (1 - (radiusThickness ?? 0));
    const r = rMin + Math.random() * (radius - rMin) || radius;
    const x = spawnX + Math.cos(theta) * r;
    const y = spawnY + Math.sin(theta) * r;
    const outAngle = theta;
    return { x, y, angle: outAngle };
  }

  if (type === "rectangle") {
    const w = (sh.width ?? 10) / 2;
    const h = (sh.height ?? 10) / 2;
    const x = spawnX + (Math.random() - 0.5) * w * 2;
    const y = spawnY + (Math.random() - 0.5) * h * 2;
    return { x, y, angle: baseAngle };
  }

  if (type === "edge") {
    const len = sh.radius ?? 10;
    const thickness = sh.radiusThickness ?? 0;
    const t = Math.random();
    const angleRad = ((sh.angle ?? 0) * Math.PI) / 180;
    const along = (t - 0.5) * len;
    const width = thickness * len;
    const perpOffset = width > 0 ? (Math.random() - 0.5) * width : 0;
    const perpX = -Math.sin(angleRad) * perpOffset;
    const perpY = Math.cos(angleRad) * perpOffset;
    const x = spawnX + Math.cos(angleRad) * along + perpX;
    const y = spawnY + Math.sin(angleRad) * along + perpY;
    const perpAngle = angleRad + Math.PI / 2;
    return { x, y, angle: perpAngle };
  }

  if (type === "cone") {
    const coneSpread = ((sh.coneAngle ?? 30) * Math.PI) / 180;
    const arcStart = baseAngle - coneSpread / 2;
    const theta = arcStart + Math.random() * coneSpread;
    const rMin = radius * (1 - (radiusThickness ?? 0));
    const r = rMin + Math.random() * (radius - rMin) || radius;
    const x = spawnX + Math.cos(theta) * r;
    const y = spawnY + Math.sin(theta) * r;
    return { x, y, angle: theta };
  }

  return { x: spawnX, y: spawnY, angle: baseAngle };
}

function createProceduralTexture(): Texture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const gradient = ctx.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.5, "rgba(255, 255, 255, 0.5)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  return Texture.from(canvas);
}

async function loadTexture(
  textureName: string,
  cache: Map<string, Texture>,
  basePath: string,
): Promise<Texture> {
  if (cache.has(textureName)) {
    return cache.get(textureName)!;
  }
  const path = basePath.replace(/\/?$/, "/") + textureName;
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = reject;
      image.src = path;
    });
    const texture = Texture.from(image);
    cache.set(textureName, texture);
    return texture;
  } catch {
    const texture = createProceduralTexture();
    cache.set(textureName, texture);
    return texture;
  }
}

export interface ParticleRuntimeOptions {
  isPreview?: boolean;
  /** Base path for textures (default: '/assets/vfx/') */
  assetBasePath?: string;
}

export function createParticleRuntime(
  app: Application,
  options: ParticleRuntimeOptions = {},
) {
  const { isPreview = false, assetBasePath = "/assets/vfx/" } = options;
  const spawners: RuntimeSpawner[] = [];
  const textureCache = new Map<string, Texture>();
  const frameTextureCache = new Map<string, Texture[]>();
  let viewWidth = 0;
  let viewHeight = 0;
  let totalTime = 0;

  function getFrameTextures(
    baseTexture: Texture,
    tilesX: number,
    tilesY: number,
  ): Texture[] {
    const key = `${baseTexture.source.uid}-${tilesX}-${tilesY}`;
    if (frameTextureCache.has(key)) return frameTextureCache.get(key)!;
    const frames: Texture[] = [];
    const w = baseTexture.width;
    const h = baseTexture.height;
    const fw = w / tilesX;
    const fh = h / tilesY;
    for (let row = 0; row < tilesY; row++) {
      for (let col = 0; col < tilesX; col++) {
        const frame = new Rectangle(col * fw, row * fh, fw, fh);
        const tex = new Texture({ source: baseTexture.source, frame });
        frames.push(tex);
      }
    }
    frameTextureCache.set(key, frames);
    return frames;
  }

  /** 2D value noise for turbulence; returns -1..1 (fixed hash for unbiased output) */
  function noise2d(x: number, y: number): number {
    const ix = Math.floor(x) & 255;
    const iy = Math.floor(y) & 255;
    const fx = x - Math.floor(x);
    const fy = y - Math.floor(y);
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const hash = (i: number, j: number): number => {
      const h = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453;
      return ((h % 1) + 1) % 1;
    };
    const a = hash(ix, iy);
    const b = hash(ix + 1, iy);
    const c = hash(ix, iy + 1);
    const d = hash(ix + 1, iy + 1);
    return (
      (a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v) *
        2 -
      1
    );
  }

  /**
   * Curl noise (Unity-style): divergence-free turbulence.
   * Uses curl of scalar noise so there is no net drift—particles
   * get perturbed along their path, not pulled in a direction.
   */
  function sampleCurlNoise(
    x: number,
    y: number,
    octaves: number,
    octaveMult: number,
    octaveScale: number,
  ): { nx: number; ny: number } {
    const EPS = 0.5;
    let vx = 0;
    let vy = 0;
    let amp = 1;
    let freq = 1;
    let totalAmp = 0;
    for (let o = 0; o < octaves; o++) {
      const ox = x * freq + o * 127.1;
      const oy = y * freq + o * 311.7;
      const dsdx = (noise2d(ox + EPS, oy) - noise2d(ox - EPS, oy)) / (2 * EPS);
      const dsdy = (noise2d(ox, oy + EPS) - noise2d(ox, oy - EPS)) / (2 * EPS);
      vx += dsdy * amp;
      vy -= dsdx * amp;
      totalAmp += amp;
      amp *= octaveMult;
      freq *= octaveScale;
    }
    const inv = 1 / totalAmp;
    return { nx: vx * inv, ny: vy * inv };
  }

  async function loadVFXData(vfxData: VFXData): Promise<void> {
    // Clear existing
    for (const s of spawners) {
      for (const p of s.particles) {
        p.particle.destroy();
      }
      s.container.destroy({ children: true });
      app.stage.removeChild(s.container);
    }
    spawners.length = 0;

    viewWidth = app.screen.width;
    viewHeight = app.screen.height;
    const centerX = viewWidth / 2;
    const centerY = viewHeight / 2;

    for (const spawnerData of vfxData.spawners ?? []) {
      if (!spawnerData.visible) continue;

      const config = deepCloneConfig(spawnerData.config as ParticleConfig);
      if (isPreview) {
        config.spawnRate = Math.min(config.spawnRate, 50);
        config.maxParticles = Math.min(config.maxParticles, 100);
      }

      const texture = await loadTexture(
        config.textureName,
        textureCache,
        assetBasePath,
      );
      const container = new Container();
      const trailGraphics = new Graphics();
      container.addChild(trailGraphics);
      app.stage.addChild(container);

      const emitterLifeVar =
        (Math.random() - 0.5) * config.emitterLifetimeVariance * 2;
      const emitterMaxLife =
        config.emitterLifetime > 0
          ? config.emitterLifetime * (1 + emitterLifeVar)
          : 0;

      // Spawn at center + spawner offset (center-relative coordinates)
      const offsetX = spawnerData.position?.x ?? 0;
      const offsetY = spawnerData.position?.y ?? 0;
      const spawnX = centerX + offsetX;
      const spawnY = centerY + offsetY;

      const spawner: RuntimeSpawner = {
        id: spawnerData.id ?? `spawner_${Date.now()}`,
        name: spawnerData.name ?? "Spawner",
        data: spawnerData,
        config,
        container,
        trailGraphics,
        particles: [],
        texture,
        enabled: true,
        spawnX,
        spawnY,
        emitterLife: 0,
        emitterMaxLife,
        isEmitterDead: false,
        hasBurst: false,
        burstsTriggered: new Set(),
        delayTimer: 0,
        hasStarted: config.emitterStartDelay === 0,
        timeSinceLastSpawn: 0,
      };
      spawners.push(spawner);
    }
  }

  function spawnParticlesForSpawner(
    spawner: RuntimeSpawner,
    count?: number,
  ): void {
    const n = count ?? spawner.config.particlesPerWave;
    const shape = spawner.config.shape ?? { ...DEFAULT_SHAPE };
    for (let i = 0; i < n; i++) {
      const {
        x: spawnPx,
        y: spawnPy,
        angle: shapeAngle,
      } = getShapeSpawn(shape, spawner.spawnX, spawner.spawnY);

      const particle = new Sprite(spawner.texture);
      particle.x = spawnPx;
      particle.y = spawnPy;
      particle.anchor.set(0.5);

      const baseAngle = (spawner.config.angle * Math.PI) / 180;
      const angleVar =
        ((Math.random() - 0.5) * spawner.config.angleVariance * Math.PI) / 180;
      const dirFromShape =
        shape.type === "point" ? baseAngle + angleVar : shapeAngle + angleVar;
      const randomizeDir = shape.randomizeDirection ?? 0;
      const randomAngle = Math.random() * Math.PI * 2;
      const velocityAngle =
        dirFromShape * (1 - randomizeDir) + randomAngle * randomizeDir;

      const baseSpeed = spawner.config.speed;
      const speedVar = (Math.random() - 0.5) * spawner.config.speedVariance * 2;
      const speed = baseSpeed + speedVar * baseSpeed;

      const textureSize = spawner.texture.width;
      let startScale: number;
      let endScale: number;
      if (spawner.config.sizeMode === "pixels") {
        startScale = spawner.config.sizeStartPixels / textureSize;
        endScale = spawner.config.sizeEndPixels / textureSize;
      } else {
        startScale = spawner.config.scaleStart;
        endScale = spawner.config.scaleEnd;
      }
      const scaleVar = (Math.random() - 0.5) * spawner.config.scaleVariance * 2;
      startScale *= 1 + scaleVar;
      endScale *= 1 + scaleVar;

      const particleLifeVar =
        (Math.random() - 0.5) * spawner.config.particleLifetimeVariance * 2;
      const particleLifetime =
        spawner.config.particleLifetime * (1 + particleLifeVar);

      const startColor = getStartColor(spawner.config);
      particle.scale.set(startScale);
      particle.tint = (startColor.r << 16) | (startColor.g << 8) | startColor.b;
      particle.alpha = spawner.config.alphaStart;
      particle.blendMode = spawner.config.blendMode as BLEND_MODES;
      const baseRotation = shape.alignToDirection ? velocityAngle : 0;
      const startRotationVar =
        (Math.random() - 0.5) * spawner.config.rotationVariance * 2 * 180;
      const startRotationDeg = spawner.config.rotationStart + startRotationVar;
      const startRotationRad = (startRotationDeg * Math.PI) / 180;
      particle.rotation = baseRotation + startRotationRad;

      // rotationSpeed is in deg/s; convert to rad/s for PixiJS
      let angularVelocity = (spawner.config.rotationSpeed * Math.PI) / 180;
      const rotationVar =
        (Math.random() - 0.5) * spawner.config.rotationVariance * 2;
      angularVelocity *= 1 + rotationVar;
      if (spawner.config.rotationDirection === "clockwise") {
        angularVelocity = Math.abs(angularVelocity);
      } else if (spawner.config.rotationDirection === "counter-clockwise") {
        angularVelocity = -Math.abs(angularVelocity);
      } else if (spawner.config.rotationDirection === "random") {
        angularVelocity *= Math.random() < 0.5 ? 1 : -1;
      }

      const dx = spawnPx - spawner.spawnX;
      const dy = spawnPy - spawner.spawnY;
      const spawnAngle =
        dx !== 0 || dy !== 0 ? Math.atan2(dy, dx) : velocityAngle;

      const trailsCfg = spawner.config.trails;
      const hasTrail =
        trailsCfg?.enabled && Math.random() < (trailsCfg.ratio ?? 1);

      spawner.container.addChild(particle);
      spawner.particles.push({
        particle,
        vx: Math.cos(velocityAngle) * speed,
        vy: Math.sin(velocityAngle) * speed,
        life: 0,
        maxLife: particleLifetime,
        angularVelocity,
        startScale,
        endScale,
        startAlpha: spawner.config.alphaStart,
        endAlpha: spawner.config.alphaEnd,
        spawnAngle,
        trailVertices: hasTrail ? [] : undefined,
        lastTrailX: hasTrail ? spawnPx : undefined,
        lastTrailY: hasTrail ? spawnPy : undefined,
        startR: startColor.r,
        startG: startColor.g,
        startB: startColor.b,
      });
    }
  }

  function spawnParticlesForSpawners(delta: number): void {
    for (const spawner of spawners) {
      if (!spawner.enabled || !spawner.config.emitting) continue;
      if (!spawner.hasStarted) continue;
      if (spawner.isEmitterDead) continue;
      if (spawner.particles.length >= spawner.config.maxParticles) continue;

      const bursts = spawner.config.bursts;
      const hasTimedBursts = bursts && bursts.length > 0;

      if (hasTimedBursts) {
        for (let bi = 0; bi < bursts!.length; bi++) {
          const b = bursts![bi];
          const cycles = b.cycles ?? 1;
          const interval = b.interval ?? 0;
          const prob = b.probability ?? 1;
          for (let c = 0; c < cycles; c++) {
            const t = b.time + c * interval;
            const key = `${bi}:${c}`;
            if (spawner.emitterLife >= t && !spawner.burstsTriggered.has(key)) {
              spawner.burstsTriggered.add(key);
              if (Math.random() < prob) {
                const count = Math.min(
                  b.count,
                  spawner.config.maxParticles - spawner.particles.length,
                );
                for (let i = 0; i < count; i++) {
                  spawnParticlesForSpawner(spawner, 1);
                  if (spawner.particles.length >= spawner.config.maxParticles)
                    break;
                }
              }
            }
          }
        }
      }

      if (spawner.config.burst && !hasTimedBursts) {
        if (!spawner.hasBurst) {
          const particlesToSpawn = Math.min(
            spawner.config.maxParticles - spawner.particles.length,
            spawner.config.maxParticles,
          );
          for (let i = 0; i < particlesToSpawn; i++) {
            spawnParticlesForSpawner(spawner, 1);
          }
          spawner.hasBurst = true;
        }
        continue;
      }

      if (hasTimedBursts && !spawner.config.spawnRate) continue;

      const simSpeed = spawner.config.simulationSpeed ?? 1;
      spawner.timeSinceLastSpawn += delta * simSpeed;
      const spawnInterval = 1 / spawner.config.spawnRate;
      while (spawner.timeSinceLastSpawn >= spawnInterval) {
        spawner.timeSinceLastSpawn -= spawnInterval;
        spawnParticlesForSpawner(spawner);
      }
    }
  }

  function update(ticker: Ticker): void {
    let delta = ticker.deltaTime / 60;
    totalTime += delta;

    for (const spawner of spawners) {
      if (!spawner.enabled || !spawner.config.emitting) continue;
      const simSpeed = spawner.config.simulationSpeed ?? 1;
      const dSim = delta * simSpeed;

      if (!spawner.hasStarted) {
        spawner.delayTimer += dSim;
        if (spawner.delayTimer >= spawner.config.emitterStartDelay) {
          spawner.hasStarted = true;
        }
        continue;
      }

      const hasTimedBursts = spawner.config.bursts && spawner.config.bursts.length > 0;
      if (isPreview && spawner.config.burst && !hasTimedBursts && spawner.particles.length === 0 && spawner.hasBurst) {
        spawner.hasBurst = false;
      }

      if (!spawner.isEmitterDead) {
        spawner.emitterLife += dSim;
        if (
          spawner.emitterMaxLife > 0 &&
          spawner.emitterLife >= spawner.emitterMaxLife
        ) {
          spawner.isEmitterDead = true;
          if (spawner.config.loop) {
            spawner.emitterLife = 0;
            spawner.isEmitterDead = false;
            spawner.hasBurst = false;
            spawner.burstsTriggered.clear();
            spawner.delayTimer = 0;
            spawner.hasStarted = spawner.config.emitterStartDelay === 0;
            const emitterLifeVar =
              (Math.random() - 0.5) *
              spawner.config.emitterLifetimeVariance *
              2;
            spawner.emitterMaxLife =
              spawner.config.emitterLifetime > 0
                ? spawner.config.emitterLifetime * (1 + emitterLifeVar)
                : 0;
          }
        }
      }
    }

    spawnParticlesForSpawners(delta);

    for (const spawner of spawners) {
      const d = delta * (spawner.config.simulationSpeed ?? 1);
      const vol = spawner.config.velocityOverLifetime;
      const noiseCfg = spawner.config.noise;
      const limitCfg = spawner.config.limitVelocity;
      const forceCfg = spawner.config.forceOverLifetime;

      for (let i = spawner.particles.length - 1; i >= 0; i--) {
        const p = spawner.particles[i];
        p.life += d;

        if (p.life >= p.maxLife) {
          p.particle.destroy();
          spawner.particles.splice(i, 1);
          continue;
        }

        const lifeRatio = p.life / p.maxLife;

        if (spawner.config.acceleration !== 0) {
          const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
          if (speed > 0) {
            const dirX = p.vx / speed;
            const dirY = p.vy / speed;
            p.vx += dirX * spawner.config.acceleration * d * 60;
            p.vy += dirY * spawner.config.acceleration * d * 60;
          }
        }
        p.vy += spawner.config.gravity * d * 60;

        if (forceCfg) {
          p.vx += (forceCfg.x ?? 0) * d * 60;
          p.vy += (forceCfg.y ?? 0) * d * 60;
        }

        if (vol) {
          if (vol.linearX != null) p.vx += vol.linearX * d * 60;
          if (vol.linearY != null) p.vy += vol.linearY * d * 60;
          if (vol.orbital != null) {
            const dx = p.particle.x - spawner.spawnX;
            const dy = p.particle.y - spawner.spawnY;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const tangential = vol.orbital * d * 60;
            p.vx += (-dy / dist) * tangential;
            p.vy += (dx / dist) * tangential;
          }
          if (vol.radial != null) {
            const dx = p.particle.x - spawner.spawnX;
            const dy = p.particle.y - spawner.spawnY;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const radial = vol.radial * d * 60;
            p.vx += (dx / dist) * radial;
            p.vy += (dy / dist) * radial;
          }
          if (vol.speedModifier != null) {
            const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
            const mult = vol.speedModifier;
            p.vx *= mult;
            p.vy *= mult;
          }
        }

        if (noiseCfg?.enabled) {
          const baseFreq = Math.max(0.001, noiseCfg.frequency * 0.02);
          const scroll = totalTime * (noiseCfg.scrollSpeed ?? 0.5) * 5;
          const octaves = Math.max(1, noiseCfg.octaves ?? 1);
          const octaveMult = Math.max(
            0.1,
            Math.min(1, noiseCfg.octaveMultiplier ?? 0.5),
          );
          const octaveScale = Math.max(1.1, noiseCfg.octaveScale ?? 2);
          const { nx, ny } = sampleCurlNoise(
            p.particle.x * baseFreq + scroll,
            p.particle.y * baseFreq,
            octaves,
            octaveMult,
            octaveScale,
          );
          const strCurve = noiseCfg.strengthOverLifetime;
          const strMult = strCurve?.length
            ? evaluateCurve(strCurve, lifeRatio)
            : 1;
          const NOISE_STRENGTH_SCALE = 0.2;
          const str =
            (noiseCfg.strength ?? 1) * strMult * NOISE_STRENGTH_SCALE * d * 60;
          p.vx += nx * str;
          p.vy += ny * str;
        }

        if (limitCfg?.enabled) {
          const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
          if (speed > limitCfg.speedLimit && limitCfg.speedLimit > 0) {
            const newSpeed =
              limitCfg.speedLimit +
              (speed - limitCfg.speedLimit) * (1 - limitCfg.dampen);
            const scale = newSpeed / speed;
            p.vx *= scale;
            p.vy *= scale;
          }
          if (limitCfg.drag !== 0) {
            const drag = Math.max(0, 1 - limitCfg.drag * d);
            p.vx *= drag;
            p.vy *= drag;
          }
        }

        p.particle.x += p.vx * d * 60;
        p.particle.y += p.vy * d * 60;

        const sizeCurve = spawner.config.sizeOverLifetime;
        const baseScale =
          p.startScale + (p.endScale - p.startScale) * lifeRatio;
        const scaleMult = sizeCurve?.length
          ? evaluateCurve(sizeCurve, lifeRatio)
          : 1;
        p.particle.scale.set(baseScale * scaleMult);

        const colorEnabled = spawner.config.colorOverLifetimeEnabled !== false;
        const colorGrad = spawner.config.colorOverLifetime;
        let r: number;
        let g: number;
        let b: number;
        let alpha: number;
        if (!colorEnabled) {
          r = p.startR;
          g = p.startG;
          b = p.startB;
          alpha = p.startAlpha;
        } else if (colorGrad?.length) {
          const sampled = sampleGradient(colorGrad, lifeRatio);
          r = sampled.r;
          g = sampled.g;
          b = sampled.b;
          alpha = sampled.a;
        } else {
          const ec = spawner.config.colorEnd;
          r = Math.round(p.startR + (ec.r - p.startR) * lifeRatio);
          g = Math.round(p.startG + (ec.g - p.startG) * lifeRatio);
          b = Math.round(p.startB + (ec.b - p.startB) * lifeRatio);
          alpha = p.startAlpha + (p.endAlpha - p.startAlpha) * lifeRatio;
        }
        p.particle.tint = (r << 16) | (g << 8) | b;
        p.particle.alpha = alpha;

        const rotCurve = spawner.config.rotationOverLifetime;
        const angVel = rotCurve?.length
          ? (evaluateCurve(rotCurve, lifeRatio) * Math.PI) / 180
          : p.angularVelocity;
        p.particle.rotation += angVel * d;

        const texSheet = spawner.config.textureSheetAnimation;
        if (texSheet?.tilesX && texSheet?.tilesY) {
          const totalFrames = texSheet.tilesX * texSheet.tilesY;
          const frameProgress = texSheet.frameOverTime?.length
            ? evaluateCurve(texSheet.frameOverTime, lifeRatio)
            : lifeRatio;
          const cycles = texSheet.cycles ?? 1;
          const frameIndex = Math.min(
            Math.floor(frameProgress * totalFrames * cycles) % totalFrames,
            totalFrames - 1,
          );
          const frames = getFrameTextures(
            spawner.texture,
            texSheet.tilesX,
            texSheet.tilesY,
          );
          if (frames[frameIndex]) {
            p.particle.texture = frames[frameIndex];
          }
        }

        const trailsCfg = spawner.config.trails;
        if (trailsCfg?.enabled && p.trailVertices) {
          const lx = p.lastTrailX ?? p.particle.x;
          const ly = p.lastTrailY ?? p.particle.y;
          const dist = Math.hypot(p.particle.x - lx, p.particle.y - ly);
          if (dist >= trailsCfg.minVertexDistance) {
            p.trailVertices.push({
              x: p.particle.x,
              y: p.particle.y,
              life: 0,
              maxLife: p.maxLife * trailsCfg.lifetime,
            });
            p.lastTrailX = p.particle.x;
            p.lastTrailY = p.particle.y;
          }
        }
      }
    }

    for (const spawner of spawners) {
      const trailsCfg = spawner.config.trails;
      if (!trailsCfg?.enabled) continue;
      for (const p of spawner.particles) {
        if (!p.trailVertices) continue;
        for (let i = p.trailVertices.length - 1; i >= 0; i--) {
          p.trailVertices[i].life += delta;
          if (p.trailVertices[i].life >= p.trailVertices[i].maxLife) {
            p.trailVertices.splice(i, 1);
          }
        }
      }

      spawner.trailGraphics.clear();
      for (const p of spawner.particles) {
        if (!p.trailVertices?.length) continue;
        spawner.trailGraphics.moveTo(p.particle.x, p.particle.y);
        for (const v of p.trailVertices) {
          spawner.trailGraphics.lineTo(v.x, v.y);
        }
        spawner.trailGraphics.stroke({
          width: 2,
          color: p.particle.tint,
          alpha: trailsCfg.inheritParticleColor ? p.particle.alpha : 0.5,
        });
      }
    }
  }

  function resize(width: number, height: number): void {
    viewWidth = width;
    viewHeight = height;
    const centerX = width / 2;
    const centerY = height / 2;
    for (const spawner of spawners) {
      const ox = spawner.data.position?.x ?? 0;
      const oy = spawner.data.position?.y ?? 0;
      spawner.spawnX = centerX + ox;
      spawner.spawnY = centerY + oy;
    }
  }

  function getCenter(): { centerX: number; centerY: number } {
    return {
      centerX: viewWidth / 2,
      centerY: viewHeight / 2,
    };
  }

  function updateSpawnerPosition(
    id: string,
    offsetX: number,
    offsetY: number,
  ): void {
    const { centerX, centerY } = getCenter();
    const spawner = spawners.find((s) => s.id === id);
    if (!spawner) return;
    spawner.spawnX = centerX + offsetX;
    spawner.spawnY = centerY + offsetY;
    spawner.data.position = { x: offsetX, y: offsetY };
  }

  function destroy(): void {
    for (const s of spawners) {
      for (const p of s.particles) {
        p.particle.destroy();
      }
      s.container.destroy({ children: true });
      if (s.container.parent) {
        s.container.parent.removeChild(s.container);
      }
    }
    spawners.length = 0;
    textureCache.clear();
    frameTextureCache.clear();
  }

  return {
    loadVFXData,
    update,
    destroy,
    resize,
    getCenter,
    updateSpawnerPosition,
  };
}
