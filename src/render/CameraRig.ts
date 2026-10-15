/**
 * STONEWALKER — 2.5D Diorama Camera Rig (Sections 2, 5 & 14)
 * Perspective camera tilted 52 degrees with inertial pan, clamped pinch-zoom,
 * 90-degree snap rotation, minimap viewport polygon projection, and Base stomp shake.
 */

import * as THREE from 'three';
import { CONFIG } from '../config';
import type { SettingsManager } from '../core/Settings';
import type { Vec2 } from '../data/types';

export class CameraRig {
  public readonly camera: THREE.PerspectiveCamera;
  private readonly settings: SettingsManager;
  private readonly groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly raycaster = new THREE.Raycaster();

  private target: Vec2 = { x: 48, z: 48 };
  private velocity: Vec2 = { x: 0, z: 0 };
  private zoomDistance: number = CONFIG.CAMERA_DEFAULT_ZOOM;
  private rotationStep = 0; // 0, 1, 2, 3 (90-degree increments)
  private currentYawRad = 0;
  private mapSize = 128;

  private shakeTimer = 0;
  private shakeIntensity = 0;

  public constructor(settings: SettingsManager, mapSize: number = 128) {
    this.settings = settings;
    this.mapSize = mapSize;
    this.camera = new THREE.PerspectiveCamera(
      CONFIG.CAMERA_FOV,
      window.innerWidth / window.innerHeight,
      CONFIG.CAMERA_NEAR,
      CONFIG.CAMERA_FAR,
    );
    this.updateCameraTransform(1.0);
  }

  public setMapSize(size: number): void {
    this.mapSize = size;
    this.clampTarget();
  }

  public jumpTo(worldPos: Vec2): void {
    this.target.x = worldPos.x;
    this.target.z = worldPos.z;
    this.velocity.x = 0;
    this.velocity.z = 0;
    this.clampTarget();
    this.updateCameraTransform(1.0);
  }

  /**
   * Pans camera in screen-aligned ground directions.
   */
  public panByScreenDelta(deltaScreenX: number, deltaScreenY: number): void {
    const sens = this.settings.get().cameraSensitivity;
    const scale = (this.zoomDistance / 520) * sens;

    const cos = Math.cos(this.currentYawRad);
    const sin = Math.sin(this.currentYawRad);

    const dx = -deltaScreenX * scale;
    const dz = -deltaScreenY * scale;

    const worldDx = dx * cos - dz * sin;
    const worldDz = dx * sin + dz * cos;

    this.target.x += worldDx;
    this.target.z += worldDz;
    this.velocity.x = worldDx * 14;
    this.velocity.z = worldDz * 14;
    this.clampTarget();
  }

  public zoomByFactor(factor: number): void {
    this.zoomDistance = Math.max(
      CONFIG.CAMERA_MIN_ZOOM,
      Math.min(CONFIG.CAMERA_MAX_ZOOM, this.zoomDistance * factor),
    );
  }

  public rotate90(direction: 1 | -1 = 1): void {
    this.rotationStep = (this.rotationStep + direction + 4) % 4;
  }

  public triggerShake(intensity: number = 0.35, durationSec: number = 0.22): void {
    if (this.settings.get().reducedMotion) {
      return;
    }
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeTimer = Math.max(this.shakeTimer, durationSec);
  }

  public update(dt: number): void {
    const reducedMotion = this.settings.get().reducedMotion;

    // Apply inertial pan decay
    if (!reducedMotion) {
      this.target.x += this.velocity.x * dt;
      this.target.z += this.velocity.z * dt;
      const decay = Math.pow(CONFIG.CAMERA_PAN_INERTIA_DECAY, dt * 60);
      this.velocity.x *= decay;
      this.velocity.z *= decay;
    } else {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    this.clampTarget();
    this.updateCameraTransform(dt);
  }

  private updateCameraTransform(dt: number): void {
    const desiredYaw = (this.rotationStep * Math.PI) / 2;
    if (this.settings.get().reducedMotion) {
      this.currentYawRad = desiredYaw;
    } else {
      // Shortest angular interpolation
      let diff = desiredYaw - this.currentYawRad;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.currentYawRad += diff * Math.min(1, dt * 12);
    }

    const tiltRad = THREE.MathUtils.degToRad(CONFIG.CAMERA_TILT_DEGREES);
    const horizontalDist = Math.cos(tiltRad) * this.zoomDistance;
    const height = Math.sin(tiltRad) * this.zoomDistance;

    let shakeX = 0;
    let shakeZ = 0;
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      shakeX = (Math.random() - 0.5) * this.shakeIntensity;
      shakeZ = (Math.random() - 0.5) * this.shakeIntensity;
      if (this.shakeTimer <= 0) {
        this.shakeIntensity = 0;
      }
    }

    const camX =
      this.target.x + Math.sin(this.currentYawRad) * horizontalDist + shakeX;
    const camZ =
      this.target.z + Math.cos(this.currentYawRad) * horizontalDist + shakeZ;

    this.camera.position.set(camX, height, camZ);
    this.camera.lookAt(this.target.x + shakeX, 0, this.target.z + shakeZ);
  }

  private clampTarget(): void {
    const margin = 4;
    this.target.x = Math.max(
      margin,
      Math.min(this.mapSize - margin, this.target.x),
    );
    this.target.z = Math.max(
      margin,
      Math.min(this.mapSize - margin, this.target.z),
    );
  }

  public screenToGround(clientX: number, clientY: number): Vec2 | null {
    const ndcX = (clientX / window.innerWidth) * 2 - 1;
    const ndcY = -(clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const hit = new THREE.Vector3();
    const intersected = this.raycaster.ray.intersectPlane(
      this.groundPlane,
      hit,
    );
    if (!intersected) {
      return null;
    }
    return { x: hit.x, z: hit.z };
  }

  public getTarget(): Readonly<Vec2> {
    return this.target;
  }

  public getZoomDistance(): number {
    return this.zoomDistance;
  }

  public onResize(): void {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }
}