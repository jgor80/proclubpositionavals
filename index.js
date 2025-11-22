const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField,
  StringSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
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

// Club definitions (generic; configurable via setup commands/buttons)
let CLUBS = [
  { key: 'club1', name: 'Club 1', enabled: true },
  { key: 'club2', name: 'Club 2', enabled: false },
  { key: 'club3', name: 'Club 3', enabled: false },
  { key: 'club4', name: 'Club 4', enabled: false }
];

// Helpers to find clubs
function getClubByKey(key) {
  return CLUBS.find((c) => c.key === key);
}

// Helper: who can manage spots? Admins or users with a "captain"-style role
function isManager(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionsBitField.Flags.ManageGuild)) return true;
  if (member.roles?.cache) {
    return member.roles.cache.some((role) => /captain/i.test(role.name));
  }
  return false;
}

// Global multi-club board state:
// clubKey -> { spots: { [pos]: { open: boolean, takenBy: string | null } } }
const boardState = {};
CLUBS.forEach((club) => {
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
    .setTitle('Club Spots')
    .setDescription(`**Club:** ${club.name}\n\n` + lines.join('\n'))
    .setFooter({
      text: 'Players: click a spot to claim. Admins/Captains: use the panel controls to manage spots & clubs.'
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
  const enabledClubs = CLUBS.filter((club) => club.enabled);
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

// Components for the admin panel (dropdown + controls + position buttons)
function buildAdminComponents() {
  const clubRow = buildClubSelect();

  // Control row: rename + add club + remove club + assign player (manager-only enforced in handlers)
  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('rename_club')
      .setLabel('Rename Club')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('add_club')
      .setLabel('Add Club')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('remove_club')
      .setLabel('Remove Club')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('assign_player')
      .setLabel('Assign Player')
      .setStyle(ButtonStyle.Secondary)
  );

  const buttonRows = buildButtons();
  return [clubRow, controlRow, ...buttonRows];
}

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  console.log(`✅ App ID: ${c.application.id}`);

  await c.application.commands.set([
    { name: 'spots', description: 'Show spots for the current club (read-only).' },
    { name: 'spotpanel', description: 'Create the control panel for club spots.' },
    { name: 'spotreset', description: 'Set all spots to OPEN for the current club.' },
    {
      name: 'spotsetup',
      description: 'Configure base club name and number of clubs.',
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
    { name: 'spotclubs', description: 'Show all clubs with at least one OPEN spot.' }
  ]);

  console.log(
    '✅ Commands registered: /spots, /spotpanel, /spotreset, /spotsetup, /spotclubs'
  );
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

      // Manager: create panel
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

      // Manager: reset current club
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
            console.error('⚠️ Failed to update admin panel after /spotreset:', err);
          }
        }

        return interaction.reply({
          content: 'All spots set to 🟢 OPEN for the current club.',
          ephemeral: true
        });
      }

      // Manager: configure club name and number of clubs
      if (cmd === 'spotsetup') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can configure clubs.',
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
        const firstEnabled = CLUBS.find((c) => c.enabled);
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
            console.error('⚠️ Failed to update admin panel after /spotsetup:', err);
          }
        }

        return interaction.reply({
          content: `Configured **${clubCount}** club(s) with base name **${basename}**.`,
          ephemeral: true
        });
      }

      // /spotclubs – show all clubs with at least one OPEN spot.
      if (cmd === 'spotclubs') {
        const openTeams = [];

        for (const club of CLUBS) {
          if (!club.enabled) continue;
          const board = boardState[club.key];
          if (!board || !board.spots) continue;

          const entries = Object.entries(board.spots);
          // open=true => OPEN
          const openPositions = entries
            .filter(([, slot]) => slot && slot.open === true)
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

        const lines = openTeams.map((team) => {
          const posList = team.openPositions.join(', ');
          return `**${team.name}** – ${team.openCount}/${team.totalCount} spots OPEN (${posList})`;
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

    // Buttons (admin panel: manage clubs + assign VC players + players self-claim spots)
    if (interaction.isButton()) {
      // Handle rename button
      if (interaction.customId === 'rename_club') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can rename clubs.',
            ephemeral: true
          });
        }

        const currentClub = getClubByKey(currentClubKey);
        if (!currentClub) {
          return interaction.reply({
            content: 'Current club not found.',
            ephemeral: true
          });
        }

        const modal = new ModalBuilder()
          .setCustomId('rename_club_modal')
          .setTitle('Rename Club')
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId('club_name')
                .setLabel('New club name')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(currentClub.name)
            )
          );

        await interaction.showModal(modal);
        return;
      }

      // Handle add-club button
      if (interaction.customId === 'add_club') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can add clubs.',
            ephemeral: true
          });
        }

        // Find first disabled club slot
        const disabledClub = CLUBS.find((c) => !c.enabled);
        if (!disabledClub) {
          return interaction.reply({
            content: 'All available club slots are already in use (max 4).',
            ephemeral: true
          });
        }

        disabledClub.enabled = true;

        // Initialize board state for this club if needed
        if (!boardState[disabledClub.key]) {
          boardState[disabledClub.key] = { spots: {} };
        }
        boardState[disabledClub.key].spots = POSITIONS.reduce((acc, p) => {
          acc[p] = { open: true, takenBy: null };
          return acc;
        }, {});

        // Switch panel to this new club
        currentClubKey = disabledClub.key;

        // Update admin panel message
        if (adminPanelChannelId && adminPanelMessageId) {
          try {
            const channel = await client.channels.fetch(adminPanelChannelId);
            const msg = await channel.messages.fetch(adminPanelMessageId);
            await msg.edit({
              embeds: [buildEmbedForClub(currentClubKey)],
              components: buildAdminComponents()
            });
          } catch (err) {
            console.error('⚠️ Failed to update admin panel after add_club:', err);
          }
        }

        return interaction.reply({
          content: `Added a new club slot: **${disabledClub.name}**. Use "Rename Club" to give it a custom name.`,
          ephemeral: true
        });
      }

      // Handle remove-club button
      if (interaction.customId === 'remove_club') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can remove clubs.',
            ephemeral: true
          });
        }

        const currentClub = getClubByKey(currentClubKey);
        if (!currentClub || !currentClub.enabled) {
          return interaction.reply({
            content: 'Current club cannot be removed.',
            ephemeral: true
          });
        }

        const enabledCount = CLUBS.filter((c) => c.enabled).length;
        if (enabledCount <= 1) {
          return interaction.reply({
            content: 'You must keep at least one club enabled.',
            ephemeral: true
          });
        }

        const clubBoard = boardState[currentClubKey];
        if (clubBoard && clubBoard.spots) {
          const hasTaken = POSITIONS.some((p) => {
            const s = clubBoard.spots[p];
            return s && s.open === false;
          });

          if (hasTaken) {
            return interaction.reply({
              content:
                'This club still has taken spots. Free all spots first (use /spotreset or buttons) before removing it.',
              ephemeral: true
            });
          }
        }

        // Disable this club
        currentClub.enabled = false;

        // Clear its board
        if (clubBoard && clubBoard.spots) {
          POSITIONS.forEach((p) => {
            if (clubBoard.spots[p]) {
              clubBoard.spots[p].open = true;
              clubBoard.spots[p].takenBy = null;
            }
          });
        }

        // Switch to first remaining enabled club
        const firstEnabled = CLUBS.find((c) => c.enabled);
        if (firstEnabled) {
          currentClubKey = firstEnabled.key;
        }

        // Update admin panel message
        if (adminPanelChannelId && adminPanelMessageId) {
          try {
            const channel = await client.channels.fetch(adminPanelChannelId);
            const msg = await channel.messages.fetch(adminPanelMessageId);
            await msg.edit({
              embeds: [buildEmbedForClub(currentClubKey)],
              components: buildAdminComponents()
            });
          } catch (err) {
            console.error('⚠️ Failed to update admin panel after remove_club:', err);
          }
        }

        return interaction.reply({
          content: `Removed club **${currentClub.name}** from the panel.`,
          ephemeral: true
        });
      }

      // Handle Assign Player button (manager picks player then spot)
      if (interaction.customId === 'assign_player') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can assign players.',
            ephemeral: true
          });
        }

        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
          return interaction.reply({
            content:
              'You must be in a voice channel with the players you want to assign.',
            ephemeral: true
          });
        }

        const members = [...voiceChannel.members.values()].filter(
          (m) => !m.user.bot
        );
        if (members.length === 0) {
          return interaction.reply({
            content: 'No non-bot players found in your voice channel to assign.',
            ephemeral: true
          });
        }

        const options = members.map((m) => ({
          label: m.displayName || m.user.username,
          value: m.id
        }));

        const select = new StringSelectMenuBuilder()
          .setCustomId(`assign_player_pick_${currentClubKey}`)
          .setPlaceholder('Pick a player')
          .addOptions(options.slice(0, 25));

        const row = new ActionRowBuilder().addComponents(select);
        const club = getClubByKey(currentClubKey);

        return interaction.reply({
          content: `Pick a player to assign in **${club ? club.name : currentClubKey}**:`,
          components: [row],
          ephemeral: true
        });
      }

      // Position buttons: players (and managers) self-claim / free their own spot
      if (interaction.customId.startsWith('pos_')) {
        const pos = interaction.customId.substring('pos_'.length);
        const clubBoard = boardState[currentClubKey];
        if (!clubBoard || !clubBoard.spots.hasOwnProperty(pos)) return;

        const inVoice = interaction.member?.voice?.channelId;
        if (!inVoice) {
          return interaction.reply({
            content: 'You must be connected to a voice channel to claim or free a spot.',
            ephemeral: true
          });
        }

        const userId = interaction.user.id;
        const slot = clubBoard.spots[pos];

        if (slot.open) {
          // Claim: clear any other spots this user holds in this club
          for (const p of POSITIONS) {
            const s = clubBoard.spots[p];
            if (s && s.takenBy === userId) {
              s.open = true;
              s.takenBy = null;
            }
          }
          slot.open = false;
          slot.takenBy = userId;
        } else {
          // Slot is taken
          if (slot.takenBy === userId) {
            // User frees their own spot
            slot.open = true;
            slot.takenBy = null;
          } else {
            return interaction.reply({
              content:
                'This spot is already taken by someone else. Ask a captain if you need to be moved.',
              ephemeral: true
            });
          }
        }

        return interaction.update({
          embeds: [buildEmbedForClub(currentClubKey)],
          components: buildAdminComponents()
        });
      }
    }

    // Modal submissions (rename club)
    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'rename_club_modal') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can rename clubs.',
            ephemeral: true
          });
        }

        const newName = interaction.fields.getTextInputValue('club_name').trim();
        if (!newName) {
          return interaction.reply({
            content: 'Club name cannot be empty.',
            ephemeral: true
          });
        }

        const currentClub = getClubByKey(currentClubKey);
        if (!currentClub) {
          return interaction.reply({
            content: 'Current club not found.',
            ephemeral: true
          });
        }

        currentClub.name = newName;

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
            console.error('⚠️ Failed to update admin panel after rename:', err);
          }
        }

        return interaction.reply({
          content: `Club renamed to **${newName}**.`,
          ephemeral: true
        });
      }
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

      // First step of manager assignment: pick player
      if (id.startsWith('assign_player_pick_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can assign players.',
            ephemeral: true
          });
        }

        const clubKey = id.substring('assign_player_pick_'.length);
        const club = getClubByKey(clubKey);
        if (!club) {
          return interaction.reply({
            content: 'Unknown club in assignment request.',
            ephemeral: true
          });
        }

        const userId = interaction.values[0];

        const posSelect = new StringSelectMenuBuilder()
          .setCustomId(`assign_player_pos_${clubKey}_${userId}`)
          .setPlaceholder('Pick a spot')
          .addOptions(POSITIONS.map((p) => ({ label: p, value: p })));

        const row = new ActionRowBuilder().addComponents(posSelect);

        return interaction.update({
          content: `Now pick a spot for <@${userId}> in **${club.name}**:`,
          components: [row]
        });
      }

      // Second step of manager assignment: pick spot
      if (id.startsWith('assign_player_pos_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can assign players.',
            ephemeral: true
          });
        }

        const parts = id.split('_'); // ['assign', 'player', 'pos', clubKey, userId]
        const clubKey = parts[3];
        const userId = parts[4];
        const pos = interaction.values[0];

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

        // Clear any spots this user holds in this club
        for (const p of POSITIONS) {
          const s = clubBoard.spots[p];
          if (s && s.takenBy === userId) {
            s.open = true;
            s.takenBy = null;
          }
        }

        // Assign to chosen spot (override previous occupant)
        const slot = clubBoard.spots[pos];
        slot.open = false;
        slot.takenBy = userId;

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

        return interaction.update({
          content: `Assigned <@${userId}> to **${pos}** in **${club.name}**.`,
          components: []
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
