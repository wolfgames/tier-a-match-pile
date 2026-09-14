/** VFX JSON format consumed by scaffold-production and the editor */
export interface VFXData {
  version: string;
  timestamp: string;
  spawners: SpawnerData[];
  /** Editor: aspect ratio the effect was designed in (e.g. "16:9", "9:16") */
  aspectRatio?: string;
}

/** Emission burst: spawn particles at specific times */
export interface BurstConfig {
  time: number;
  count: number;
  cycles?: number;
  interval?: number;
  probability?: number;
}

/** Emitter shape (Unity Shape module) */
export interface ShapeConfig {
  type: "point" | "circle" | "rectangle" | "edge" | "cone";
  radius?: number;
  radiusThickness?: number;
  arc?: number;
  width?: number;
  height?: number;
  angle?: number;
  coneAngle?: number; // cone opening angle in degrees
  emitFrom?: "volume" | "edge" | "shell";
  randomizeDirection?: number;
  alignToDirection?: boolean;
}

/** Velocity over Lifetime (Unity module) */
export interface VelocityOverLifetimeConfig {
  linearX?: number;
  linearY?: number;
  orbital?: number;
  radial?: number;
  speedModifier?: number;
}

/** Noise / turbulence (Unity Noise module) */
export interface NoiseConfig {
  enabled: boolean;
  strength: number;
  frequency: number;
  scrollSpeed: number;
  /** Layers of overlapping noise (1 = single octave) */
  octaves?: number;
  /** Amplitude falloff per octave (0-1) */
  octaveMultiplier?: number;
  /** Frequency scale per octave (>1) */
  octaveScale?: number;
  /** Strength multiplier over particle lifetime; [[0,1],[1,0]] = strong start, fade end */
  strengthOverLifetime?: number[][];
}

/** Limit Velocity over Lifetime */
export interface LimitVelocityConfig {
  enabled: boolean;
  speedLimit: number;
  dampen: number;
  drag: number;
}

/** Force over Lifetime (extends gravity) */
export interface ForceOverLifetimeConfig {
  x: number;
  y: number;
}

/** Gradient stop for color over lifetime */
export interface GradientStop {
  t: number;
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Texture Sheet Animation */
export interface TextureSheetAnimationConfig {
  tilesX: number;
  tilesY: number;
  mode: "wholeSheet" | "singleRow";
  row?: number;
  frameOverTime?: number[][];
  cycles?: number;
}

/** Particle trails */
export interface TrailsConfig {
  enabled: boolean;
  ratio: number;
  lifetime: number;
  minVertexDistance: number;
  widthOverTrail?: number[][];
  inheritParticleColor: boolean;
}

/** Particle configuration for each spawner (scaffold-production compatible) */
export interface ParticleConfig {
  textureName: string;
  alphaStart: number;
  alphaEnd: number;
  sizeMode: "pixels" | "scale";
  sizeStartPixels: number;
  sizeEndPixels: number;
  scaleStart: number;
  scaleEnd: number;
  scaleVariance: number;
  colorStart: { r: number; g: number; b: number };
  colorEnd: { r: number; g: number; b: number };
  /** Start color mode: constant uses colorStart; randomColor picks from startColorKeys */
  startColorMode?: "constant" | "randomColor";
  /** Color keys for randomColor mode; each particle picks one at random */
  startColorKeys?: GradientStop[];
  speed: number;
  speedVariance: number;
  angle: number;
  angleVariance: number;
  acceleration: number;
  gravity: number;
  rotationStart: number;
  rotationSpeed: number;
  rotationVariance: number;
  rotationDirection: "clockwise" | "counter-clockwise" | "random";
  emitterStartDelay: number;
  emitterLifetime: number;
  emitterLifetimeVariance: number;
  particleLifetime: number;
  particleLifetimeVariance: number;
  loop: boolean;
  emitting: boolean;
  burst: boolean;
  spawnRate: number;
  maxParticles: number;
  particlesPerWave: number;
  blendMode: "normal" | "add" | "multiply" | "screen";
  autoPlay: boolean;

  // Unity Main module extras
  prewarm?: boolean;
  simulationSpeed?: number;
  randomSeed?: number;

  // Emission bursts (replaces/supplements simple burst)
  bursts?: BurstConfig[];

  // Shape module
  shape?: ShapeConfig;

  // Velocity over Lifetime
  velocityOverLifetime?: VelocityOverLifetimeConfig;

  // Noise
  noise?: NoiseConfig;

  // Limit Velocity
  limitVelocity?: LimitVelocityConfig;

  // Force over Lifetime
  forceOverLifetime?: ForceOverLifetimeConfig;

  // Size over Lifetime - curve [[t,v],...] replaces linear when provided
  sizeOverLifetime?: number[][];

