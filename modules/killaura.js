/**
 * KillAura Module
 * Automatically attacks nearby entities based on configuration
 */

class KillAura {
  constructor(bot) {
    this.bot = bot;
    this.enabled = false;
    this.interval = null;
    this.targets = {
      hostile: false,
      passive: false,
      players: false
    };
    this.range = 4.5; // Attack range in blocks
    this.attackCooldown = 500; // ms between attacks
  }

  /**
   * Enable the killaura module
   * @param {Object} targets - Object with hostile, passive, players flags
   */
  enable(targets) {
    if (this.enabled) return;
    
    this.targets = { ...this.targets, ...targets };
    this.enabled = true;
    
    console.log('[KillAura] Enabled with targets:', this.targets);
    
    this.interval = setInterval(() => {
      this.attack();
    }, this.attackCooldown);
  }

  /**
   * Disable the killaura module
   */
  disable() {
    if (!this.enabled) return;
    
    this.enabled = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    
    console.log('[KillAura] Disabled');
  }

  /**
   * Toggle the module on/off
   */
  toggle(targets) {
    if (this.enabled) {
      this.disable();
    } else {
      this.enable(targets);
    }
  }

  /**
   * Check if entity is a valid target
   */
  isValidTarget(entity) {
    if (!entity || !entity.position) return false;
    if (entity === this.bot.entity) return false;
    if (!entity.isValid) return false;

    const distance = this.bot.entity.position.distanceTo(entity.position);
    if (distance > this.range) return false;

    // Check entity type
    if (entity.type === 'player') {
      return this.targets.players;
    } else if (entity.type === 'mob') {
      const hostileMobs = [
        'zombie', 'skeleton', 'creeper', 'spider', 'enderman',
        'witch', 'blaze', 'ghast', 'slime', 'phantom', 'drowned',
        'husk', 'stray', 'cave_spider', 'silverfish', 'vindicator',
        'evoker', 'pillager', 'ravager', 'vex', 'guardian',
        'elder_guardian', 'shulker', 'wither_skeleton', 'zombified_piglin',
        'piglin', 'hoglin', 'zoglin', 'magma_cube'
      ];
      
      const passiveMobs = [
        'cow', 'pig', 'sheep', 'chicken', 'rabbit', 'horse',
        'donkey', 'mule', 'llama', 'cat', 'ocelot', 'wolf',
        'parrot', 'bat', 'squid', 'cod', 'salmon', 'tropical_fish',
        'pufferfish', 'villager', 'iron_golem', 'snow_golem'
      ];

      const mobName = entity.name ? entity.name.toLowerCase() : '';
      
      if (hostileMobs.some(mob => mobName.includes(mob))) {
        return this.targets.hostile;
      }
      
      if (passiveMobs.some(mob => mobName.includes(mob))) {
        return this.targets.passive;
      }
    }

    return false;
  }

  /**
   * Find and attack the nearest valid target
   */
  attack() {
    if (!this.bot || !this.bot.entity || !this.enabled) return;

    let nearestEntity = null;
    let nearestDistance = this.range;

    // Find nearest valid target
    for (const entity of Object.values(this.bot.entities)) {
      if (!this.isValidTarget(entity)) continue;

      const distance = this.bot.entity.position.distanceTo(entity.position);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestEntity = entity;
      }
    }

    // Attack nearest target
    if (nearestEntity) {
      try {
        this.bot.attack(nearestEntity);
        console.log(`[KillAura] Attacked ${nearestEntity.name || nearestEntity.type} at ${nearestDistance.toFixed(1)} blocks`);
      } catch (err) {
        console.error('[KillAura] Attack error:', err.message);
      }
    }
  }

  /**
   * Get module status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      targets: this.targets,
      range: this.range
    };
  }

  /**
   * Get status string for display
   */
  getStatusString() {
    if (!this.enabled) return '❌ Disabled';
    
    const activeTargets = [];
    if (this.targets.hostile) activeTargets.push('Hostile');
    if (this.targets.passive) activeTargets.push('Passive');
    if (this.targets.players) activeTargets.push('Players');
    
    return `✅ Active (${activeTargets.join(', ')})`;
  }
}

module.exports = KillAura;
