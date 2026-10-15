/**
 * STONEWALKER — High-Craft Recognizable 3D Building & Army Model Factory
 * Every single building and troop/machine role has unmistakable silhouettes and visual props:
 * - Buildings: Crossed spears & training dummies on Barracks, bullseye targets on Sling Range,
 *   glowing anvil & armor stand on Armory, visible Club/Spear/Sling rack on Weapon Station,
 *   hanging boulder crane on Quarry, log piles & splitting axe on Woodcutter Camp, etc.
 * - Army: Workers (straw hat, pickaxe & visible resource carry bundle), Clubbers (spiked caveman maul),
 *   Spearmen (crested helm, buckler & long tasseled spear), Shield Bearers (spiked tower carapace shield),
 *   Slingers (stone pouch & spinning sling), Bow Hunters (hooded cloak, back quiver & recurve bow),
 *   Scouts (feathered raptor mask, twin daggers & cape), Shamans (antler skull crown & glowing staff).
 */

import * as THREE from 'three';
import { ARMOR_TIERS, WEAPON_TIERS } from '../data/equipment';
import type {
  ArmorTier,
  BuildingEntity,
  FactionId,
  UnitEntity,
  WeaponTier,
} from '../data/types';

const FACTION_COLORS_DEFAULT: Record<FactionId, number> = {
  player: 0x3b82f6,
  enemy_1: 0xef4444,
  enemy_2: 0xa855f7,
  enemy_3: 0xf59e0b,
  neutral: 0x9ca3af,
};

const FACTION_COLORS_COLORBLIND: Record<FactionId, number> = {
  player: 0x0072b2,
  enemy_1: 0xd55e00,
  enemy_2: 0xcc79a7,
  enemy_3: 0xf0e442,
  neutral: 0x9ca3af,
};

interface UnitAnimationRig {
  kind: 'humanoid' | 'machine' | 'beast';
  role: string;
  bodyPivot: THREE.Object3D;
  headPivot?: THREE.Object3D;
  leftArmPivot?: THREE.Object3D;
  rightArmPivot?: THREE.Object3D;
  leftLegPivot?: THREE.Object3D;
  rightLegPivot?: THREE.Object3D;
  quadLegs?: THREE.Object3D[];
  wheels?: THREE.Object3D[];
  weaponArm?: THREE.Object3D;
  carryBundle?: THREE.Mesh;
}

