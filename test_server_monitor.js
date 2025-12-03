// Test server monitoring functionality
const { status } = require('minecraft-server-util');

async function testServerStatus() {
  try {
    console.log('Testing server status for oldfag.org...');
    const response = await status('oldfag.org', 25565, {
      timeout: 5000,
      enableSRV: true
    });
    
    console.log('\n✅ Server Status:');
    console.log(`   Online: ${response.players.online}/${response.players.max}`);
    console.log(`   Version: ${response.version.name}`);
    console.log(`   Latency: ${response.roundTripLatency}ms`);
    console.log(`   MOTD: ${response.motd.clean}`);
    
  } catch (err) {
    console.log('\n❌ Error:', err.message);
  }
}

// Function to format uptime
function formatUptime(ms) {
  if (!ms) return 'Unknown';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h ${minutes % 60}m`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

// Test uptime formatting
console.log('\n📊 Testing uptime formatting:');
console.log('   30 seconds:', formatUptime(30000));
console.log('   5 minutes:', formatUptime(5 * 60 * 1000));
console.log('   2 hours:', formatUptime(2 * 60 * 60 * 1000));
console.log('   3 days:', formatUptime(3 * 24 * 60 * 60 * 1000));

// Run server status test
testServerStatus();
