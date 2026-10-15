/**
 * STONEWALKER — Three.js Scene, ACES Tone Mapping, Hemisphere & Night Firelight Setup
 * Uses ACESFilmicToneMapping, HemisphereLight sky/ground bounce, real-time shadows on
 * Medium/High quality, and a warm night torchlight follower so night is vibrant and clear.
 */

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { DayNightLighting } from '../core/DayNight';
import type { EventBus } from '../core/EventBus';
import type { SettingsManager } from '../core/Settings';

export class SceneSetup {
  public readonly canvas: HTMLCanvasElement;
  public readonly renderer: THREE.WebGLRenderer;
  public readonly scene: THREE.Scene;
  public readonly ambientLight: THREE.AmbientLight;
  public readonly hemiLight: THREE.HemisphereLight;
  public readonly sunLight: THREE.DirectionalLight;
  public readonly nightWarmLight: THREE.PointLight;
  public readonly campFireLightGroup = new THREE.Group();

  private readonly settings: SettingsManager;
  private readonly bus: EventBus;

  public constructor(
    canvas: HTMLCanvasElement,
    settings: SettingsManager,
    bus: EventBus,
  ) {
    this.canvas = canvas;
    this.settings = settings;
    this.bus = bus;

    const currentQuality = settings.get().resolvedQuality;
    const shadowsEnabled = currentQuality !== 'low';

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, CONFIG.MAX_PIXEL_RATIO),
    );
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // Rich diorama color grading
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.22;
    this.renderer.shadowMap.enabled = shadowsEnabled;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9ad0dc);
    this.scene.fog = new THREE.FogExp2(0x9ad0dc, 0.0028);

    this.ambientLight = new THREE.AmbientLight(0xfaf0dc, 0.9);

    // Hemisphere light prevents dark/black undersides on 3D models day and night
    this.hemiLight = new THREE.HemisphereLight(0xdbeafe, 0x6b5b45, 0.75);
    this.hemiLight.position.set(0, 50, 0);

    this.sunLight = new THREE.DirectionalLight(0xfff0c8, 1.6);
    this.sunLight.position.set(35, 55, 28);
    this.sunLight.castShadow = shadowsEnabled;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 160;
    const shadowBounds = 42;
    this.sunLight.shadow.camera.left = -shadowBounds;
    this.sunLight.shadow.camera.right = shadowBounds;
    this.sunLight.shadow.camera.top = shadowBounds;
    this.sunLight.shadow.camera.bottom = -shadowBounds;
    this.sunLight.shadow.bias = -0.0005;

    // Warm amber fill light that illuminates the active battlefield view at night
    this.nightWarmLight = new THREE.PointLight(0xff9442, 0, 55, 1.2);
    this.nightWarmLight.position.set(48, 10, 48);

    this.scene.add(
      this.ambientLight,
      this.hemiLight,
      this.sunLight,
      this.sunLight.target,
      this.nightWarmLight,
      this.campFireLightGroup,
    );

    this.bindContextEvents();
  }

  public applyDayNightLighting(
    lighting: DayNightLighting,
    mapCenterX: number,
    mapCenterZ: number,
  ): void {
    this.sunLight.color.setHex(lighting.sunColorHex);
    this.sunLight.intensity = lighting.sunIntensity;
    this.sunLight.position.set(
      mapCenterX + lighting.sunDirection.x,
      lighting.sunDirection.y,
      mapCenterZ + lighting.sunDirection.z,
    );
    this.sunLight.target.position.set(mapCenterX, 0, mapCenterZ);

    this.ambientLight.color.setHex(lighting.ambientColorHex);
    this.ambientLight.intensity = lighting.ambientIntensity;

    // Boost hemisphere bounce and warm torchlight during night/twilight
    this.hemiLight.color.setHex(lighting.isNight ? 0x93c5fd : 0xfff7ed);
    this.hemiLight.groundColor.setHex(lighting.isNight ? 0x475569 : 0x78664e);
    this.hemiLight.intensity = lighting.isNight ? 0.95 : 0.72;

    this.nightWarmLight.position.set(mapCenterX, 9.5, mapCenterZ);
    this.nightWarmLight.intensity = lighting.isNight ? 2.4 : 0.0;

    if (this.scene.background instanceof THREE.Color) {
      this.scene.background.setHex(lighting.skyColorHex);
    }
    if (this.scene.fog instanceof THREE.FogExp2) {
      this.scene.fog.color.setHex(lighting.skyColorHex);
    }
  }

  public applyQualitySettings(): void {
    const q = this.settings.get().resolvedQuality;
    const shadowsEnabled = q !== 'low';
    this.renderer.shadowMap.enabled = shadowsEnabled;
    this.sunLight.castShadow = shadowsEnabled;
    const ratioCap = q === 'low' ? 1.25 : CONFIG.MAX_PIXEL_RATIO;
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, ratioCap),
    );
  }

  private bindContextEvents(): void {
    this.canvas.addEventListener(
      'webglcontextlost',
      (event) => {
        event.preventDefault();
        this.bus.emit('ui:toast', {
          message: 'Graphics context paused — restoring...',
          level: 'warning',
        });
      },
      false,
    );

    this.canvas.addEventListener(
      'webglcontextrestored',
      () => {
        this.applyQualitySettings();
        this.bus.emit('ui:toast', {
          message: 'Graphics context restored.',
          level: 'success',
        });
      },
      false,
    );
  }
}