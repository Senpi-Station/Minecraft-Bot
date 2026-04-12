# 🤖 Minecraft Mineflayer AFK Bot

A customizable Minecraft bot built with Mineflayer featuring:

- 💤 Anti-AFK system  
- 👣 Player following  
- 🔄 Auto-reconnection  
- ⚙️ Easy configuration  

---

# 📦 Installation

## 1. Clone the Repository

```bash
https://github.com/Senpai-Station/Minecraft-Bot.git
cd Minecraft-Bot

2. Install Dependencies
npm install

Configuration

Edit the config.js file with your server and account details:

module.exports = {
  host: '',        // Minecraft server IP/host
  port: 25565,     // Server port (default: 25565)
  version: '',     // Minecraft version (e.g. '1.20.1')
  username: '',    // Bot username/email
  password: '',    // Bot password (leave empty for offline mode)
  auth: 'offline'  // 'offline' or 'mojang'
};
