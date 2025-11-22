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

// Add GuildVoiceStates so we can see who is in voice channels
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

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

// Club definitions (generic; configurable via /divsetup)
let CLUBS = [
  { key: 'club1', name: 'Club 1', enabled: true },
  { key: 'club2', name: 'Club 2', enabled: false },
  { key: 'club3', name: 'Club 3', enabled: false },
  { key: 'club4', name: 'Club 4', enabled: false }
];

// Helpers to find clubs
function getClubByKey(key) {
  return CLUBS.find(c => c.key === key);
}

// Global multi-club board state:
// clubKey -> { spots: { [pos]: { open: boolean, takenBy: string | null } } }
const boardState = {};
CLUBS.forEach(club => {
  boardState[club.key] = {
    spots: POSITIONS.reduce((acc, p) => {
      acc[p] = { open: true, takenBy: null }; // true = OPEN, false = TAKEN
      return acc;
    }, {})
  };
});

// Which club the admin panel is currently editing
let currentClubKey = 'club1';

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
    const slot = clubBoard.spots[p];
    const open = slot.open;
    const emoji = open ? '🟢' : '🔴';
    let text;
    if (open) {
      text = 'OPEN';
    } else if (slot.takenBy) {
      text = `TAKEN by <@${slot.takenBy}>`;
    } else {
      text = 'TAKEN';
    }
    return `**${p}** – ${emoji} ${text}`;
  });

  return new EmbedBuilder()
    .setTitle('Div Spots')
    .setDescription(`**Club:** ${club.name}\n\n` + lines.join('\n'))
    .setFooter({
      text:
        'Admins: use the panel to change spots/club. Players: click a spot while in VC to claim it.'
    });
}

