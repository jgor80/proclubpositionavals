const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField,
  StringSelectMenuBuilder
} = require('discord.js');

// Get token from environment variable only
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('❌ BOT_TOKEN env var not set');
  process.exit(1);
}

// Need GuildVoiceStates so we can see who is in voice channels
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

// Positions to track
const POSITIONS = [
  'ST',
  'RW',
  'LW',
  'CAM',
  'RDM',
  'LDM',
  'LB',
  'LCB',
  'RCB',
  'RB',
  'GK'
];

// Club definitions (keys + pretty names)
const CLUBS = [
  { key: 'rs',  name: 'Rush Superstars' },
  { key: 'rs2', name: 'RushSuperstars2' }, // optional extra
  { key: 'rs3', name: 'RushSuperstars3' }, // optional extra
  { key: 'rsa', name: 'RS Academy' }
];

// Helpers to find clubs
function getClubByKey(key) {
  return CLUBS.find(c => c.key === key);
}

// Helper: who can manage spots? Admins or users with a "captain"-style role
function isManager(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionsBitField.Flags.ManageGuild)) return true;
  if (member.roles?.cache) {
    return member.roles.cache.some(role => /captain/i.test(role.name));
  }
  return false;
}

// Global multi-club board state:
// clubKey -> { spots: { [pos]: { open: boolean, userId: string | null } } }
const boardState = {};
CLUBS.forEach(club => {
  boardState[club.key] = {
    spots: POSITIONS.reduce((acc, p) => {
      acc[p] = { open: true, userId: null }; // true = OPEN
      return acc;
    }, {})
  };
});

// Which club the admin panel is currently editing
let currentClubKey = 'rs';

// Track the admin panel message so we can update it
let adminPanelChannelId = null;
let adminPanelMessageId = null;

// Build the main embed for a given club key
function buildEmbedForClub(clubKey) {
  const club = getClubByKey(clubKey);
  if (!club) {
    throw new Error(`Unknown club key: ${clubKey}`);
  }

  const clubBoard = boardState[clubKey];
  const lines = POSITIONS.map((p) => {
    const spot = clubBoard.spots[p];
    const open = spot.open;
    const emoji = open ? '🟢' : '🔴';
    let text;
    if (open) {
      text = 'OPEN';
    } else if (spot.userId) {
      text = `TAKEN by <@${spot.userId}>`;
    } else {
      text = 'TAKEN';
    }
    return `**${p}** – ${emoji} ${text}`;
  });

  return new EmbedBuilder()
    .setTitle('Club Spots')
    .setDescription(`**Club:** ${club.name}\n\n` + lines.join('\n'))
    .setFooter({ text: 'Admins/Captains: use the panel to assign spots.' });
}

// Build position buttons (for the CURRENT club in the panel)
function buildButtons() {
  const clubBoard = boardState[currentClubKey];
  const rows = [];
  let currentRow = new ActionRowBuilder();

  POSITIONS.forEach((p, index) => {
    const spot = clubBoard.spots[p];
    const open = spot.open;
    const button = new ButtonBuilder()
      .setCustomId(`pos_${p}`)
      .setLabel(p)
      .setStyle(open ? ButtonStyle.Success : ButtonStyle.Danger); // green=open, red=taken

    currentRow.addComponents(button);

    if (currentRow.components.length === 5 || index === POSITIONS.length - 1) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
  });

  return rows;
}

// Build club dropdown (for admin panel)
function buildClubSelect() {
  const select = new StringSelectMenuBuilder()
    .setCustomId('club_select')
    .setPlaceholder('Select club')
    .addOptions(
      CLUBS.map((club) => ({
        label: club.name,
        value: club.key,
        default: club.key === currentClubKey
      }))
    );

  const row = new ActionRowBuilder().addComponents(select);
  return row;
}

