# Bot Modules

This directory contains modular features for the Minecraft bot.

## Available Modules

### KillAura (`killaura.js`)
Automatically attacks nearby entities based on configuration.

**Features:**
- Configurable target types (hostile mobs, passive mobs, players)
- Adjustable attack range (default: 4.5 blocks)
- Attack cooldown to prevent spam (default: 500ms)
- Can be toggled on/off via Discord button

**Usage:**
- Click the "⚔️ KillAura" button in the Server Status message
- Select which entities to attack (can select multiple)
- The module will automatically attack nearby targets
- Click the button again to disable

**Configuration:**
```javascript
killAuraModule.range = 4.5; // Attack range in blocks
killAuraModule.attackCooldown = 500; // ms between attacks
```

## Creating New Modules

To create a new module:

1. Create a new file in this directory (e.g., `mymodule.js`)
2. Export a class with the following methods:
   - `constructor(bot)` - Initialize with bot instance
   - `enable()` - Enable the module
   - `disable()` - Disable the module
   - `getStatus()` - Return module status object
   - `getStatusString()` - Return status string for display
3. Import the module in `bot.js`
4. Add a button to `createStatusButtons()`
5. Add interaction handler for the button

Example structure:
```javascript
class MyModule {
  constructor(bot) {
    this.bot = bot;
    this.enabled = false;
  }
  
  enable() {
    this.enabled = true;
    console.log('[MyModule] Enabled');
  }
  
  disable() {
    this.enabled = false;
    console.log('[MyModule] Disabled');
  }
  
  getStatus() {
    return { enabled: this.enabled };
  }
  
  getStatusString() {
    return this.enabled ? '✅ Active' : '❌ Disabled';
  }
}

module.exports = MyModule;
```