// Build position buttons (for the CURRENT club in the panel)
function buildButtons() {
  const clubBoard = boardState[currentClubKey];
  const rows = [];
  let currentRow = new ActionRowBuilder();

  POSITIONS.forEach((p, index) => {
    const slot = clubBoard.spots[p];
    const open = slot.open;
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
  const enabledClubs = CLUBS.filter(club => club.enabled);
  const select = new StringSelectMenuBuilder()
    .setCustomId('club_select')
    .setPlaceholder('Select club')
    .addOptions(
      enabledClubs.map((club) => ({
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
    { name: 'div', description: 'Show Div spots for the current club (read-only).' },
    { name: 'divpanel', description: 'Create the admin control panel for Div spots.' },
    { name: 'divall', description: 'Set all spots to OPEN for the current club.' },
    {
      name: 'divassign',
      description: 'Admin: assign a VC player to a spot for the current club.',
      options: [
        {
          type: 3, // STRING
          name: 'position',
          description: 'Position to assign',
          required: true,
          choices: POSITIONS.map(p => ({ name: p, value: p }))
        },
        {
          type: 6, // USER
          name: 'player',
          description: 'Player to assign',
          required: true
        }
      ]
    },
    {
      name: 'divsetup',
      description: 'Configure club name and number of clubs.',
      options: [
        {
          type: 3,
          name: 'basename',
          description: 'Base club name (e.g. Rush Superstars)',
          required: true
        },
        {
          type: 4,
          name: 'clubs',
          description: 'Number of clubs/teams (1-4)',
          required: true,
          min_value: 1,
          max_value: 4
        }
      ]
    },
    { name: 'divactive', description: 'Show all clubs with at least one taken spot.' }
  ]);

  console.log('✅ Commands registered: /div, /divpanel, /divall, /divassign, /divsetup, /divactive');
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
      if (cmd === 'div') {
        return interaction.reply({
          embeds: [buildEmbedForClub(currentClubKey)],
          components: [] // read-only
        });
      }

      // Admin: create panel
      if (cmd === 'divpanel') {
        if (
          !interaction.memberPermissions?.has(
            PermissionsBitField.Flags.ManageGuild
          )
        ) {
          return interaction.reply({
            content: 'Only admins can create the control panel.',
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

      // Admin: reset current club
      if (cmd === 'divall') {
        if (
          !interaction.memberPermissions?.has(
            PermissionsBitField.Flags.ManageGuild
          )
        ) {
          return interaction.reply({
            content: 'Only admins can reset spots.',
            ephemeral: true
          });
        }

        const clubBoard = boardState[currentClubKey];
        POSITIONS.forEach((p) => {
          clubBoard.spots[p].open = true;
          clubBoard.spots[p].takenBy = null;
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
            console.error('⚠️ Failed to update admin panel after /divall:', err);
          }
        }

        return interaction.reply({
          content: 'All spots set to 🟢 OPEN for the current club.',
          ephemeral: true
        });
      }

      // Admin: configure club name and number of clubs
      if (cmd === 'divsetup') {
        if (
          !interaction.memberPermissions?.has(
            PermissionsBitField.Flags.ManageGuild
          )
        ) {
          return interaction.reply({
            content: 'Only admins can configure clubs.',
            ephemeral: true
          });
        }

        const basename = interaction.options.getString('basename');
        let clubCount = interaction.options.getInteger('clubs');

        if (clubCount < 1) clubCount = 1;
        if (clubCount > 4) clubCount = 4;

        // Update CLUBS array names + enabled flags
        CLUBS.forEach((club, index) => {
          if (index < clubCount) {
            club.enabled = true;
            club.name = clubCount === 1 ? basename : `${basename} ${index + 1}`;
          } else {
            club.enabled = false;
          }
        });

        // Rebuild boardState for all clubs (clear spots)
        CLUBS.forEach((club) => {
          if (!boardState[club.key]) {
            boardState[club.key] = { spots: {} };
          }
          const clubBoard = boardState[club.key];
          clubBoard.spots = POSITIONS.reduce((acc, p) => {
            acc[p] = { open: true, takenBy: null };
            return acc;
          }, {});
        });

        // Ensure currentClubKey points to an enabled club
        const firstEnabled = CLUBS.find(c => c.enabled);
        if (firstEnabled) {
          currentClubKey = firstEnabled.key;
        }

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
            console.error('⚠️ Failed to update admin panel after /divsetup:', err);
          }
        }

        return interaction.reply({
          content: `Configured **${clubCount}** club(s) with base name **${basename}**.`,
          ephemeral: true
        });
      }

      // Admin: assign a VC player to a position
      if (cmd === 'divassign') {
        if (
          !interaction.memberPermissions?.has(
            PermissionsBitField.Flags.ManageGuild
          )
        ) {
          return interaction.reply({
            content: 'Only admins can assign players to spots.',
            ephemeral: true
          });
        }

        const position = interaction.options.getString('position');
        const player = interaction.options.getUser('player');

        if (!POSITIONS.includes(position)) {
          return interaction.reply({
            content: 'Invalid position.',
            ephemeral: true
          });
        }

        const guild = interaction.guild;
        if (!guild) {
          return interaction.reply({
            content: 'This command can only be used in a server.',
            ephemeral: true
          });
        }

        let member;
        try {
          member = await guild.members.fetch(player.id);
        } catch (e) {
          console.error('⚠️ Failed to fetch member for divassign:', e);
        }

        if (!member || !member.voice || !member.voice.channelId) {
          return interaction.reply({
            content: 'That player must be **connected to a voice channel** to be assigned.',
            ephemeral: true
          });
        }

        const clubBoard2 = boardState[currentClubKey];
        if (!clubBoard2 || !clubBoard2.spots[position]) {
          return interaction.reply({
            content: 'Unknown position for this club.',
            ephemeral: true
          });
        }

        // Clear any other spots this user holds in this club
        POSITIONS.forEach((p) => {
          const s = clubBoard2.spots[p];
          if (s && s.takenBy === player.id) {
            s.open = true;
            s.takenBy = null;
          }
        });

        // Assign
        const assignSlot = clubBoard2.spots[position];
        assignSlot.open = false;
        assignSlot.takenBy = player.id;

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
            console.error('⚠️ Failed to update admin panel after /divassign:', err);
          }
        }

        const club = getClubByKey(currentClubKey);
        return interaction.reply({
          content: `Assigned ${player} to **${position}** for **${club ? club.name : currentClubKey}**.`,
          ephemeral: true
        });
      }

      // /divactive – show all clubs with at least one taken spot.
      if (cmd === 'divactive') {
        const activeTeams = [];

        for (const club of CLUBS) {
          if (!club.enabled) continue;
          const board = boardState[club.key];
          if (!board || !board.spots) continue;

          const entries = Object.entries(board.spots);
          // open=false => TAKEN
          const takenPositions = entries
            .filter(([, slot]) => slot && slot.open === false)
            .map(([pos]) => pos);

          if (takenPositions.length === 0) continue;

          activeTeams.push({
            name: club.name,
            takenCount: takenPositions.length,
            totalCount: entries.length,
            takenPositions
          });
        }

        if (activeTeams.length === 0) {
          return interaction.reply({
            content: 'No active teams right now. All spots are open.',
            ephemeral: false
          });
        }

        const lines = activeTeams.map(team => {
          const posList = team.takenPositions.join(', ');
          return '**' + team.name + '** – ' + team.takenCount + '/' + team.totalCount + ' spots taken (' + posList + ')';
        });

        const embed = new EmbedBuilder()
          .setTitle('Active Teams')
          .setDescription(lines.join('\n'));

        return interaction.reply({
          embeds: [embed],
          ephemeral: false
        });
      }
    }

    // Buttons (admin panel + player signups)
    if (interaction.isButton()) {
      const [prefix, pos] = interaction.customId.split('_');
      if (prefix !== 'pos') return;

      const clubBoard = boardState[currentClubKey];
      if (!clubBoard.spots.hasOwnProperty(pos)) return;

      const slot = clubBoard.spots[pos];

      const isAdmin = interaction.memberPermissions?.has(
        PermissionsBitField.Flags.ManageGuild
      );
      const inVoice = interaction.member?.voice?.channelId;

      // Everyone (including admins) must be in a voice channel to interact
      if (!inVoice) {
        return interaction.reply({
          content: 'You must be **connected to a voice channel** in this server to claim or free a spot.',
          ephemeral: true
        });
      }

      const userId = interaction.user.id;

      // Claim / release logic with one-spot-per-player per club
      if (slot.open) {
        // Before claiming, clear any other spot this user holds in this club
        for (const otherPos of POSITIONS) {
          const otherSlot = clubBoard.spots[otherPos];
          if (otherSlot && otherSlot.takenBy === userId) {
            otherSlot.open = true;
            otherSlot.takenBy = null;
          }
        }

        // Claim this spot for the user
        slot.open = false;
        slot.takenBy = userId;
      } else {
        // Spot is taken
        if (slot.takenBy === userId || isAdmin) {
          // User (or admin) frees the spot
          slot.open = true;
          slot.takenBy = null;
        } else {
          return interaction.reply({
            content: 'This spot is already taken by someone else.',
            ephemeral: true
          });
        }
      }

      return interaction.update({
        embeds: [buildEmbedForClub(currentClubKey)],
        components: buildAdminComponents()
      });
    }

    // Dropdown (admin panel: change which club we're editing)
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId !== 'club_select') return;

      if (
        !interaction.memberPermissions?.has(
          PermissionsBitField.Flags.ManageGuild
        )
      ) {
        return interaction.reply({
          content: 'Only admins can change the club.',
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

// When someone leaves voice, clear any spots they held
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    // Only care about leaving all voice channels in this guild
    // oldState.channelId exists (they were in VC)
    // newState.channelId is null (they disconnected)
    if (!oldState.guild || !oldState.channelId) return;
    if (newState.channelId) return; // still in some VC, ignore

    const userId = oldState.id;
    const touchedClubKeys = new Set();

    // Look through every club and clear any spots held by this user
    for (const clubKey of Object.keys(boardState)) {
      const clubBoard = boardState[clubKey];
      if (!clubBoard || !clubBoard.spots) continue;

      let changed = false;

      for (const pos of POSITIONS) {
        const slot = clubBoard.spots[pos];
        if (slot && slot.takenBy === userId) {
          slot.open = true;
          slot.takenBy = null;
          changed = true;
        }
      }

      if (changed) touchedClubKeys.add(clubKey);
    }

    // If the currently displayed club was changed, update the admin panel message
    if (
      touchedClubKeys.has(currentClubKey) &&
      adminPanelChannelId &&
      adminPanelMessageId
    ) {
      try {
        const channel = await client.channels.fetch(adminPanelChannelId);
        const msg = await channel.messages.fetch(adminPanelMessageId);
        await msg.edit({
          embeds: [buildEmbedForClub(currentClubKey)],
          components: buildAdminComponents()
        });
      } catch (err) {
        console.error('⚠️ Failed to update admin panel after voice leave:', err);
      }
    }
  } catch (err) {
    console.error('❌ Error in VoiceStateUpdate handler:', err);
  }
});

client.login(token);
