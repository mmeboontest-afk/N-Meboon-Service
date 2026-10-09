// ---------------------------------------------------------------
// PVP mode — decision logic (pure, same split as Custom 1: this file has
// zero mineflayer calls so it's fully unit-testable; mode-pvp-runner.js
// is the untested half that actually moves/fights).
// ---------------------------------------------------------------

const CRITICAL_HP = 6;   // out of 20 — "about to die", use the best panic item
const LOW_HP = 10;       // out of 20 — "getting dangerous", eat up if possible
const ATTACK_RANGE = 3;

// Best-to-worst, used to pick "the best weapon I'm currently holding".
const SWORD_TIERS = ['netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'golden_sword', 'wooden_sword'];
const GOLDEN_APPLES = ['enchanted_golden_apple', 'golden_apple'];

function hasItem(inventory, name) {
  return (inventory[name] || 0) > 0;
}

function bestSwordAvailable(inventory) {
  return SWORD_TIERS.find((sword) => hasItem(inventory, sword)) || null;
}

function bestGoldenAppleAvailable(inventory) {
  return GOLDEN_APPLES.find((food) => hasItem(inventory, food)) || null;
}

/**
 * `state` shape:
 * {
 *   health: number (0-20),
 *   inventory: { [itemName]: count },
 *   equippedOffhand: string|null,
 *   equippedWeapon: string|null,
 *   attacker: { id, position, distance } | null,  // nearest threatening player, if any
 * }
 * Returns one of:
 *   { action: 'EQUIP_TOTEM' }
 *   { action: 'EAT_GOLDEN_APPLE', item: string }
 *   { action: 'EQUIP_WEAPON', item: string }
 *   { action: 'ATTACK', target, movementStyle: 'strafe' }
 *   { action: 'GUARD' }  // no threat right now, just stay alert
 */
function decideNextPvpAction(state) {
  // Priority 1 — about to die: pop a totem if we're not already holding one.
  if (state.health <= CRITICAL_HP && hasItem(state.inventory, 'totem_of_undying') && state.equippedOffhand !== 'totem_of_undying') {
    return { action: 'EQUIP_TOTEM' };
  }

  // Priority 2 — dangerous HP: eat the best golden apple we have.
  if (state.health <= LOW_HP) {
    const apple = bestGoldenAppleAvailable(state.inventory);
    if (apple) return { action: 'EAT_GOLDEN_APPLE', item: apple };
  }

  // Priority 3 — nothing attacking us right now.
  if (!state.attacker) {
    return { action: 'GUARD' };
  }

  // Priority 4 — make sure we're holding the best sword we own before swinging.
  const best = bestSwordAvailable(state.inventory);
  if (best && state.equippedWeapon !== best) {
    return { action: 'EQUIP_WEAPON', item: best };
  }

  // Priority 5 — fight, circling instead of walking straight in (more natural).
  return { action: 'ATTACK', target: state.attacker, movementStyle: 'strafe' };
}

/** Same Java-edition crit timing used in Custom 1 — reused here for consistency. */
function shouldAttackNow(combat) {
  return combat.distanceToTarget <= ATTACK_RANGE && combat.attackCooldownProgress >= 0.95;
}
function shouldJumpForCrit(combat) {
  return combat.distanceToTarget <= ATTACK_RANGE + 0.5 && combat.attackCooldownProgress >= 0.8 && !combat.isFalling;
}

/** Alternates strafe direction every `switchEveryTicks` ticks — natural-looking circling instead of a straight charge. */
function strafeDirection(tickCount, switchEveryTicks = 6) {
  return Math.floor(tickCount / switchEveryTicks) % 2 === 0 ? 'left' : 'right';
}

module.exports = {
  CRITICAL_HP,
  LOW_HP,
  ATTACK_RANGE,
  SWORD_TIERS,
  GOLDEN_APPLES,
  bestSwordAvailable,
  bestGoldenAppleAvailable,
  decideNextPvpAction,
  shouldAttackNow,
  shouldJumpForCrit,
  strafeDirection,
};
