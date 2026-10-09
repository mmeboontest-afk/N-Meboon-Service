// ---------------------------------------------------------------
// Custom 1 mode — decision logic
// ---------------------------------------------------------------
// This file is split in two halves on purpose:
//   1. decide*() functions — PURE functions. Given a plain-object snapshot
//      of what the bot currently sees/has, they return what to do next.
//      No mineflayer calls inside them at all, so they can be unit tested
//      with fake state and no real Minecraft server. This is where the
//      actual "AI" reasoning lives.
//   2. run*() functions in custom1Runner.js — the untestable half that
//      calls real mineflayer/pathfinder APIs to carry out whatever
//      decide*() returned. This is the part that needs live tuning once
//      you actually run it against a server, since combat timing, jump
//      distances, and pathfinding quirks can only really be judged by
//      watching the bot play.

const TARGET_POS = { x: -1371, y: 77, z: 1611 };
const HUNTABLE_MOBS = new Set(['pig', 'cow', 'sheep', 'chicken']);
const HOSTILE_MOBS = new Set(['zombie', 'skeleton']);

function distance(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2);
}

/**
 * Top-level decision for one "tick" of Custom 1. `state` shape:
 * {
 *   position: {x,y,z}, health: number,
 *   nearbyHostiles: [{id, type, position, distance}],
 *   nearbyPassives: [{id, type, position, distance}],
 *   nearbyItems:    [{id, name, position, distance}],       // dropped food/weapons on the ground
 *   inventory: { [itemName]: count },
 *   isAtDestination: boolean,
 *   hasDied: boolean, lastDeathPosition: {x,y,z}|null,
 *   nearChestAndFurnace: boolean,   // true once close enough to the storage/furnace at TARGET_POS
 *   rawMeatCount: number, cookedFoodCount: number,
 * }
 * Returns one of:
 *   { action: 'RECOVER_DEATH_ITEMS', target: {x,y,z} }
 *   { action: 'DEFEND', target: hostileEntity }
 *   { action: 'PICK_UP_ITEM', target: itemEntity }
 *   { action: 'TRAVEL_TO_TARGET' }
 *   { action: 'HUNT', target: passiveEntity }
 *   { action: 'COOK_MEAT' }
 *   { action: 'STORE_ITEMS' }
 *   { action: 'IDLE_WAIT' }
 */
function decideNextAction(state) {
  // Priority 1 — survival: always fight back if a hostile is close enough to threaten us.
  const threateningHostile = state.nearbyHostiles
    .filter((h) => h.distance <= 12)
    .sort((a, b) => a.distance - b.distance)[0];
  if (threateningHostile) {
    return { action: 'DEFEND', target: threateningHostile };
  }

  // Priority 2 — just died: go recover items from the last death spot.
  if (state.hasDied && state.lastDeathPosition) {
    return { action: 'RECOVER_DEATH_ITEMS', target: state.lastDeathPosition };
  }

  // Priority 3 — while still traveling, grab useful items lying on the way
  // (food/weapons), per "หาของกินเอาดาบนู้นนี่นั้นด้วยระหว่างเดินทาง".
  if (!state.isAtDestination) {
    const usefulItem = state.nearbyItems
      .filter((i) => i.distance <= 6)
      .sort((a, b) => a.distance - b.distance)[0];
    if (usefulItem) return { action: 'PICK_UP_ITEM', target: usefulItem };
    return { action: 'TRAVEL_TO_TARGET' };
  }

  // From here on, we're at the destination (-1371 77 1611).

  // Priority 4 — cook any raw meat we're holding, then store everything.
  if (state.rawMeatCount > 0 && state.nearChestAndFurnace) {
    return { action: 'COOK_MEAT' };
  }
  if (state.cookedFoodCount > 0 && state.nearChestAndFurnace) {
    return { action: 'STORE_ITEMS' };
  }

  // Priority 5 — go hunt a passive mob for food.
  const huntTarget = state.nearbyPassives
    .filter((p) => HUNTABLE_MOBS.has(p.type))
    .sort((a, b) => a.distance - b.distance)[0];
  if (huntTarget) return { action: 'HUNT', target: huntTarget };

  // Nothing to do this tick — wait for something to appear.
  return { action: 'IDLE_WAIT' };
}

/** Should the bot sprint-jump right now? (normal travel movement style) */
function shouldSprintJump(state) {
  // Sprint-jumping is the default travel gait; only walk normally when
  // right up against something we're about to interact with (mining,
  // opening a chest, etc.) to avoid overshooting.
  return !state.isInteractingAtCloseRange;
}

/**
 * Java Edition melee timing: attacks only do full damage once the attack
 * cooldown has fully recharged, and hitting an enemy while falling (jumped
 * just before impact) lands a critical hit. This decides whether NOW is a
 * good moment to swing.
 * `combat` shape: { distanceToTarget, attackCooldownProgress (0-1), isFalling }
 */
function shouldAttackNow(combat) {
  const IN_RANGE = combat.distanceToTarget <= 3;
  const COOLDOWN_READY = combat.attackCooldownProgress >= 0.95;
  return IN_RANGE && COOLDOWN_READY;
}

/** Should the bot jump right now to land a critical hit on its next swing? */
function shouldJumpForCrit(combat) {
  return combat.distanceToTarget <= 3.5 && combat.attackCooldownProgress >= 0.8 && !combat.isFalling;
}

module.exports = {
  TARGET_POS,
  HUNTABLE_MOBS,
  HOSTILE_MOBS,
  distance,
  decideNextAction,
  shouldSprintJump,
  shouldAttackNow,
  shouldJumpForCrit,
};
