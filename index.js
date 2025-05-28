const express = require('express');

const http = require('http');

const socketIo = require('socket.io');

const path = require('path');

const Discord = require('discord.js');

const app = express();

const server = http.createServer(app);

const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

let stats = {

  totalMembers: 0,

  onlineMembers: 0,

  offlineMembers: 0,

  sentMessages: 0,

  failedMessages: 0,

  botConnected: false

};

let botClient = null;

function getRandomStats() {

  const total = Math.floor(Math.random() * 500) + 100;

  const online = Math.floor(total * (0.3 + Math.random() * 0.4));

  return {

    totalMembers: total,

    onlineMembers: online,

    offlineMembers: total - online,

    sentMessages: stats.sentMessages,

    failedMessages: stats.failedMessages,

    botConnected: stats.botConnected

  };

}

async function connectBot(token) {

  try {

    if (botClient) {

      await botClient.destroy();

    }

    const client = new Discord.Client({

      intents: [

        Discord.GatewayIntentBits.Guilds,

        Discord.GatewayIntentBits.GuildMembers,

        Discord.GatewayIntentBits.GuildMessages,

        Discord.GatewayIntentBits.MessageContent,

        Discord.GatewayIntentBits.GuildPresences

      ]

    });

    client.on('ready', () => {

      stats.botConnected = true;

      io.emit('stats_update', stats);

    });

    client.on('error', error => {

      stats.botConnected = false;

      io.emit('stats_update', stats);

    });

    await client.login(token);

    botClient = client;

    return { success: true };

  } catch (error) {

    return { success: false, message: error.message };

  }

}

async function sendMessages(serverId, message, mode) {

  if (!botClient || !stats.botConnected) {

    return { success: 0, failed: 0 };

  }

  try {

    const guild = botClient.guilds.cache.get(serverId);

    if (!guild) {

      throw new Error('السيرفر غير موجود أو البوت غير مضاف إليه');

    }

    await guild.members.fetch();

    let members = guild.members.cache.filter(m => !m.user.bot);

    if (mode === 'online') {

      members = members.filter(m => m.presence?.status === 'online');

    } else if (mode === 'offline') {

      members = members.filter(m => !m.presence || m.presence?.status === 'offline');

    }

    let success = 0;

    let failed = 0;

    for (const member of members.values()) {

      try {

        await member.send(message);

        success++;

        stats.sentMessages = success;

        stats.failedMessages = failed;

        io.emit('stats_update', stats);

      } catch (err) {

        failed++;

        stats.failedMessages = failed;

        io.emit('stats_update', stats);

      }

    }

    return { success, failed };

  } catch (error) {

    return { success: 0, failed: 0, error: error.message };

  }

}

io.on('connection', (socket) => {

  stats = getRandomStats();

  socket.emit('stats_update', stats);

  

  const interval = setInterval(() => {

    if (!stats.botConnected) {

      stats = getRandomStats();

      io.emit('stats_update', stats);

    }

  }, 3000);

  socket.on('connect_bot', async (data) => {

    const result = await connectBot(data.token);

    socket.emit('bot_connected', result);

  });

  socket.on('send_messages', async (data) => {

    const result = await sendMessages(data.serverId, data.message, data.mode);

    socket.emit('send_complete', result);

  });

  socket.on('disconnect', () => {

    clearInterval(interval);

  });

});

const PORT = process.env.PORT || 3000; // بورت هنا

server.listen(PORT, () => {

  console.log(`Server turned on`);

});