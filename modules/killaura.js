/**
 * KillAura Module
 * Automatically attacks nearby entities based on configuration
 */

class KillAura {
  constructor(bot, notifier = null) {
    this.bot = bot;
    this.notify = typeof notifier === 'function' ? notifier : null;
    this.enabled = false;
    this.interval = null;
    this.targets = {
      hostile: false,
      passive: false,
      players: false
    };
    this.range = 4.5; // Attack range in blocks
    this.attackCooldown = 500; // ms between attacks
    this.minSafeHealth = 18; // Auto-pause attacking below this health
    this._lastHealth = null;
    this._lastAttackTs = 0;
    this._thornsHits = 0; // consecutive suspected thorns hits
    this._healthListenerBound = null;
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

    // health monitoring
    this._lastHealth = this.bot.health;
    this._healthListenerBound = () => {
      // Auto-pause if health is low
      if (this.enabled && this.bot.health < this.minSafeHealth) {
        this._safetyStop('Health low');
      }

      // Detect potential thorns: health drops shortly after attack
      const now = Date.now();
      if (this.enabled && this._lastAttackTs && (now - this._lastAttackTs) < 400) {
        if (this.bot.health < this._lastHealth) {
          this._thornsHits++;
          if (this._thornsHits >= 2) {
            this._safetyStop('Possible thorns detected');
          }
        }
      }
      this._lastHealth = this.bot.health;
    };
    this.bot.on('health', this._healthListenerBound);
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
    if (this._healthListenerBound) {
      try { this.bot.removeListener('health', this._healthListenerBound); } catch {}
      this._healthListenerBound = null;
    }
    this._thornsHits = 0;
    this._lastAttackTs = 0;
    
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

    // safety: don't attack while eating or too low health
    if (this.bot.health < this.minSafeHealth) return;

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
        this._lastAttackTs = Date.now();
        console.log(`[KillAura] Attacked ${nearestEntity.name || nearestEntity.type} at ${nearestDistance.toFixed(1)} blocks`);
      } catch (err) {
        console.error('[KillAura] Attack error:', err.message);
      }
    }
  }

  /**
   * Internal: stop module due to safety reasons and notify
   */
  _safetyStop(reason) {
    this.disable();
    console.log(`[KillAura] Auto-disabled: ${reason}`);
    if (this.notify) {
      try {
        this.notify(`⚠️ KillAura auto-disabled: ${reason}`);
      } catch {}
    }
  }

  /**
   * Get module status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      targets: this.targets,
      range: this.range,
      minSafeHealth: this.minSafeHealth
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
