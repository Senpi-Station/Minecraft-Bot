Minecraft Mineflayer AFK Bot

A customizable Minecraft bot using Mineflayer with Anti-AFK, player following, and reconnection logic.

How to Run
1. Clone the Repository

Clone the repository to your local machine:

git clone <your-repo-url>
cd <project-directory>
2. Install Dependencies

Install required npm packages:

npm install
3. Configure the Bot

Edit config.js with your server details and bot credentials:

module.exports = {
  host: '',  // Minecraft server host
  port: ,                       // Server port
  version: '',                 // Minecraft version
  username: '',           // Bot username
  password: '',           // Bot password
  auth: 'offline'                    // Authentication type ('offline' or 'mojang')
};

4. Run the Bot

Start the bot:

node index.js