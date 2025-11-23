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

// We need Guilds + GuildVoiceStates for VC-aware spot claiming
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

// Default club slots per guild; names are editable from the panel
const DEFAULT_CLUBS = [
  { key: 'club1', name: 'Club 1', enabled: true },
  { key: 'club2', name: 'Club 2', enabled: false },
  { key: 'club3', name: 'Club 3', enabled: false },
  { key: 'club4', name: 'Club 4', enabled: false }
];

// Slash commands (reused for every guild)
const COMMANDS = [
  {
    name: 'spotpanel',
    description: 'Create the control panel for club spots.'
  },
  {
    name: 'spots',
    description: 'Show a read-only board with club dropdown.'
  }
];

// ---------- PER-GUILD STATE HELPERS ----------

function cloneDefaultClubs() {
  return DEFAULT_CLUBS.map((c) => ({ ...c }));
}

function createEmptyBoardState(clubs) {
  const state = {};
  clubs.forEach((club) => {
    state[club.key] = {
      spots: POSITIONS.reduce((acc, p) => {
        acc[p] = { open: true, takenBy: null };
        return acc;
      }, {})
    };
  });
  return state;
}

// guildId -> { clubs, boardState, currentClubKey, adminPanelChannelId, adminPanelMessageId }
const guildStates = new Map();

function getGuildState(guildId) {
  if (!guildId) return null;

  let state = guildStates.get(guildId);
  if (!state) {
    const clubs = cloneDefaultClubs();
    const boardState = createEmptyBoardState(clubs);
    state = {
      clubs,
      boardState,
      currentClubKey: 'club1',
      adminPanelChannelId: null,
      adminPanelMessageId: null
    };
    guildStates.set(guildId, state);
  }
  return state;
}

function getClubByKey(clubs, key) {
  return clubs.find((c) => c.key === key);
}

// Admins or roles with "captain" in the name
function isManager(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionsBitField.Flags.ManageGuild)) return true;
  if (member.roles?.cache) {
    return member.roles.cache.some((role) => /captain/i.test(role.name));
  }
  return false;
}

// ---------- UI BUILDERS (per guild) ----------

function buildEmbedForClub(guildId, clubKey) {
  const state = getGuildState(guildId);
  if (!state) throw new Error('No state for guild');

  const { clubs, boardState } = state;
  const club = getClubByKey(clubs, clubKey);
  if (!club) throw new Error(`Unknown club key: ${clubKey}`);

  const clubBoard = boardState[clubKey];
  const lines = POSITIONS.map((p) => {
    const slot = clubBoard.spots[p];
    const emoji = slot.open ? '🟢' : '🔴';
    let text;
    if (slot.open) text = 'OPEN';
    else if (slot.takenBy) text = `TAKEN by <@${slot.takenBy}>`;
    else text = 'TAKEN';
    return `**${p}** – ${emoji} ${text}`;
  });

  return new EmbedBuilder()
    .setTitle('Club Spots')
    .setDescription(`**Club:** ${club.name}\n\n${lines.join('\n')}`)
    .setFooter({
      text:
        'Players: click a spot to claim. Admins/Captains: use the panel to manage spots & clubs.'
    });
}

function buildButtons(guildId) {
  const state = getGuildState(guildId);
  const { boardState, currentClubKey } = state;
  const clubBoard = boardState[currentClubKey];

  const rows = [];
  let currentRow = new ActionRowBuilder();

  POSITIONS.forEach((p, index) => {
    const slot = clubBoard.spots[p];
    const button = new ButtonBuilder()
      .setCustomId(`pos_${p}`)
      .setLabel(p)
      .setStyle(slot.open ? ButtonStyle.Success : ButtonStyle.Danger);

    currentRow.addComponents(button);

    if (currentRow.components.length === 5 || index === POSITIONS.length - 1) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
  });

  return rows;
}

function buildClubSelect(guildId) {
  const state = getGuildState(guildId);
  const { clubs, currentClubKey } = state;

  const enabledClubs = clubs.filter((club) => club.enabled);
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

  return new ActionRowBuilder().addComponents(select);
}