// Components for the admin panel (dropdown + buttons)
function buildAdminComponents() {
  const clubRow = buildClubSelect();
  const buttonRows = buildButtons();
  return [clubRow, ...buttonRows];
}

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  console.log(`✅ App ID: ${c.application.id}`);

  await c.application.commands.set([
    { name: 'spots', description: 'Show spot status for the current club (read-only).' },
    { name: 'spotpanel', description: 'Create the admin control panel for club spots.' },
    { name: 'spotreset', description: 'Set all spots to OPEN for the current club.' },
    { name: 'spotclubs', description: 'Show all clubs that currently have open spots.' }
  ]);

  console.log('✅ Commands registered: /spots, /spotpanel, /spotreset, /spotclubs');
});

client.on(Events.InteractionCreate, async (interaction) => {
  console.log('🔔 Interaction received:', {
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    type: interaction.type,
    commandName: interaction.commandName,
    customId: interaction.customId
  });

  try {
    if (!interaction.guildId || !interaction.channelId) return;

    // Slash commands
    if (interaction.isChatInputCommand()) {
      const cmd = interaction.commandName;

      // Generic "current club" view
      if (cmd === 'spots') {
        return interaction.reply({
          embeds: [buildEmbedForClub(currentClubKey)],
          components: [] // read-only
        });
      }

      // Admin/Captain: create panel
      if (cmd === 'spotpanel') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can create the control panel.',
            ephemeral: true
          });
        }

        const msg = await interaction.reply({
          embeds: [buildEmbedForClub(currentClubKey)],
          components: buildAdminComponents(),
          fetchReply: true
        });

        adminPanelChannelId = interaction.channelId;
        adminPanelMessageId = msg.id;

        console.log('✅ Admin panel created at', {
          channelId: adminPanelChannelId,
          messageId: adminPanelMessageId
        });

        return;
      }

      // Admin/Captain: reset current club
      if (cmd === 'spotreset') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can reset spots.',
            ephemeral: true
          });
        }

        const clubBoard = boardState[currentClubKey];
        POSITIONS.forEach((p) => {
          clubBoard.spots[p].open = true;
          clubBoard.spots[p].userId = null;
        });

        // Update admin panel if it exists
        if (adminPanelChannelId && adminPanelMessageId) {
          try {
            const channel = await client.channels.fetch(adminPanelChannelId);
            const msg = await channel.messages.fetch(adminPanelMessageId);
            await msg.edit({
              embeds: [buildEmbedForClub(currentClubKey)],
              components: buildAdminComponents()
            });
          } catch (err) {
            console.error('⚠️ Failed to update admin panel after /spotreset:', err);
          }
        }

        return interaction.reply({
          content: 'All spots set to 🟢 OPEN for the current club.',
          ephemeral: true
        });
      }

      // /spotclubs – show all clubs with at least one OPEN spot.
      if (cmd === 'spotclubs') {
        const openTeams = [];

        for (const club of CLUBS) {
          const board = boardState[club.key];
          if (!board || !board.spots) continue;

          const entries = Object.entries(board.spots);
          // open=true => OPEN
          const openPositions = entries
            .filter(([, spot]) => spot && spot.open === true)
            .map(([pos]) => pos);

          if (openPositions.length === 0) continue;

          openTeams.push({
            name: club.name,
            openCount: openPositions.length,
            totalCount: entries.length,
            openPositions
          });
        }

        if (openTeams.length === 0) {
          return interaction.reply({
            content: 'All clubs are currently full. No open spots.',
            ephemeral: false
          });
        }

        const lines = openTeams.map(team => {
          const posList = team.openPositions.join(', ');
          return '**' + team.name + '** – ' + team.openCount + '/' + team.totalCount + ' spots OPEN (' + posList + ')';
        });

        const embed = new EmbedBuilder()
          .setTitle('Clubs with Open Spots')
          .setDescription(lines.join('\n'));

        return interaction.reply({
          embeds: [embed],
          ephemeral: false
        });
      }
    }

    // Buttons (admin panel: assign VC players to spots)
    if (interaction.isButton()) {
      const [prefix, pos] = interaction.customId.split('_');
      if (prefix !== 'pos') return;

      const clubBoard = boardState[currentClubKey];
      if (!clubBoard.spots.hasOwnProperty(pos)) return;

      if (!isManager(interaction.member)) {
        return interaction.reply({
          content: 'Only admins or captains can assign players to spots.',
          ephemeral: true
        });
      }

      const voiceChannel = interaction.member?.voice?.channel;
      if (!voiceChannel) {
        return interaction.reply({
          content: 'You must be in a voice channel with the players you want to assign.',
          ephemeral: true
        });
      }

      const members = [...voiceChannel.members.values()].filter(m => !m.user.bot);
      if (members.length === 0) {
        return interaction.reply({
          content: 'No non-bot players found in your voice channel to assign.',
          ephemeral: true
        });
      }

      // Build a select menu of VC members + a "clear spot" option
      const options = members.map(m => ({
        label: m.displayName || m.user.username,
        value: m.id
      }));

      // Add a "clear" option at the top
      options.unshift({
        label: 'Clear spot (mark OPEN)',
        value: 'none'
      });

      const select = new StringSelectMenuBuilder()
        .setCustomId(`assign_${currentClubKey}_${pos}`)
        .setPlaceholder(`Assign ${pos}`)
        .addOptions(options.slice(0, 25)); // Discord limit

      const row = new ActionRowBuilder().addComponents(select);

      const club = getClubByKey(currentClubKey);

      return interaction.reply({
        content: `Pick a player for **${pos}** in **${club ? club.name : currentClubKey}**:`,
        components: [row],
        ephemeral: true
      });
    }

    // Dropdowns (club select and assignment selects)
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;

      // Change which club we're editing in the panel
      if (id === 'club_select') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can change the club.',
            ephemeral: true
          });
        }

        const selectedKey = interaction.values[0];
        const club = getClubByKey(selectedKey);
        if (!club) {
          return interaction.reply({
            content: 'Unknown club selected.',
            ephemeral: true
          });
        }

        currentClubKey = selectedKey;

        return interaction.update({
          embeds: [buildEmbedForClub(currentClubKey)],
          components: buildAdminComponents()
        });
      }

      // Assignment select: assign_<clubKey>_<pos>
      if (id.startsWith('assign_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can assign players to spots.',
            ephemeral: true
          });
        }

        const parts = id.split('_');
        // ["assign", clubKey, pos]
        const clubKey = parts[1];
        const pos = parts[2];

        const club = getClubByKey(clubKey);
        if (!club) {
          return interaction.reply({
            content: 'Unknown club in assignment request.',
            ephemeral: true
          });
        }

        const clubBoard = boardState[clubKey];
        if (!clubBoard || !clubBoard.spots[pos]) {
          return interaction.reply({
            content: 'Unknown position for this club.',
            ephemeral: true
          });
        }

        const selected = interaction.values[0];

        if (selected === 'none') {
          // Clear spot
          clubBoard.spots[pos].open = true;
          clubBoard.spots[pos].userId = null;
        } else {
          // Assign this user, and clear any other spots they hold in this club
          const userId = selected;

          for (const p of POSITIONS) {
            const s = clubBoard.spots[p];
            if (s && s.userId === userId) {
              s.open = true;
              s.userId = null;
            }
          }

          clubBoard.spots[pos].open = false;
          clubBoard.spots[pos].userId = userId;
        }

        // If this is the currently displayed club, update the admin panel
        if (clubKey === currentClubKey && adminPanelChannelId && adminPanelMessageId) {
          try {
            const channel = await client.channels.fetch(adminPanelChannelId);
            const msg = await channel.messages.fetch(adminPanelMessageId);
            await msg.edit({
              embeds: [buildEmbedForClub(currentClubKey)],
              components: buildAdminComponents()
            });
          } catch (err) {
            console.error('⚠️ Failed to update admin panel after assignment:', err);
          }
        }

        return interaction.reply({
          content: 'Spot updated.',
          ephemeral: true
        });
      }
    }
  } catch (err) {
    console.error('❌ Error handling interaction:', err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Error.',
        ephemeral: true
      });
    }
  }
});

client.login(token);