  // Color over Lifetime - gradient replaces start/end when provided
  colorOverLifetime?: GradientStop[];
  /** When false, particles keep start color/alpha (Unity: Color over Lifetime disabled) */
  colorOverLifetimeEnabled?: boolean;

  // Rotation over Lifetime - curve for angular velocity
  rotationOverLifetime?: number[][];

  // Texture Sheet Animation
  textureSheetAnimation?: TextureSheetAnimationConfig;

  // Trails
  trails?: TrailsConfig;
}

export interface SpawnerData {
  id: string;
  name: string;
  position: { x: number; y: number };
  visible: boolean;
  config: ParticleConfig;
}

const DEFAULT_PARTICLE_CONFIG: ParticleConfig = {
  textureName: "white-circle.png",
  alphaStart: 1,
  alphaEnd: 0,
  sizeMode: "pixels",
  sizeStartPixels: 30,
  sizeEndPixels: 10,
  scaleStart: 0.02,
  scaleEnd: 0.01,
  scaleVariance: 0.3,
  colorStart: { r: 255, g: 255, b: 255 },
  colorEnd: { r: 255, g: 255, b: 255 },
  speed: 5,
  speedVariance: 0.3,
  angle: 270,
  angleVariance: 30,
  acceleration: 0,
  gravity: 0.1,
  rotationStart: 0,
  rotationSpeed: 0,
  rotationVariance: 0,
  rotationDirection: "random",
  emitterStartDelay: 0,
  emitterLifetime: 0,
  emitterLifetimeVariance: 0,
  particleLifetime: 1,
  particleLifetimeVariance: 0.2,
  loop: true,
  emitting: true,
  burst: false,
  spawnRate: 30,
  maxParticles: 1000,
  particlesPerWave: 3,
  blendMode: "add",
  autoPlay: true,
};

/** Returns a new spawner with default config; name defaults to "Spawner N" */
export function createDefaultSpawner(name?: string): SpawnerData {
  const id = `spawner_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    name: name ?? "Spawner",
    position: { x: 0, y: 0 },
    visible: true,
    config: { ...DEFAULT_PARTICLE_CONFIG },
  };
}

/** Default shape (point) */
export const DEFAULT_SHAPE: ShapeConfig = {
  type: "point",
  radiusThickness: 0,
  arc: 360,
  emitFrom: "volume",
  randomizeDirection: 0,
  alignToDirection: false,
};

/** Default noise config */
export const DEFAULT_NOISE: NoiseConfig = {
  enabled: false,
  strength: 1,
  frequency: 0.5,
  scrollSpeed: 0.5,
  octaves: 1,
  octaveMultiplier: 0.5,
  octaveScale: 2,
};

/** Default limit velocity config */
export const DEFAULT_LIMIT_VELOCITY: LimitVelocityConfig = {
  enabled: false,
  speedLimit: 10,
  dampen: 0.5,
  drag: 0,
};

/** Default force over lifetime */
export const DEFAULT_FORCE_OVER_LIFETIME: ForceOverLifetimeConfig = {
  x: 0,
  y: 0,
};

/** Default trails config */
export const DEFAULT_TRAILS: TrailsConfig = {
  enabled: false,
  ratio: 1,
  lifetime: 0.5,
  minVertexDistance: 10,
  inheritParticleColor: true,
};

/** Ensures config has defaults for optional Unity modules (backward compat) */
export function normalizeParticleConfig(
  config: ParticleConfig,
): ParticleConfig {
  return {
    ...config,
    prewarm: config.prewarm ?? false,
    simulationSpeed: config.simulationSpeed ?? 1,
    shape: config.shape ?? { ...DEFAULT_SHAPE },
    noise: config.noise ? { ...DEFAULT_NOISE, ...config.noise } : DEFAULT_NOISE,
    limitVelocity: config.limitVelocity
      ? { ...DEFAULT_LIMIT_VELOCITY, ...config.limitVelocity }
      : DEFAULT_LIMIT_VELOCITY,
    forceOverLifetime: config.forceOverLifetime
      ? { ...DEFAULT_FORCE_OVER_LIFETIME, ...config.forceOverLifetime }
      : DEFAULT_FORCE_OVER_LIFETIME,
    trails: config.trails
      ? { ...DEFAULT_TRAILS, ...config.trails }
      : DEFAULT_TRAILS,
  };
}

/** Returns default VFXData for a new preset (single spawner, centered) */
export function getDefaultVFXData(): VFXData {
  return {
    version: "2.0",
    timestamp: new Date().toISOString(),
    spawners: [createDefaultSpawner("Spawner 1")],
    aspectRatio: "16:9",
  };
}