function buildViewerClubSelect(guildId, selectedKey) {
  const state = getGuildState(guildId);
  const { clubs } = state;

  const enabledClubs = clubs.filter((club) => club.enabled);
  const select = new StringSelectMenuBuilder()
    .setCustomId('viewer_club_select')
    .setPlaceholder('Select club')
    .addOptions(
      enabledClubs.map((club) => ({
        label: club.name,
        value: club.key,
        default: club.key === selectedKey
      }))
    );

  return new ActionRowBuilder().addComponents(select);
}

function buildAdminComponents(guildId) {
  const clubRow = buildClubSelect(guildId);

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
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('reset_spots')
      .setLabel('Reset Spots')
      .setStyle(ButtonStyle.Secondary)
  );

  const buttonRows = buildButtons(guildId);
  return [clubRow, controlRow, ...buttonRows];
}

// ---------- READY & COMMAND REG ----------

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  console.log(`✅ App ID: ${c.application.id}`);

  try {
    // Global commands (for all servers)
    await c.application.commands.set(COMMANDS);
    console.log('✅ Global commands registered for all servers');

    // Also explicitly register per existing guild (helps them appear faster)
    for (const guild of c.guilds.cache.values()) {
      try {
        await c.application.commands.set(COMMANDS, guild.id);
        console.log(`✅ Commands registered in guild ${guild.name} (${guild.id})`);
      } catch (err) {
        console.error('⚠️ Failed to register commands in guild', guild.id, err);
      }
    }
  } catch (err) {
    console.error('❌ Failed to register commands:', err);
  }
});

// When the bot joins a new server later, register there too
client.on(Events.GuildCreate, async (guild) => {
  try {
    if (!client.application?.commands) return;
    await client.application.commands.set(COMMANDS, guild.id);
    console.log(`✅ Commands registered in newly joined guild ${guild.name} (${guild.id})`);
  } catch (err) {
    console.error('⚠️ Failed to register commands in new guild', guild.id, err);
  }
});

