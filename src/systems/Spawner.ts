/**
 * STONEWALKER — Top-Tier Machine Crawler Spawner System (Section 8)
 * Mammoth Fortresses and Titan Walkers spawn a small fighting machine ("Crawler")
 * every 30 seconds for free, strictly capped at 8 living Crawlers per parent.
 * When a Crawler dies, spawning resumes up to the cap. Crawlers follow and defend their parent.
 */

import { BALANCE } from '../data/balance';
import { MACHINES } from '../data/machines';
import type { EntityId, UnitEntity } from '../data/types';
import { createMachineEntity } from '../entities/Machine';
import type { WorldGrid } from '../world/Grid';
import { Pathfinder } from './Pathfinding';

export class SpawnerSystem {
  public static update(
    units: ReadonlyMap<EntityId, UnitEntity>,
    grid: WorldGrid,
    dt: number,
    onSpawnCrawler: (crawler: UnitEntity) => void,
  ): void {
    for (const parent of units.values()) {
      if (parent.hp <= 0 || parent.kind !== 'machine') {
        continue;
      }
      const def = MACHINES[parent.role as keyof typeof MACHINES];
      if (!def || !def.spawnsCrawler) {
        continue;
      }

      // 1. Prune dead Crawlers from activeCrawlerIds so spawning resumes when one dies
      parent.activeCrawlerIds = parent.activeCrawlerIds.filter((cId) => {
        const c = units.get(cId);
        return c !== undefined && c.hp > 0;
      });

      // 2. Keep living Crawlers following and defending their parent
      for (let i = 0; i < parent.activeCrawlerIds.length; i++) {
        const crawler = units.get(parent.activeCrawlerIds[i]!);
        if (!crawler || crawler.hp <= 0) {
          continue;
        }
        if (parent.targetEntityId) {
          crawler.targetEntityId = parent.targetEntityId;
        }
        const angle = (i * Math.PI * 2) / BALANCE.CRAWLER_MAX_PER_PARENT;
        const followSpot = {
          x: parent.position.x + Math.cos(angle) * 2.6,
          z: parent.position.z + Math.sin(angle) * 2.6,
        };
        crawler.guardSpot = followSpot;
        const distFromParent = Math.hypot(
          crawler.position.x - followSpot.x,
          crawler.position.z - followSpot.z,
        );
        if (
          !crawler.targetEntityId &&
          crawler.path.length === 0 &&
          distFromParent > 2.2
        ) {
          crawler.path = Pathfinder.findPath(
            grid,
            crawler.position,
            followSpot,
          );
        }
      }

      // 3. Enforce strict cap of 8 living Crawlers per parent
      if (parent.activeCrawlerIds.length >= BALANCE.CRAWLER_MAX_PER_PARENT) {
        parent.crawlerSpawnTimer = BALANCE.CRAWLER_SPAWN_INTERVAL_SECONDS;
        continue;
      }

      parent.crawlerSpawnTimer -= dt;
      if (parent.crawlerSpawnTimer <= 0) {
        parent.crawlerSpawnTimer = BALANCE.CRAWLER_SPAWN_INTERVAL_SECONDS;
        const slot = parent.activeCrawlerIds.length;
        const angle = (slot * Math.PI * 2) / BALANCE.CRAWLER_MAX_PER_PARENT;
        const spawnPos = {
          x: Math.max(
            2,
            Math.min(grid.size - 3, parent.position.x + Math.cos(angle) * 2.4),
          ),
          z: Math.max(
            2,
            Math.min(grid.size - 3, parent.position.z + Math.sin(angle) * 2.4),
          ),
        };
        const crawler = createMachineEntity({
          role: 'crawler',
          faction: parent.faction,
          position: spawnPos,
          parentMachineId: parent.id,
          guardSpot: spawnPos,
        });
        parent.activeCrawlerIds.push(crawler.id);
        onSpawnCrawler(crawler);
      }
    }
  }
}