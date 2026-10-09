// The "doing" half of PVP mode — takes what mode-pvp-logic.js decided and
// calls real mineflayer/pathfinder APIs to carry it out.
//
// ⚠️ UNTESTED AGAINST A REAL SERVER, same caveat as Custom 1's runner — no
// Minecraft server available in the environment this was written in. The
// decision logic (mode-pvp-logic.js) is fully unit tested; this half
// needs live tuning once you actually fight something with it.

const { goals } = require('mineflayer-pathfinder');
const pvp = require('./mode-pvp-logic');

const TICK_MS = 250; // faster tick than Custom 1 — combat needs tighter timing
const ATTACKER_FORGET_MS = 5000; // stop treating someone as "the attacker" if they haven't hit us in this long

function findEquippedItem(bot, destination) {
  const slot = destination === 'offhand' ? bot.inventory.slots[45] : bot.heldItem;
  return slot ? slot.name : null;
}

function snapshotState(bot, combatState) {
  const inventory = {};
  bot.inventory.items().forEach((it) => { inventory[it.name] = (inventory[it.name] || 0) + it.count; });

  let attacker = null;
  if (combatState.lastAttackerId && Date.now() - combatState.lastAttackedAt < ATTACKER_FORGET_MS) {
    const entity = bot.entities[combatState.lastAttackerId];
    if (entity) {
      attacker = { id: entity.id, position: entity.position, distance: bot.entity.position.distanceTo(entity.position) };
    }
  }

  return {
    health: bot.health,
    inventory,
    equippedOffhand: findEquippedItem(bot, 'offhand'),
    equippedWeapon: findEquippedItem(bot, 'hand'),
    attacker,
  };
}

async function runTick(ctx) {
  const { bot, log, setStage, combatState } = ctx;
  if (!bot.entity) return;

  const state = snapshotState(bot, combatState);
  const decision = pvp.decideNextPvpAction(state);
  setStage(decision.action.toLowerCase());

  switch (decision.action) {
    case 'EQUIP_TOTEM':
      await bot.equip(bot.inventory.items().find((i) => i.name === 'totem_of_undying'), 'off-hand').catch((e) => log('Equip totem failed: ' + e.message));
      log('🛡️ Equipped Totem of Undying — low HP.');
      break;

    case 'EAT_GOLDEN_APPLE': {
      const item = bot.inventory.items().find((i) => i.name === decision.item);
      if (item) {
        await bot.equip(item, 'hand').catch(() => {});
        await bot.consume().catch((e) => log('Eating failed: ' + e.message));
        log(`🍎 Ate ${decision.item} — recovering HP.`);
      }
      break;
    }

    case 'EQUIP_WEAPON': {
      const item = bot.inventory.items().find((i) => i.name === decision.item);
      if (item) await bot.equip(item, 'hand').catch((e) => log('Equip weapon failed: ' + e.message));
      break;
    }

    case 'ATTACK': {
      const entity = bot.entities[decision.target.id];
      if (!entity) break;

      // Face the target and circle-strafe instead of walking straight at
      // them — this is the "natural" movement that was asked for.
      bot.lookAt(entity.position.offset(0, entity.height ?? 1.6, 0)).catch(() => {});
      const dir = pvp.strafeDirection(combatState.tickCount || 0);
      bot.setControlState('left', dir === 'left');
      bot.setControlState('right', dir === 'right');
      combatState.tickCount = (combatState.tickCount || 0) + 1;

      bot.pathfinder.setGoal(new goals.GoalFollow(entity, pvp.ATTACK_RANGE - 1), true);

      const dist = bot.entity.position.distanceTo(entity.position);
      const combat = { distanceToTarget: dist, attackCooldownProgress: 1, isFalling: !bot.entity.onGround };
      if (pvp.shouldJumpForCrit(combat)) bot.setControlState('jump', true);
      if (pvp.shouldAttackNow(combat)) {
        bot.attack(entity);
        bot.setControlState('jump', false);
      }
      break;
    }

    case 'GUARD':
    default:
      bot.setControlState('left', false);
      bot.setControlState('right', false);
      break;
  }
}

function startMode(bot, { log, setStage }) {
  const combatState = { lastAttackerId: null, lastAttackedAt: 0, tickCount: 0 };

  // mineflayer emits 'entityHurt' broadly; we only care about damage done
  // TO us, and who's close enough to plausibly be the one responsible.
  bot.on('entityHurt', (entity) => {
    if (entity !== bot.entity) return;
    const attacker = Object.values(bot.entities)
      .filter((e) => e.type === 'player' && e !== bot.entity)
      .sort((a, b) => bot.entity.position.distanceTo(a.position) - bot.entity.position.distanceTo(b.position))[0];
    if (attacker) {
      combatState.lastAttackerId = attacker.id;
      combatState.lastAttackedAt = Date.now();
      log(`⚔️ Under attack from ${attacker.username || attacker.id} — fighting back.`);
    }
  });

  const interval = setInterval(() => {
    runTick({ bot, log, setStage, combatState }).catch((err) => log('PVP tick error: ' + err.message));
  }, TICK_MS);

  return () => {
    clearInterval(interval);
    bot.setControlState('left', false);
    bot.setControlState('right', false);
  };
}

module.exports = { startMode, snapshotState };