// ---------- INTERACTIONS ----------

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    const guildId = interaction.guildId;
    if (!guildId) return; // ignore DMs

    const state = getGuildState(guildId);
    if (!state) return;

    const { clubs, boardState } = state;

    if (interaction.isChatInputCommand()) {
      const cmd = interaction.commandName;

      if (cmd === 'spotpanel') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can create the control panel.',
            ephemeral: true
          });
        }

        const msg = await interaction.reply({
          embeds: [buildEmbedForClub(guildId, state.currentClubKey)],
          components: buildAdminComponents(guildId),
          fetchReply: true
        });

        state.adminPanelChannelId = interaction.channelId;
        state.adminPanelMessageId = msg.id;
        return;
      }

      if (cmd === 'spots') {
        let key = state.currentClubKey;
        const currentClub = getClubByKey(clubs, key);
        if (!currentClub || !currentClub.enabled) {
          const firstEnabled = clubs.find((c) => c.enabled) || clubs[0];
          key = firstEnabled ? firstEnabled.key : state.currentClubKey;
        }

        return interaction.reply({
          embeds: [buildEmbedForClub(guildId, key)],
          components: [buildViewerClubSelect(guildId, key)],
          ephemeral: false
        });
      }
    }

    if (interaction.isButton()) {
      const guildIdBtn = interaction.guildId;
      const stateBtn = getGuildState(guildIdBtn);
      if (!stateBtn) return;

      const { clubs: clubsBtn, boardState: boardStateBtn } = stateBtn;

      if (interaction.customId === 'rename_club') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can rename clubs.',
            ephemeral: true
          });
        }

        const currentClub = getClubByKey(clubsBtn, stateBtn.currentClubKey);
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

      if (interaction.customId === 'add_club') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can add clubs.',
            ephemeral: true
          });
        }

        const disabledClub = clubsBtn.find((c) => !c.enabled);
        if (!disabledClub) {
          return interaction.reply({
            content: 'All available club slots are already in use (max 4).',
            ephemeral: true
          });
        }

        disabledClub.enabled = true;

        if (!boardStateBtn[disabledClub.key]) {
          boardStateBtn[disabledClub.key] = { spots: {} };
        }
        boardStateBtn[disabledClub.key].spots = POSITIONS.reduce((acc, p) => {
          acc[p] = { open: true, takenBy: null };
          return acc;
        }, {});

        stateBtn.currentClubKey = disabledClub.key;

        if (stateBtn.adminPanelChannelId && stateBtn.adminPanelMessageId) {
          try {
            const channel = await client.channels.fetch(stateBtn.adminPanelChannelId);
            const msg = await channel.messages.fetch(stateBtn.adminPanelMessageId);
            await msg.edit({
              embeds: [buildEmbedForClub(guildIdBtn, stateBtn.currentClubKey)],
              components: buildAdminComponents(guildIdBtn)
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

      if (interaction.customId === 'remove_club') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can remove clubs.',
            ephemeral: true
          });
        }

        const currentClub = getClubByKey(clubsBtn, stateBtn.currentClubKey);
        if (!currentClub || !currentClub.enabled) {
          return interaction.reply({
            content: 'Current club cannot be removed.',
            ephemeral: true
          });
        }

        const enabledCount = clubsBtn.filter((c) => c.enabled).length;
        if (enabledCount <= 1) {
          return interaction.reply({
            content: 'You must keep at least one club enabled.',
            ephemeral: true
          });
        }

        const clubBoard = boardStateBtn[stateBtn.currentClubKey];
        if (clubBoard && clubBoard.spots) {
          const hasTaken = POSITIONS.some((p) => {
            const s = clubBoard.spots[p];
            return s && s.open === false;
          });

          if (hasTaken) {
            return interaction.reply({
              content:
                'This club still has taken spots. Free all spots first before removing it.',
              ephemeral: true
            });
          }
        }

        currentClub.enabled = false;

        if (clubBoard && clubBoard.spots) {
          POSITIONS.forEach((p) => {
            if (clubBoard.spots[p]) {
              clubBoard.spots[p].open = true;
              clubBoard.spots[p].takenBy = null;
            }
          });
        }

        const firstEnabled = clubsBtn.find((c) => c.enabled);
        if (firstEnabled) stateBtn.currentClubKey = firstEnabled.key;

        if (stateBtn.adminPanelChannelId && stateBtn.adminPanelMessageId) {
          try {
            const channel = await client.channels.fetch(stateBtn.adminPanelChannelId);
            const msg = await channel.messages.fetch(stateBtn.adminPanelMessageId);
            await msg.edit({
              embeds: [buildEmbedForClub(guildIdBtn, stateBtn.currentClubKey)],
              components: buildAdminComponents(guildIdBtn)
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

      if (interaction.customId === 'reset_spots') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can reset spots.',
            ephemeral: true
          });
        }

        const clubBoard = boardStateBtn[stateBtn.currentClubKey];
        POSITIONS.forEach((p) => {
          clubBoard.spots[p].open = true;
          clubBoard.spots[p].takenBy = null;
        });

        if (stateBtn.adminPanelChannelId && stateBtn.adminPanelMessageId) {
          try {
            const channel = await client.channels.fetch(stateBtn.adminPanelChannelId);
            const msg = await channel.messages.fetch(stateBtn.adminPanelMessageId);
            await msg.edit({
              embeds: [buildEmbedForClub(guildIdBtn, stateBtn.currentClubKey)],
              components: buildAdminComponents(guildIdBtn)
            });
          } catch (err) {
            console.error('⚠️ Failed to update admin panel after reset_spots:', err);
          }
        }

        return interaction.reply({
          content: 'All spots set to 🟢 OPEN for the current club.',
          ephemeral: true
        });
      }

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
            content: 'You must be in a voice channel with the players you want to assign.',
            ephemeral: true
          });
        }

        const members = [...voiceChannel.members.values()].filter((m) => !m.user.bot);
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
          .setCustomId(`assign_player_pick_${stateBtn.currentClubKey}`)
          .setPlaceholder('Pick a player')
          .addOptions(options.slice(0, 25));

        const row = new ActionRowBuilder().addComponents(select);
        const club = getClubByKey(clubsBtn, stateBtn.currentClubKey);

        return interaction.reply({
          content: `Pick a player to assign in **${club ? club.name : stateBtn.currentClubKey}**:`,
          components: [row],
          ephemeral: true
        });
      }

      // Player self-claim/free spot (must be in VC)
      if (interaction.customId.startsWith('pos_')) {
        const pos = interaction.customId.substring('pos_'.length);
        const clubBoard = boardStateBtn[stateBtn.currentClubKey];
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
          if (slot.takenBy === userId) {
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
          embeds: [buildEmbedForClub(guildIdBtn, stateBtn.currentClubKey)],
          components: buildAdminComponents(guildIdBtn)
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

        const stateModal = getGuildState(interaction.guildId);
        if (!stateModal) {
          return interaction.reply({
            content: 'Guild state not found.',
            ephemeral: true
          });
        }

        const currentClub = getClubByKey(stateModal.clubs, stateModal.currentClubKey);
        if (!currentClub) {
          return interaction.reply({
            content: 'Current club not found.',
            ephemeral: true
          });
        }

        currentClub.name = newName;

        if (stateModal.adminPanelChannelId && stateModal.adminPanelMessageId) {
          try {
            const channel = await client.channels.fetch(stateModal.adminPanelChannelId);
            const msg = await channel.messages.fetch(stateModal.adminPanelMessageId);
            await msg.edit({
              embeds: [buildEmbedForClub(interaction.guildId, stateModal.currentClubKey)],
              components: buildAdminComponents(interaction.guildId)
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

    // Dropdowns (club select, public viewer select, and assignment selects)
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;
      const guildIdSel = interaction.guildId;
      const stateSel = getGuildState(guildIdSel);
      if (!stateSel) return;

      // Public viewer club select (/spots board)
      if (id === 'viewer_club_select') {
        const selectedKey = interaction.values[0];
        const club = getClubByKey(stateSel.clubs, selectedKey);
        if (!club || !club.enabled) {
          return interaction.reply({
            content: 'Unknown or disabled club selected.',
            ephemeral: true
          });
        }

        return interaction.update({
          embeds: [buildEmbedForClub(guildIdSel, selectedKey)],
          components: [buildViewerClubSelect(guildIdSel, selectedKey)]
        });
      }

      // Change which club we're editing in the panel
      if (id === 'club_select') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can change the club.',
            ephemeral: true
          });
        }

        const selectedKey = interaction.values[0];
        const club = getClubByKey(stateSel.clubs, selectedKey);
        if (!club) {
          return interaction.reply({
            content: 'Unknown club selected.',
            ephemeral: true
          });
        }

        stateSel.currentClubKey = selectedKey;

        return interaction.update({
          embeds: [buildEmbedForClub(guildIdSel, stateSel.currentClubKey)],
          components: buildAdminComponents(guildIdSel)
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
        const club = getClubByKey(stateSel.clubs, clubKey);
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

        const club = getClubByKey(stateSel.clubs, clubKey);
        if (!club) {
          return interaction.reply({
            content: 'Unknown club in assignment request.',
            ephemeral: true
          });
        }

        const clubBoard = stateSel.boardState[clubKey];
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

        if (
          clubKey === stateSel.currentClubKey &&
          stateSel.adminPanelChannelId &&
          stateSel.adminPanelMessageId
        ) {
          try {
            const channel = await client.channels.fetch(stateSel.adminPanelChannelId);
            const msg = await channel.messages.fetch(stateSel.adminPanelMessageId);
            await msg.edit({
              embeds: [buildEmbedForClub(guildIdSel, stateSel.currentClubKey)],
              components: buildAdminComponents(guildIdSel)
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

// When someone leaves voice, clear any spots they held in that guild
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    if (!oldState.guild || !oldState.channelId) return;
    if (newState.channelId) return; // they moved or are still in VC

    const guildId = oldState.guild.id;
    const state = getGuildState(guildId);
    if (!state) return;

    const userId = oldState.id;
    const touchedClubKeys = new Set();

    for (const clubKey of Object.keys(state.boardState)) {
      const clubBoard = state.boardState[clubKey];
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

    if (
      touchedClubKeys.has(state.currentClubKey) &&
      state.adminPanelChannelId &&
      state.adminPanelMessageId
    ) {
      try {
        const channel = await client.channels.fetch(state.adminPanelChannelId);
        const msg = await channel.messages.fetch(state.adminPanelMessageId);
        await msg.edit({
          embeds: [buildEmbedForClub(guildId, state.currentClubKey)],
          components: buildAdminComponents(guildId)
        });
      } catch (err) {
        console.error('⚠️ Failed to update admin panel after voice leave:', err);
      }
    }
  } catch (err) {
    console.error('❌ Error in VoiceStateUpdate handler:', err);
  }
});

// ---------- LOGIN ----------

client.login(token);
