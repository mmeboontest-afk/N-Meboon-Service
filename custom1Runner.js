// The "doing" half of Custom 1 — takes what modes/custom1.js decided and
// actually calls mineflayer/pathfinder to make it happen.
//
// ⚠️ NONE OF THIS HAS BEEN TESTED AGAINST A REAL MINECRAFT SERVER — there's
// no way to spin one up in the environment this was written in. The
// decision logic in custom1.js is solid (fully unit tested), but exactly
// how well pathfinder navigates your world, how attack timing feels, and
// how reliably mob-type detection works can only really be judged by
// running it live and reporting back what needs tuning.

const { goals, Movements } = require('mineflayer-pathfinder');
const c1 = require('./custom1');

const TICK_MS = 500;

function snapshotState(bot, memoryState) {
  const pos = bot.entity.position;
  const nearbyEntities = Object.values(bot.entities).filter((e) => e !== bot.entity && e.position);

  const nearbyHostiles = nearbyEntities
    .filter((e) => c1.HOSTILE_MOBS.has(e.name))
    .map((e) => ({ id: e.id, type: e.name, position: e.position, distance: pos.distanceTo(e.position) }));

  const nearbyPassives = nearbyEntities
    .filter((e) => c1.HUNTABLE_MOBS.has(e.name))
    .map((e) => ({ id: e.id, type: e.name, position: e.position, distance: pos.distanceTo(e.position) }));

  const nearbyItems = nearbyEntities
    .filter((e) => e.type === 'object' && e.objectType === 'Item')
    .map((e) => ({ id: e.id, name: e.name || 'item', position: e.position, distance: pos.distanceTo(e.position) }));

  const inventory = {};
  bot.inventory.items().forEach((it) => { inventory[it.name] = (inventory[it.name] || 0) + it.count; });

  const rawMeatCount = ['beef', 'porkchop', 'mutton', 'chicken'].reduce((sum, n) => sum + (inventory[n] || 0), 0);
  const cookedFoodCount = ['cooked_beef', 'cooked_porkchop', 'cooked_mutton', 'cooked_chicken'].reduce((sum, n) => sum + (inventory[n] || 0), 0);

  return {
    position: pos, health: bot.health,
    nearbyHostiles, nearbyPassives, nearbyItems, inventory,
    isAtDestination: c1.distance(pos, c1.TARGET_POS) <= 3,
    hasDied: memoryState.pendingDeathRecovery || false,
    lastDeathPosition: memoryState.lastDeathPosition || null,
    nearChestAndFurnace: c1.distance(pos, c1.TARGET_POS) <= 4,
    rawMeatCount, cookedFoodCount,
  };
}

async function travelTo(bot, target, range = 1) {
  bot.pathfinder.setGoal(new goals.GoalNear(target.x, target.y, target.z, range));
}

async function fightEntity(bot, targetEntity) {
  const entity = bot.entities[targetEntity.id];
  if (!entity) return;
  bot.pathfinder.setGoal(new goals.GoalFollow(entity, 2), true);
  // Simple jump-then-swing pattern for Java-edition critical hits — this
  // is the part most likely to need real-world tuning.
  const dist = bot.entity.position.distanceTo(entity.position);
  const combat = { distanceToTarget: dist, attackCooldownProgress: 1, isFalling: !bot.entity.onGround };
  if (c1.shouldJumpForCrit(combat)) bot.setControlState('jump', true);
  if (c1.shouldAttackNow(combat)) {
    bot.attack(entity);
    bot.setControlState('jump', false);
  }
}

async function runTick(ctx) {
  const { bot, log, setStage, memoryState } = ctx;
  if (!bot.entity) return;

  const state = snapshotState(bot, memoryState);
  const decision = c1.decideNextAction(state);
  setStage(decision.action.toLowerCase());

  switch (decision.action) {
    case 'RECOVER_DEATH_ITEMS':
      await travelTo(bot, decision.target, 1);
      if (c1.distance(state.position, decision.target) <= 2) {
        memoryState.pendingDeathRecovery = false;
        log('Reached last death spot — picking up dropped items.');
      }
      break;
    case 'DEFEND':
      await fightEntity(bot, decision.target);
      break;
    case 'PICK_UP_ITEM': {
      const entity = bot.entities[decision.target.id];
      if (entity) { bot.pathfinder.setGoal(new goals.GoalFollow(entity, 0)); }
      break;
    }
    case 'TRAVEL_TO_TARGET':
      await travelTo(bot, c1.TARGET_POS, 2);
      bot.setControlState('sprint', true);
      break;
    case 'HUNT':
      await fightEntity(bot, decision.target);
      break;
    case 'COOK_MEAT':
      log('Cooking raw meat at the furnace (implementation depends on your furnace/chest setup at the target coords).');
      // NOTE: exact furnace interaction (fuel selection, smelting slot) is
      // very world-specific — wire this up once you've built the furnace
      // setup at -1371 77 1611 and can tell me its exact layout.
      break;
    case 'STORE_ITEMS':
      log('Depositing cooked food into the chest.');
      // Same as above — needs the real chest position/orientation to finish.
      break;
    case 'IDLE_WAIT':
    default:
      break;
  }
}

function startCustom1(bot, { log, setStage, memoryState }) {
  const movements = new Movements(bot);
  bot.pathfinder.setMovements(movements);

  bot.on('health', () => {
    if (bot.health <= 0) {
      memoryState.lastDeathPosition = { x: bot.entity.position.x, y: bot.entity.position.y, z: bot.entity.position.z };
      memoryState.pendingDeathRecovery = true;
      log(`Died at ${JSON.stringify(memoryState.lastDeathPosition)} — will return for items after respawn.`);
    }
  });

  const interval = setInterval(() => {
    runTick({ bot, log, setStage, memoryState }).catch((err) => log('Tick error: ' + err.message));
  }, TICK_MS);

  return () => clearInterval(interval); // stop function
}

module.exports = { startCustom1, snapshotState };