export class ModelFactory {
  private readonly blobShadowGeo = new THREE.CircleGeometry(0.6, 16);
  private readonly blobShadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
  });

  public getTeamColorHex(faction: FactionId, colorblind: boolean): number {
    return colorblind
      ? FACTION_COLORS_COLORBLIND[faction]
      : FACTION_COLORS_DEFAULT[faction];
  }

  private enableShadows(group: THREE.Object3D): void {
    group.traverse((child) => {
      if (
        child instanceof THREE.Mesh &&
        child.material !== this.blobShadowMat
      ) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
  }

  private createFireTorch(
    x: number,
    y: number,
    z: number,
    scale: number = 1,
  ): THREE.Group {
    const torch = new THREE.Group();
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06 * scale, 0.08 * scale, 0.55 * scale, 5),
      new THREE.MeshStandardMaterial({
        color: 0x5c3d24,
        roughness: 0.9,
        flatShading: true,
      }),
    );
    const flame = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.18 * scale, 0),
      new THREE.MeshStandardMaterial({
        color: 0xffb703,
        emissive: 0xfb8500,
        emissiveIntensity: 1.7,
        roughness: 0.2,
        flatShading: true,
      }),
    );
    flame.position.y = 0.35 * scale;
    torch.add(post, flame);
    torch.position.set(x, y, z);
    return torch;
  }

  /**
   * Creates unmistakable, prop-rich 3D architectural models for all 16 buildings + the Council Walker Base.
   */
  public createBuildingMesh(
    building: BuildingEntity,
    colorblind: boolean = false,
  ): THREE.Group {
    const group = new THREE.Group();
    const teamColor = this.getTeamColorHex(building.faction, colorblind);

    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x8a5a32,
      roughness: 0.8,
      flatShading: true,
    });
    const darkWoodMat = new THREE.MeshStandardMaterial({
      color: 0x52341c,
      roughness: 0.88,
      flatShading: true,
    });
    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x9ca3af,
      roughness: 0.78,
      flatShading: true,
    });
    const boneMat = new THREE.MeshStandardMaterial({
      color: 0xf7efe0,
      roughness: 0.6,
      flatShading: true,
    });
    const thatchMat = new THREE.MeshStandardMaterial({
      color: 0xdba858,
      roughness: 0.82,
      flatShading: true,
    });
    const bronzeMat = new THREE.MeshStandardMaterial({
      color: 0xe09132,
      roughness: 0.4,
      metalness: 0.65,
      flatShading: true,
    });
    const bannerMat = new THREE.MeshStandardMaterial({
      color: teamColor,
      roughness: 0.5,
      flatShading: true,
    });
    const fireMat = new THREE.MeshStandardMaterial({
      color: 0xffbe0b,
      emissive: 0xff6b00,
      emissiveIntensity: 1.8,
      flatShading: true,
    });

    if (building.buildingType === 'base') {
      // ======================================================================
      // THE COUNCIL WALKER (4x4 Giant Walking Fortress)
      // ======================================================================
      const lowerDeck = new THREE.Mesh(
        new THREE.CylinderGeometry(2.0, 2.25, 0.95, 8),
        stoneMat,
      );
      lowerDeck.position.y = 1.15;
      group.add(lowerDeck);

      const timberBastion = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 1.0, 2.6),
        woodMat,
      );
      timberBastion.position.y = 2.05;
      group.add(timberBastion);

      // Crenellated Battlements
      for (const [bx, bz] of [
        [-1.1, -1.1],
        [1.1, -1.1],
        [-1.1, 1.1],
        [1.1, 1.1],
      ] as const) {
        const merlon = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.45, 0.5),
          stoneMat,
        );
        merlon.position.set(bx, 2.7, bz);
        group.add(merlon);
      }

      const roofCone = new THREE.Mesh(
        new THREE.ConeGeometry(1.9, 1.4, 8),
        thatchMat,
      );
      roofCone.position.y = 3.2;
      group.add(roofCone);

      for (let i = 0; i < 4; i++) {
        const angle = (i * Math.PI) / 2 + Math.PI / 4;
        const cx = Math.cos(angle) * 1.72;
        const cz = Math.sin(angle) * 1.72;

        const tusk = new THREE.Mesh(
          new THREE.ConeGeometry(0.24, 1.65, 6),
          boneMat,
        );
        tusk.position.set(cx, 2.25, cz);
        tusk.rotation.z = -Math.cos(angle) * 0.5;
        tusk.rotation.x = Math.sin(angle) * 0.5;
        group.add(tusk);

        group.add(this.createFireTorch(cx * 0.9, 2.6, cz * 0.9, 1.25));
      }

      const ballistaBow = new THREE.Mesh(
        new THREE.BoxGeometry(1.8, 0.18, 0.28),
        boneMat,
      );
      ballistaBow.position.set(0, 2.75, 1.45);
      group.add(ballistaBow);

      const brazierFlame = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.54, 0),
        fireMat,
      );
      brazierFlame.position.y = 4.05;
      group.add(brazierFlame);

      const baseFireLight = new THREE.PointLight(0xff9e44, 2.4, 28, 1.3);
      baseFireLight.position.set(0, 4.5, 0);
      group.add(baseFireLight);

      for (const zSign of [-1, 1]) {
        const banner = new THREE.Mesh(
          new THREE.BoxGeometry(0.85, 1.25, 0.14),
          bannerMat,
        );
        banner.position.set(0, 2.25, zSign * 1.58);
        group.add(banner);
      }

      const legs: THREE.Object3D[] = [];
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI * 2) / 6;
        const legPivot = new THREE.Group();
        legPivot.position.set(
          Math.cos(angle) * 1.9,
          0.65,
          Math.sin(angle) * 1.9,
        );
        legPivot.rotation.y = -angle;

        const thigh = new THREE.Mesh(
          new THREE.BoxGeometry(0.44, 0.78, 0.68),
          darkWoodMat,
        );
        thigh.position.y = 0.22;

        const kneeJoint = new THREE.Mesh(
          new THREE.SphereGeometry(0.28, 6, 6),
          boneMat,
        );
        kneeJoint.position.set(0, 0.45, 0.24);

        const foot = new THREE.Mesh(
          new THREE.CylinderGeometry(0.26, 0.36, 0.72, 6),
          stoneMat,
        );
        foot.position.set(0, -0.2, 0.24);

        legPivot.add(thigh, kneeJoint, foot);
        group.add(legPivot);
        legs.push(legPivot);
      }
      group.userData.legs = legs;
      this.enableShadows(group);
      return group;
    }

    // ========================================================================
    // 16 DISTINCT CAMP BUILDINGS WITH SIGNATURE VISUAL ATTRIBUTES
    // ========================================================================
    const fp = building.footprint;
    const basePlinth = new THREE.Mesh(
      new THREE.BoxGeometry(fp * 0.86, 0.4, fp * 0.86),
      stoneMat,
    );
    basePlinth.position.y = 0.38;
    group.add(basePlinth);
    group.add(this.createFireTorch(fp * 0.36, 0.85, fp * 0.38, 0.95));

    switch (building.buildingType) {
      case 'hut': {
        // Conical Hide Teepee with crossed crown poles & warm doorway
        const walls = new THREE.Mesh(
          new THREE.CylinderGeometry(fp * 0.34, fp * 0.42, 0.8, 8),
          woodMat,
        );
        walls.position.y = 0.85;
        const roof = new THREE.Mesh(
          new THREE.ConeGeometry(fp * 0.48, 1.15, 8),
          thatchMat,
        );
        roof.position.y = 1.7;
        const pole1 = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 2.2, 4),
          darkWoodMat,
        );
        pole1.position.y = 1.4;
        pole1.rotation.z = 0.22;
        const pole2 = pole1.clone();
        pole2.rotation.z = -0.22;
        const doorGlow = new THREE.Mesh(
          new THREE.BoxGeometry(0.34, 0.5, 0.12),
          fireMat,
        );
        doorGlow.position.set(0, 0.75, fp * 0.38);
        group.add(walls, roof, pole1, pole2, doorGlow);
        break;
      }

      case 'forager_camp': {
        // Red Berry Baskets + Meat-Smoking Rack over Glowing Coals
        const tent = new THREE.Mesh(
          new THREE.ConeGeometry(fp * 0.36, 1.2, 5),
          thatchMat,
        );
        tent.position.set(-0.28, 1.15, -0.2);
        const berryBasket = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.22, 0.35, 7),
          new THREE.MeshStandardMaterial({
            color: 0xe63946,
            roughness: 0.7,
            flatShading: true,
          }),
        );
        berryBasket.position.set(0.38, 0.75, 0.28);
        const smokeRack = new THREE.Mesh(
          new THREE.BoxGeometry(0.65, 0.65, 0.12),
          darkWoodMat,
        );
        smokeRack.position.set(0.25, 0.9, -0.32);
        group.add(tent, berryBasket, smokeRack);
        break;
      }

      case 'woodcutter_camp': {
        // Sawmill Shed + Stacked Timber Logs + Chopping Stump
        const shed = new THREE.Mesh(
          new THREE.BoxGeometry(fp * 0.52, 0.9, fp * 0.48),
          woodMat,
        );
        shed.position.set(-0.22, 0.95, -0.18);
        for (let l = 0; l < 3; l++) {
          const log = new THREE.Mesh(
            new THREE.CylinderGeometry(0.14, 0.14, 0.85, 6),
            darkWoodMat,
          );
          log.rotation.z = Math.PI / 2;
          log.position.set(0.28, 0.68 + (l % 2) * 0.22, 0.25 + l * 0.14);
          group.add(log);
        }
        const axeBlade = new THREE.Mesh(
          new THREE.BoxGeometry(0.08, 0.38, 0.32),
          stoneMat,
        );
        axeBlade.position.set(-0.35, 0.85, 0.38);
        group.add(shed, axeBlade);
        break;
      }

      case 'quarry': {
        // Stepped Stone Excavation Pit + Wooden A-Frame Pulley Crane & Hanging Boulder
        const pit = new THREE.Mesh(
          new THREE.BoxGeometry(fp * 0.74, 0.6, fp * 0.74),
          stoneMat,
        );
        pit.position.y = 0.8;
        const beamL = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.1, 1.75, 5),
          darkWoodMat,
        );
        beamL.position.set(-0.3, 1.45, 0);
        beamL.rotation.z = -0.22;
        const beamR = beamL.clone();
        beamR.position.x = 0.3;
        beamR.rotation.z = 0.22;
        const hangingStone = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.32, 0),
          stoneMat,
        );
        hangingStone.position.set(0, 1.35, 0.25);
        group.add(pit, beamL, beamR, hangingStone);
        break;
      }

      case 'tannery': {
        // Hide Tanning Lodge + Stretched Pelt Rack + Tanning Vat
        const lodge = new THREE.Mesh(
          new THREE.BoxGeometry(fp * 0.56, 0.95, fp * 0.52),
          woodMat,
        );
        lodge.position.set(-0.18, 0.98, -0.15);
        const peltFrame = new THREE.Mesh(
          new THREE.BoxGeometry(0.75, 0.75, 0.08),
          thatchMat,
        );
        peltFrame.position.set(0.28, 1.05, 0.32);
        peltFrame.rotation.y = -0.35;
        group.add(lodge, peltFrame);
        break;
      }

      case 'bronze_mine': {
        // Smelting Furnace Chimney + Molten Bronze Crucible + Gleaming Ingots
        const furnace = new THREE.Mesh(
          new THREE.CylinderGeometry(0.45, 0.68, 1.65, 7),
          stoneMat,
        );
        furnace.position.set(-0.15, 1.35, -0.1);
        const moltenCore = new THREE.Mesh(
          new THREE.SphereGeometry(0.36, 8, 8),
          fireMat,
        );
        moltenCore.position.set(-0.15, 2.2, -0.1);
        const ingotPile = new THREE.Mesh(
          new THREE.BoxGeometry(0.55, 0.35, 0.42),
          bronzeMat,
        );
        ingotPile.position.set(0.38, 0.72, 0.32);
        group.add(furnace, moltenCore, ingotPile);
        break;
      }

      case 'storage_pit': {
        // Vaulted Depot Roof + Visible Food Amphora, Wood Crate & Stone Pile
        const depot = new THREE.Mesh(
          new THREE.BoxGeometry(fp * 0.72, 0.85, fp * 0.55),
          woodMat,
        );
        depot.position.set(0, 0.95, -0.15);
        const goldRoof = new THREE.Mesh(
          new THREE.ConeGeometry(fp * 0.48, 0.7, 4),
          thatchMat,
        );
        goldRoof.rotation.y = Math.PI / 4;
        goldRoof.position.set(0, 1.65, -0.15);
        const crate = new THREE.Mesh(
          new THREE.BoxGeometry(0.38, 0.38, 0.38),
          bronzeMat,
        );
        crate.position.set(0.35, 0.75, 0.38);
        group.add(depot, goldRoof, crate);
        break;
      }

      case 'barracks': {
        // Fortified War Hall + Giant Crossed Spears & Shield Emblem + Training Dummy
        const hall = new THREE.Mesh(
          new THREE.BoxGeometry(fp * 0.68, 1.15, fp * 0.58),
          woodMat,
        );
        hall.position.set(0, 1.1, -0.2);
        const roof = new THREE.Mesh(
          new THREE.ConeGeometry(fp * 0.54, 0.95, 4),
          darkWoodMat,
        );
        roof.rotation.y = Math.PI / 4;
        roof.position.set(0, 2.05, -0.2);

        // Crossed Giant Spears & Shield on Front Facade
        const spearL = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, 1.9, 5),
          boneMat,
        );
        spearL.position.set(0, 1.45, fp * 0.14);
        spearL.rotation.z = 0.6;
        const spearR = spearL.clone();
        spearR.rotation.z = -0.6;
        const crestShield = new THREE.Mesh(
          new THREE.CylinderGeometry(0.42, 0.42, 0.12, 8),
          bannerMat,
        );
        crestShield.rotation.x = Math.PI / 2;
        crestShield.position.set(0, 1.45, fp * 0.18);

        // Yard Training Dummy
        const dummyPost = new THREE.Mesh(
          new THREE.CylinderGeometry(0.14, 0.14, 0.85, 6),
          thatchMat,
        );
        dummyPost.position.set(-0.65, 0.95, 0.75);
        group.add(hall, roof, spearL, spearR, crestShield, dummyPost);
        break;
      }

      case 'sling_range': {
        // Ranged Pavilion + 2 Distinct Bullseye Target Boards
        const shed = new THREE.Mesh(
          new THREE.BoxGeometry(fp * 0.62, 0.95, fp * 0.38),
          woodMat,
        );
        shed.position.set(0, 0.98, -0.45);
        const awning = new THREE.Mesh(
          new THREE.ConeGeometry(fp * 0.46, 0.75, 4),
          thatchMat,
        );
        awning.rotation.y = Math.PI / 4;
        awning.position.set(0, 1.75, -0.45);

        for (const txOff of [-0.5, 0.5]) {
          const targetBoard = new THREE.Mesh(
            new THREE.CylinderGeometry(0.38, 0.38, 0.1, 10),
            bannerMat,
          );
          targetBoard.rotation.x = Math.PI / 2;
          targetBoard.position.set(txOff, 1.0, 0.65);
          const bullseye = new THREE.Mesh(
            new THREE.CylinderGeometry(0.16, 0.16, 0.14, 8),
            fireMat,
          );
          bullseye.rotation.x = Math.PI / 2;
          bullseye.position.set(txOff, 1.0, 0.65);
          group.add(targetBoard, bullseye);
        }
        group.add(shed, awning);
        break;
      }

      case 'beast_pen': {
        // Timber Corral Fence + Bone Tusk Gate Arch + Beast Den
        const den = new THREE.Mesh(
          new THREE.ConeGeometry(0.75, 1.25, 6),
          darkWoodMat,
        );
        den.position.set(-0.45, 1.15, -0.45);
        const tuskArchL = new THREE.Mesh(
          new THREE.ConeGeometry(0.14, 1.35, 6),
          boneMat,
        );
        tuskArchL.position.set(-0.45, 1.2, 0.85);
        tuskArchL.rotation.z = -0.25;
        const tuskArchR = tuskArchL.clone();
        tuskArchR.position.x = 0.45;
        tuskArchR.rotation.z = 0.25;
        group.add(den, tuskArchL, tuskArchR);
        break;
      }

      case 'machine_workshop': {
        // Siege Foundry + Overhead Gantry Crane + Giant Spare Wheel
        const foundry = new THREE.Mesh(
          new THREE.BoxGeometry(fp * 0.62, 1.2, fp * 0.56),
          stoneMat,
        );
        foundry.position.set(-0.2, 1.12, -0.15);
        const gantry = new THREE.Mesh(
          new THREE.BoxGeometry(1.5, 0.2, 0.24),
          darkWoodMat,
        );
        gantry.position.set(0.1, 2.05, 0.35);
        const spareWheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.52, 0.52, 0.18, 10),
          boneMat,
        );
        spareWheel.rotation.z = Math.PI / 2;
        spareWheel.position.set(0.78, 0.98, 0.45);
        group.add(foundry, gantry, spareWheel);
        break;
      }

      case 'weapon_station': {
        // Open-Air Armory Rack visibly displaying physical Clubs, Spears & Slings
        const rackFrame = new THREE.Mesh(
          new THREE.BoxGeometry(fp * 0.72, 1.05, 0.22),
          darkWoodMat,
        );
        rackFrame.position.set(0, 1.05, -0.15);
        const canopy = new THREE.Mesh(
          new THREE.BoxGeometry(fp * 0.78, 0.18, fp * 0.65),
          thatchMat,
        );
        canopy.position.set(0, 1.65, 0);
        for (let s = -1; s <= 1; s++) {
          const spearProp = new THREE.Mesh(
            new THREE.CylinderGeometry(0.05, 0.05, 1.45, 5),
            bronzeMat,
          );
          spearProp.position.set(s * 0.38, 1.15, 0.12);
          spearProp.rotation.x = 0.2;
          group.add(spearProp);
        }
        group.add(rackFrame, canopy);
        break;
      }

      case 'armory': {
        // Heavy Stone & Bronze Forge + Glowing Furnace + Anvil & Armor Stand
        const forge = new THREE.Mesh(
          new THREE.BoxGeometry(fp * 0.68, 1.25, fp * 0.62),
          stoneMat,
        );
        forge.position.set(-0.15, 1.15, -0.15);
        const chimney = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.45, 1.9, 6),
          darkWoodMat,
        );
        chimney.position.set(-0.45, 1.65, -0.35);
        const chimneyFlame = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.32, 0),
          fireMat,
        );
        chimneyFlame.position.set(-0.45, 2.7, -0.35);
        const armorDisplay = new THREE.Mesh(
          new THREE.CylinderGeometry(0.32, 0.28, 0.85, 6),
          bronzeMat,
        );
        armorDisplay.position.set(0.55, 1.05, 0.55);
        group.add(forge, chimney, chimneyFlame, armorDisplay);
        break;
      }

      case 'research_hall': {
        // Stonehenge Sanctuary Circle + Glowing Astrolabe Crystal Dome
        const sanctuary = new THREE.Mesh(
          new THREE.CylinderGeometry(fp * 0.36, fp * 0.42, 1.1, 8),
          stoneMat,
        );
        sanctuary.position.y = 1.05;
        const astrolabe = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.52, 0),
          new THREE.MeshStandardMaterial({
            color: 0x38bdf8,
            emissive: 0x0284c7,
            emissiveIntensity: 1.4,
            flatShading: true,
          }),
        );
        astrolabe.position.y = 2.15;
        for (let m = 0; m < 4; m++) {
          const ang = (m * Math.PI) / 2 + Math.PI / 4;
          const monolith = new THREE.Mesh(
            new THREE.BoxGeometry(0.28, 1.55, 0.18),
            boneMat,
          );
          monolith.position.set(
            Math.cos(ang) * 0.95,
            1.2,
            Math.sin(ang) * 0.95,
          );
          monolith.rotation.y = -ang;
          group.add(monolith);
        }
        group.add(sanctuary, astrolabe);
        break;
      }

      case 'lookout': {
        const stilts = new THREE.Mesh(
          new THREE.CylinderGeometry(0.28, 0.5, 2.35, 6),
          darkWoodMat,
        );
        stilts.position.y = 1.55;
        const nest = new THREE.Mesh(
          new THREE.BoxGeometry(1.05, 0.48, 1.05),
          woodMat,
        );
        nest.position.y = 2.75;
        const beacon = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.32, 0),
          fireMat,
        );
        beacon.position.y = 3.25;
        group.add(stilts, nest, beacon);
        break;
      }

      case 'spirit_totem': {
        const pillar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.34, 0.5, 2.3, 6),
          boneMat,
        );
        pillar.position.y = 1.55;
        const wings = new THREE.Mesh(
          new THREE.BoxGeometry(1.75, 0.3, 0.24),
          bannerMat,
        );
        wings.position.y = 2.2;
        const spiritGem = new THREE.Mesh(
          new THREE.OctahedronGeometry(0.4, 0),
          fireMat,
        );
        spiritGem.position.y = 2.95;
        const totemLight = new THREE.PointLight(0xffaa33, 1.8, 18, 1.4);
        totemLight.position.set(0, 3.2, 0);
        group.add(pillar, wings, spiritGem, totemLight);
        break;
      }
    }

    const banner = new THREE.Mesh(
      new THREE.BoxGeometry(fp * 0.46, 0.26, 0.14),
      bannerMat,
    );
    banner.position.set(0, 1.35, fp * 0.4);
    group.add(banner);

    const legs: THREE.Mesh[] = [];
    const legOffset = fp * 0.36;
    const corners = [
      [-legOffset, -legOffset],
      [legOffset, -legOffset],
      [-legOffset, legOffset],
      [legOffset, legOffset],
    ] as const;

    for (const [lx, lz] of corners) {
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.26, 0.55, 0.26),
        darkWoodMat,
      );
      leg.position.set(lx, 0.25, lz);
      group.add(leg);
      legs.push(leg);
    }
    group.userData.legs = legs;

    this.enableShadows(group);
    return group;
  }

  /**
   * Creates an unmistakable, attribute-rich 3D model for every Worker, Troop, Machine, Hero, and Beast.
   */
  public createUnitMesh(
    unit: UnitEntity,
    weaponTier: WeaponTier = 0,
    armorTier: ArmorTier = 0,
    colorblind: boolean = false,
    useBlobShadow: boolean = true,
  ): THREE.Group {
    const group = new THREE.Group();
    const teamColor = this.getTeamColorHex(unit.faction, colorblind);
    const weaponColor = WEAPON_TIERS[weaponTier].visualColorHex;
    const armorColor = ARMOR_TIERS[armorTier].visualColorHex;
    const isEnemy = unit.faction !== 'player' && unit.faction !== 'neutral';

    if (useBlobShadow) {
      const shadow = new THREE.Mesh(this.blobShadowGeo, this.blobShadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = 0.03;
      const scale =
        unit.kind === 'machine' ? 1.85 : unit.kind === 'hero' ? 1.45 : 0.95;
      shadow.scale.setScalar(scale);
      group.add(shadow);
    }

    const teamMat = new THREE.MeshStandardMaterial({
      color: teamColor,
      roughness: 0.48,
      flatShading: true,
    });
    const boneMat = new THREE.MeshStandardMaterial({
      color: 0xf7efe0,
      roughness: 0.58,
      flatShading: true,
    });
    const woodMat = new THREE.MeshStandardMaterial({
      color: 0x7c502b,
      roughness: 0.82,
      flatShading: true,
    });
    const darkStoneMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.78,
      flatShading: true,
    });
    const thatchMat = new THREE.MeshStandardMaterial({
      color: 0xe2b86b,
      roughness: 0.78,
      flatShading: true,
    });
    const fireMat = new THREE.MeshStandardMaterial({
      color: 0xffbe0b,
      emissive: 0xff6b00,
      emissiveIntensity: 1.8,
      flatShading: true,
    });

    // ========================================================================
    // 1. WAR MACHINES
    // ========================================================================
    if (unit.kind === 'machine') {
      const bodyPivot = new THREE.Group();
      group.add(bodyPivot);

      const isColossus =
        unit.role === 'mammoth_fortress' || unit.role === 'titan_walker';
      const w = isColossus ? 1.68 : unit.role === 'crawler' ? 0.54 : 1.15;
      const h = isColossus ? 1.55 : unit.role === 'crawler' ? 0.44 : 0.84;

      const chassisMat = new THREE.MeshStandardMaterial({
        color:
          unit.role === 'titan_walker'
            ? 0xe09132
            : unit.role === 'shell_walker'
              ? 0x64748b
              : 0x855832,
        roughness: 0.68,
        metalness: unit.role === 'titan_walker' ? 0.4 : 0.1,
        flatShading: true,
      });

      const chassis = new THREE.Mesh(
        new THREE.BoxGeometry(w, h * 0.85, w * 1.32),
        chassisMat,
      );
      chassis.position.y = h * 0.72;
      bodyPivot.add(chassis);

      if (unit.role === 'shell_walker') {
        const domeShell = new THREE.Mesh(
          new THREE.DodecahedronGeometry(w * 0.72, 1),
          boneMat,
        );
        domeShell.scale.set(1.0, 0.65, 1.25);
        domeShell.position.y = h * 1.05;
        bodyPivot.add(domeShell);
      }

      const trim = new THREE.Mesh(
        new THREE.BoxGeometry(w * 1.08, h * 0.24, w * 0.92),
        teamMat,
      );
      trim.position.y = h * 1.08;
      bodyPivot.add(trim);

      const wheels: THREE.Object3D[] = [];
      const quadLegs: THREE.Object3D[] = [];
      let weaponArm: THREE.Object3D | undefined;

      if (
        unit.role === 'shell_walker' ||
        unit.role === 'crawler' ||
        isColossus
      ) {
        const legOffsets = [
          [-w * 0.58, -w * 0.45],
          [w * 0.58, -w * 0.45],
          [-w * 0.58, w * 0.45],
          [w * 0.58, w * 0.45],
        ] as const;
        for (const [lx, lz] of legOffsets) {
          const legPivot = new THREE.Group();
          legPivot.position.set(lx, h * 0.55, lz);
          const strut = new THREE.Mesh(
            new THREE.BoxGeometry(0.24, h * 0.75, 0.28),
            boneMat,
          );
          strut.position.y = -h * 0.25;
          legPivot.add(strut);
          bodyPivot.add(legPivot);
          quadLegs.push(legPivot);
        }
      } else {
        const wheelGeo = new THREE.CylinderGeometry(
          h * 0.46,
          h * 0.46,
          0.2,
          10,
        );
        wheelGeo.rotateZ(Math.PI / 2);
        const offsets = [
          [-w * 0.58, -w * 0.42],
          [w * 0.58, -w * 0.42],
          [-w * 0.58, w * 0.42],
          [w * 0.58, w * 0.42],
        ] as const;
        for (const [wx, wz] of offsets) {
          const wheel = new THREE.Mesh(wheelGeo, boneMat);
          wheel.position.set(wx, h * 0.46, wz);
          bodyPivot.add(wheel);
          wheels.push(wheel);
        }
      }

      if (unit.role === 'boulder_thrower' || unit.role === 'fire_catapult') {
        const armPivot = new THREE.Group();
        armPivot.position.set(0, h * 1.05, -0.2);
        const beam = new THREE.Mesh(
          new THREE.BoxGeometry(0.18, 1.38, 0.18),
          woodMat,
        );
        beam.position.y = 0.55;
        const payload = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.34, 0),
          unit.role === 'fire_catapult' ? fireMat : darkStoneMat,
        );
        payload.position.set(0, 1.28, -0.15);
        armPivot.add(beam, payload);
        armPivot.rotation.x = -0.5;
        bodyPivot.add(armPivot);
        weaponArm = armPivot;
      } else if (unit.role === 'bone_ram') {
        const ramPivot = new THREE.Group();
        ramPivot.position.set(0, h * 0.78, 0);
        const log = new THREE.Mesh(
          new THREE.CylinderGeometry(0.24, 0.28, w * 1.7, 6),
          woodMat,
        );
        log.rotation.x = Math.PI / 2;
        const skullHead = new THREE.Mesh(
          new THREE.ConeGeometry(0.42, 0.7, 5),
          boneMat,
        );
        skullHead.rotation.x = Math.PI / 2;
        skullHead.position.z = w * 0.92;
        ramPivot.add(log, skullHead);
        bodyPivot.add(ramPivot);
        weaponArm = ramPivot;
      } else {
        const turretPivot = new THREE.Group();
        turretPivot.position.set(0, h * 1.08, 0.15);
        const tuskL = new THREE.Mesh(
          new THREE.ConeGeometry(0.16, w * 0.88, 6),
          boneMat,
        );
        tuskL.rotation.x = Math.PI / 2.2;
        tuskL.position.set(-w * 0.32, 0, w * 0.55);
        const tuskR = tuskL.clone();
        tuskR.position.x = w * 0.32;
        turretPivot.add(tuskL, tuskR);

        if (isColossus) {
          const core = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.45, 0),
            fireMat,
          );
          core.position.set(0, 0.58, 0);
          turretPivot.add(core);
        }
        bodyPivot.add(turretPivot);
        weaponArm = turretPivot;
      }

      const rig: UnitAnimationRig = {
        kind: 'machine',
        role: unit.role,
        bodyPivot,
        wheels,
        quadLegs,
        weaponArm,
      };
      group.userData.rig = rig;
      this.enableShadows(group);
      return group;
    }

    // ========================================================================
    // 2. WILD & TAMED ANIMALS
    // ========================================================================
    if (unit.kind === 'beast') {
      const bodyPivot = new THREE.Group();
      group.add(bodyPivot);

      const scale =
        unit.role === 'mammoth'
          ? 1.5
          : unit.role === 'sabertooth'
            ? 0.98
            : 0.84;
      const furMat = new THREE.MeshStandardMaterial({
        color:
          unit.role === 'sabertooth'
            ? 0xd99b43
            : unit.role === 'mammoth'
              ? 0x6e4728
              : 0x543822,
        roughness: 0.82,
        flatShading: true,
      });

      const torso = new THREE.Mesh(
        new THREE.BoxGeometry(0.76 * scale, 0.62 * scale, 1.18 * scale),
        furMat,
      );
      torso.position.y = 0.62 * scale;
      bodyPivot.add(torso);

      if (unit.faction !== 'neutral') {
        const saddle = new THREE.Mesh(
          new THREE.BoxGeometry(0.82 * scale, 0.18 * scale, 0.45 * scale),
          teamMat,
        );
        saddle.position.set(0, 0.92 * scale, 0);
        bodyPivot.add(saddle);
      }

      const headPivot = new THREE.Group();
      headPivot.position.set(0, 0.76 * scale, 0.62 * scale);
      const skull = new THREE.Mesh(
        new THREE.BoxGeometry(0.54 * scale, 0.48 * scale, 0.56 * scale),
        furMat,
      );
      headPivot.add(skull);

      if (unit.role === 'mammoth') {
        const trunk = new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.12 * scale,
            0.08 * scale,
            0.78 * scale,
            6,
          ),
          furMat,
        );
        trunk.position.set(0, -0.25 * scale, 0.32 * scale);
        trunk.rotation.x = 0.35;
        headPivot.add(trunk);
      }

      const tuskL = new THREE.Mesh(
        new THREE.ConeGeometry(0.09 * scale, 0.7 * scale, 6),
        boneMat,
      );
      tuskL.rotation.x =
        unit.role === 'sabertooth' ? Math.PI * 0.88 : Math.PI / 2.3;
      tuskL.position.set(
        -0.22 * scale,
        unit.role === 'sabertooth' ? -0.22 * scale : -0.05 * scale,
        0.38 * scale,
      );
      const tuskR = tuskL.clone();
      tuskR.position.x = 0.22 * scale;
      headPivot.add(tuskL, tuskR);
      bodyPivot.add(headPivot);

      const quadLegs: THREE.Object3D[] = [];
      const legCoords = [
        [-0.28 * scale, 0.35 * scale, 0.42 * scale],
        [0.28 * scale, 0.35 * scale, 0.42 * scale],
        [-0.28 * scale, 0.35 * scale, -0.42 * scale],
        [0.28 * scale, 0.35 * scale, -0.42 * scale],
      ] as const;

      for (const [lx, ly, lz] of legCoords) {
        const legPivot = new THREE.Group();
        legPivot.position.set(lx, ly, lz);
        const limb = new THREE.Mesh(
          new THREE.CylinderGeometry(
            0.11 * scale,
            0.09 * scale,
            0.48 * scale,
            6,
          ),
          furMat,
        );
        limb.position.y = -0.15 * scale;
        legPivot.add(limb);
        bodyPivot.add(legPivot);
        quadLegs.push(legPivot);
      }

      const rig: UnitAnimationRig = {
        kind: 'beast',
        role: unit.role,
        bodyPivot,
        headPivot,
        quadLegs,
      };
      group.userData.rig = rig;
      this.enableShadows(group);
      return group;
    }

    // ========================================================================
    // 3. HUMANOID TROOPS, WORKERS, ENEMIES & CHIEFTAIN HEROES
    // ========================================================================
    const heightScale =
      unit.kind === 'hero'
        ? 1.52
        : unit.role === 'shield_bearer'
          ? 1.15
          : unit.role === 'scout'
            ? 0.96
            : 1.04;

    const bodyPivot = new THREE.Group();
    group.add(bodyPivot);

    const torsoMat = new THREE.MeshStandardMaterial({
      color: unit.role === 'worker' ? teamColor : armorColor,
      roughness: 0.65,
      flatShading: true,
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xe3ba91,
      roughness: 0.7,
      flatShading: true,
    });
    const weaponMat = new THREE.MeshStandardMaterial({
      color: weaponColor,
      roughness: 0.45,
      metalness: weaponTier === 3 ? 0.55 : 0.1,
      flatShading: true,
    });

    // Articulated Left & Right Legs
    const legGeo = new THREE.CylinderGeometry(
      0.085 * heightScale,
      0.07 * heightScale,
      0.42 * heightScale,
      6,
    );
    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.12 * heightScale, 0.42 * heightScale, 0);
    const leftLegMesh = new THREE.Mesh(legGeo, skinMat);
    leftLegMesh.position.y = -0.21 * heightScale;
    leftLegPivot.add(leftLegMesh);

    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.12 * heightScale, 0.42 * heightScale, 0);
    const rightLegMesh = new THREE.Mesh(legGeo, skinMat);
    rightLegMesh.position.y = -0.21 * heightScale;
    rightLegPivot.add(rightLegMesh);

    // Torso + Team Belt/Sash
    const torso = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.25 * heightScale,
        0.2 * heightScale,
        0.54 * heightScale,
        7,
      ),
      torsoMat,
    );
    torso.position.y = 0.64 * heightScale;

    const belt = new THREE.Mesh(
      new THREE.CylinderGeometry(
        0.23 * heightScale,
        0.25 * heightScale,
        0.18 * heightScale,
        7,
      ),
      teamMat,
    );
    belt.position.y = 0.44 * heightScale;
    bodyPivot.add(leftLegPivot, rightLegPivot, torso, belt);

    // Role-Specific Back Props (Worker Basket + Carry Load, Bow Hunter Quiver, Scout Cape)
    let carryBundle: THREE.Mesh | undefined;
    if (unit.role === 'worker') {
      const pack = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.14, 0.36, 6),
        woodMat,
      );
      pack.position.set(0, 0.65, -0.22);
      bodyPivot.add(pack);

      carryBundle = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.18, 0),
        fireMat,
      );
      carryBundle.position.set(0, 0.88, -0.22);
      carryBundle.visible = unit.carryAmount > 0;
      bodyPivot.add(carryBundle);
    } else if (unit.role === 'bow_hunter') {
      const quiver = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.08, 0.46, 6),
        woodMat,
      );
      quiver.position.set(0.1, 0.72, -0.22);
      quiver.rotation.z = -0.25;
      bodyPivot.add(quiver);
    } else if (unit.role === 'scout' || unit.kind === 'hero') {
      const cape = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.42 * heightScale,
          0.55 * heightScale,
          0.06,
        ),
        teamMat,
      );
      cape.position.set(0, 0.62 * heightScale, -0.22 * heightScale);
      cape.rotation.x = 0.18;
      bodyPivot.add(cape);
    }

    // Head + Role-Distinctive Headgear
    const headPivot = new THREE.Group();
    headPivot.position.set(0, 0.96 * heightScale, 0);
    const headMesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.2 * heightScale, 0),
      skinMat,
    );
    headPivot.add(headMesh);

    if (unit.role === 'worker') {
      // Wide Straw Harvester Hat
      const hat = new THREE.Mesh(
        new THREE.ConeGeometry(0.34, 0.18, 8),
        thatchMat,
      );
      hat.position.y = 0.18;
      headPivot.add(hat);
    } else if (unit.role === 'spearman' || unit.role === 'shield_bearer') {
      // Crested War Helmet
      const helm = new THREE.Mesh(
        new THREE.ConeGeometry(0.22 * heightScale, 0.4 * heightScale, 6),
        teamMat,
      );
      helm.position.y = 0.24 * heightScale;
      headPivot.add(helm);
    } else if (unit.role === 'shaman') {
      // Bone Skull Mask + Tall Antlers
      const skullMask = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 0.26, 0.24),
        boneMat,
      );
      skullMask.position.set(0, 0.06, 0.08);
      const antlerL = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.48, 5),
        boneMat,
      );
      antlerL.position.set(-0.2, 0.32, 0);
      antlerL.rotation.z = 0.55;
      const antlerR = antlerL.clone();
      antlerR.position.x = 0.2;
      antlerR.rotation.z = -0.55;
      headPivot.add(skullMask, antlerL, antlerR);
    } else {
      // Feathered Plume / Crown
      const plume = new THREE.Mesh(
        new THREE.ConeGeometry(0.16 * heightScale, 0.36 * heightScale, 5),
        teamMat,
      );
      plume.position.y = 0.26 * heightScale;
      headPivot.add(plume);
    }

    if (isEnemy || unit.kind === 'hero') {
      const hornL = new THREE.Mesh(
        new THREE.ConeGeometry(0.06 * heightScale, 0.32 * heightScale, 5),
        boneMat,
      );
      hornL.position.set(-0.18 * heightScale, 0.16 * heightScale, 0.04);
      hornL.rotation.z = 0.65;
      const hornR = hornL.clone();
      hornR.position.x = 0.18 * heightScale;
      hornR.rotation.z = -0.65;
      headPivot.add(hornL, hornR);
    }
    bodyPivot.add(headPivot);

    // Articulated Left Arm (Shield / Buckler / Bow / Dagger)
    const armGeo = new THREE.CylinderGeometry(
      0.07 * heightScale,
      0.06 * heightScale,
      0.4 * heightScale,
      6,
    );
    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.29 * heightScale, 0.84 * heightScale, 0);
    const leftArmMesh = new THREE.Mesh(armGeo, skinMat);
    leftArmMesh.position.y = -0.18 * heightScale;
    leftArmPivot.add(leftArmMesh);

    if (unit.role === 'shield_bearer' || unit.kind === 'hero') {
      // Huge Tower Carapace Shield with Team Emblem & Bone Boss
      const shield = new THREE.Mesh(
        new THREE.BoxGeometry(
          0.12 * heightScale,
          0.68 * heightScale,
          0.56 * heightScale,
        ),
        teamMat,
      );
      shield.position.set(-0.1 * heightScale, -0.22 * heightScale, 0.18);
      const boss = new THREE.Mesh(
        new THREE.ConeGeometry(0.14 * heightScale, 0.22 * heightScale, 6),
        boneMat,
      );
      boss.rotation.z = Math.PI / 2;
      boss.position.set(-0.18 * heightScale, -0.22 * heightScale, 0.18);
      leftArmPivot.add(shield, boss);
    } else if (unit.role === 'spearman') {
      // Round Buckler Shield
      const buckler = new THREE.Mesh(
        new THREE.CylinderGeometry(0.24, 0.24, 0.08, 8),
        teamMat,
      );
      buckler.rotation.z = Math.PI / 2;
      buckler.position.set(-0.08, -0.22, 0.14);
      leftArmPivot.add(buckler);
    } else if (unit.role === 'bow_hunter') {
      // Large Recurve Bow + Bowstring
      const bowArc = new THREE.Mesh(
        new THREE.TorusGeometry(0.34, 0.04, 6, 12, Math.PI),
        woodMat,
      );
      bowArc.rotation.y = Math.PI / 2;
      bowArc.position.set(0, -0.22, 0.28);
      leftArmPivot.add(bowArc);
    }

    // Articulated Right Arm + Signature Weapon
    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.29 * heightScale, 0.84 * heightScale, 0);
    const rightArmMesh = new THREE.Mesh(armGeo, skinMat);
    rightArmMesh.position.y = -0.18 * heightScale;
    rightArmPivot.add(rightArmMesh);

    const weaponGroup = new THREE.Group();
    weaponGroup.position.set(0, -0.32 * heightScale, 0.12 * heightScale);

    if (unit.role === 'worker') {
      const handle = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.04, 0.58, 5),
        woodMat,
      );
      handle.rotation.x = Math.PI / 2;
      const pickHead = new THREE.Mesh(
        new THREE.BoxGeometry(0.34, 0.09, 0.1),
        weaponMat,
      );
      pickHead.position.set(0, 0, 0.26);
      weaponGroup.add(handle, pickHead);
    } else if (unit.role === 'spearman') {
      const shaft = new THREE.Mesh(
        new THREE.CylinderGeometry(0.038, 0.042, 1.55, 6),
        woodMat,
      );
      shaft.rotation.x = Math.PI / 2;
      shaft.position.z = 0.42;
      const tip = new THREE.Mesh(
        new THREE.ConeGeometry(0.1, 0.38, 5),
        weaponMat,
      );
      tip.rotation.x = Math.PI / 2;
      tip.position.z = 1.25;
      const tassel = new THREE.Mesh(
        new THREE.ConeGeometry(0.08, 0.18, 5),
        teamMat,
      );
      tassel.position.z = 0.98;
      weaponGroup.add(shaft, tip, tassel);
    } else if (unit.role === 'shaman') {
      const staff = new THREE.Mesh(
        new THREE.CylinderGeometry(0.042, 0.05, 1.28, 5),
        woodMat,
      );
      const orb = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.2, 0),
        fireMat,
      );
      orb.position.y = 0.68;
      weaponGroup.add(staff, orb);
    } else if (unit.role === 'slinger') {
      const cord = new THREE.Mesh(
        new THREE.CylinderGeometry(0.022, 0.022, 0.48, 4),
        woodMat,
      );
      const pouchStone = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.13, 0),
        weaponMat,
      );
      pouchStone.position.y = -0.26;
      weaponGroup.add(cord, pouchStone);
    } else {
      // Clubber, Shield Bearer, Scout, Hero
      const haft = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.045 * heightScale,
          0.075 * heightScale,
          0.74 * heightScale,
          6,
        ),
        woodMat,
      );
      haft.rotation.x = Math.PI / 2.2;
      haft.position.z = 0.26 * heightScale;
      const maulHead = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.2 * heightScale, 0),
        unit.kind === 'hero' ? fireMat : weaponMat,
      );
      maulHead.position.set(0, 0.06, 0.58 * heightScale);
      weaponGroup.add(haft, maulHead);
    }

    rightArmPivot.add(weaponGroup);
    bodyPivot.add(leftArmPivot, rightArmPivot);

    const rig: UnitAnimationRig = {
      kind: 'humanoid',
      role: unit.role,
      bodyPivot,
      headPivot,
      leftArmPivot,
      rightArmPivot,
      leftLegPivot,
      rightLegPivot,
      carryBundle,
    };
    group.userData.rig = rig;
    this.enableShadows(group);
    return group;
  }

  public animateUnitMesh(
    meshGroup: THREE.Group,
    unit: UnitEntity,
    elapsedTime: number,
  ): void {
    const rig = meshGroup.userData.rig as UnitAnimationRig | undefined;
    if (!rig) {
      return;
    }

    if (rig.carryBundle) {
      rig.carryBundle.visible = unit.carryAmount > 0;
    }

    const seedOffset = (unit.id.charCodeAt(unit.id.length - 1) || 0) * 0.7;
    const t = elapsedTime + seedOffset;
    const isMoving = unit.path.length > 0 || unit.status === 'moving';
    const isFighting =
      unit.status === 'fighting' || unit.targetEntityId !== null;
    const isWorking = unit.status === 'working' && !isMoving;

    if (rig.kind === 'machine') {
      if (rig.wheels) {
        for (const w of rig.wheels) {
          if (isMoving) {
            w.rotation.x += 0.18;
          }
        }
      }
      if (rig.quadLegs) {
        for (let i = 0; i < rig.quadLegs.length; i++) {
          const leg = rig.quadLegs[i]!;
          leg.rotation.x = isMoving
            ? Math.sin(t * 9 + i * Math.PI * 0.5) * 0.42
            : 0;
        }
      }
      if (rig.weaponArm) {
        if (isFighting) {
          if (rig.role === 'boulder_thrower' || rig.role === 'fire_catapult') {
            const cycle = (t * 2.6) % 1;
            rig.weaponArm.rotation.x =
              cycle < 0.75 ? -0.75 + cycle * 0.5 : 0.65;
          } else if (rig.role === 'bone_ram') {
            rig.weaponArm.position.z = Math.sin(t * 8) * 0.42;
          } else {
            rig.weaponArm.position.z = 0.15 + Math.sin(t * 10) * 0.16;
            rig.weaponArm.rotation.x = Math.sin(t * 10) * 0.18;
          }
        } else {
          rig.weaponArm.rotation.x =
            rig.role === 'boulder_thrower' || rig.role === 'fire_catapult'
              ? -0.45
              : 0;
          rig.weaponArm.position.z = rig.role === 'bone_ram' ? 0 : 0.15;
        }
      }
      rig.bodyPivot.position.y = isMoving
        ? Math.abs(Math.sin(t * 10)) * 0.06
        : 0;
      return;
    }

    if (rig.kind === 'beast') {
      if (rig.quadLegs) {
        for (let i = 0; i < rig.quadLegs.length; i++) {
          const leg = rig.quadLegs[i]!;
          const strideSpeed = isFighting ? 12 : 10;
          leg.rotation.x =
            isMoving || isFighting
              ? Math.sin(t * strideSpeed + (i % 2) * Math.PI) * 0.52
              : 0;
        }
      }
      if (rig.headPivot) {
        if (isFighting) {
          rig.headPivot.rotation.x = Math.sin(t * 11) * 0.55;
          rig.bodyPivot.position.z = Math.max(0, Math.sin(t * 11)) * 0.24;
        } else if (isMoving) {
          rig.headPivot.rotation.x = Math.sin(t * 10) * 0.15;
          rig.bodyPivot.position.z = 0;
        } else {
          rig.headPivot.rotation.x = Math.sin(t * 2.2) * 0.08;
          rig.headPivot.rotation.y = Math.cos(t * 1.5) * 0.12;
          rig.bodyPivot.position.z = 0;
        }
      }
      return;
    }

    const {
      bodyPivot,
      headPivot,
      leftArmPivot,
      rightArmPivot,
      leftLegPivot,
      rightLegPivot,
    } = rig;

    if (
      isWorking &&
      leftArmPivot &&
      rightArmPivot &&
      leftLegPivot &&
      rightLegPivot
    ) {
      const chopWave = Math.sin(t * 8.5);
      rightArmPivot.rotation.x = -1.1 + chopWave * 1.25;
      leftArmPivot.rotation.x = -0.45 + chopWave * 0.35;
      bodyPivot.rotation.x = Math.max(0, chopWave) * 0.28;
      bodyPivot.position.y = Math.abs(chopWave) * 0.05;
      leftLegPivot.rotation.x = -0.15;
      rightLegPivot.rotation.x = 0.15;
      if (headPivot) {
        headPivot.rotation.x = chopWave * 0.18;
      }
      return;
    }

    if (
      isFighting &&
      leftArmPivot &&
      rightArmPivot &&
      leftLegPivot &&
      rightLegPivot
    ) {
      const atkWave = Math.sin(t * 10.5);

      if (rig.role === 'spearman') {
        rightArmPivot.rotation.x = -0.4 + atkWave * 0.65;
        rightArmPivot.position.z = Math.max(0, atkWave) * 0.28;
        leftArmPivot.rotation.x = -0.5;
        bodyPivot.rotation.y = atkWave * 0.25;
      } else if (rig.role === 'slinger') {
        rightArmPivot.rotation.x = t * 15;
        leftArmPivot.rotation.x = -0.4;
        bodyPivot.rotation.y = Math.sin(t * 7) * 0.22;
      } else if (rig.role === 'bow_hunter') {
        leftArmPivot.rotation.x = -1.35;
        rightArmPivot.rotation.x = -1.2 + atkWave * 0.45;
        bodyPivot.rotation.y = -0.25;
      } else if (rig.role === 'shaman') {
        rightArmPivot.rotation.x = -1.4 + Math.sin(t * 6) * 0.4;
        leftArmPivot.rotation.x = -1.1 - Math.sin(t * 6) * 0.4;
        bodyPivot.position.y = Math.abs(Math.sin(t * 6)) * 0.1;
      } else {
        rightArmPivot.rotation.x = -1.0 + atkWave * 1.35;
        rightArmPivot.position.z = 0;
        leftArmPivot.rotation.x = -0.6 - atkWave * 0.45;
        bodyPivot.rotation.x = Math.max(0, atkWave) * 0.24;
        bodyPivot.rotation.y = atkWave * 0.3;
      }

      leftLegPivot.rotation.x = -0.25 + atkWave * 0.2;
      rightLegPivot.rotation.x = 0.25 - atkWave * 0.2;
      return;
    }

    if (
      isMoving &&
      leftArmPivot &&
      rightArmPivot &&
      leftLegPivot &&
      rightLegPivot
    ) {
      const stride = Math.sin(t * 11);
      leftLegPivot.rotation.x = stride * 0.65;
      rightLegPivot.rotation.x = -stride * 0.65;
      leftArmPivot.rotation.x = -stride * 0.5;
      rightArmPivot.rotation.x = stride * 0.5;
      rightArmPivot.position.z = 0;
      bodyPivot.position.y = Math.abs(stride) * 0.07;
      bodyPivot.rotation.x = 0.08;
      bodyPivot.rotation.y = 0;
      return;
    }

    if (leftArmPivot && rightArmPivot && leftLegPivot && rightLegPivot) {
      const breath = Math.sin(t * 2.6);
      leftLegPivot.rotation.x = 0;
      rightLegPivot.rotation.x = 0;
      leftArmPivot.rotation.x = breath * 0.06;
      rightArmPivot.rotation.x = -0.15 + breath * 0.08;
      rightArmPivot.position.z = 0;
      bodyPivot.position.y = Math.max(0, breath) * 0.025;
      bodyPivot.rotation.x = 0;
      bodyPivot.rotation.y = 0;
      if (headPivot) {
        headPivot.rotation.x = 0;
        headPivot.rotation.y = Math.sin(t * 1.2) * 0.14;
      }
    }
  }

  public animateStructureLegs(
    meshGroup: THREE.Group,
    isMoving: boolean,
    elapsedTime: number,
  ): void {
    const legs = meshGroup.userData.legs as THREE.Object3D[] | undefined;
    if (!legs) {
      return;
    }
    const baseHeight = legs.length === 6 ? 0.65 : 0.25;
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i]!;
      if (isMoving) {
        const phase = elapsedTime * 8.0 + i * 1.1;
        leg.position.y = baseHeight + Math.max(0, Math.sin(phase)) * 0.28;
        leg.rotation.x = Math.cos(phase) * 0.32;
      } else {
        leg.position.y = baseHeight;
        leg.rotation.x = 0;
      }
    }
  }
}