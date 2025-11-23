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

// Admins or roles with certain keywords in the role name (captain, coach, manager, admin, staff)
function isManager(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionsBitField.Flags.ManageGuild)) return true;
  if (member.roles?.cache) {
    const KEYWORDS = ['captain', 'coach', 'manager', 'admin', 'staff'];
    return member.roles.cache.some((role) => {
      const name = role.name.toLowerCase();
      return KEYWORDS.some((kw) => name.includes(kw));
    });
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
    .setDescription(`**Club:** ${club.name}\n\n` + lines.join('\n'))
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
    // Global commands (will appear in all guilds, with a bit of propagation delay)
    await c.application.commands.set(COMMANDS);
    console.log('✅ Global commands registered for all servers');

    // Per-guild commands for faster availability + future-proof
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
        // Panel can be created by anyone now; manager-only actions are still
        // restricted inside the panel button handlers.
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

      if (interaction.customId.startsWith('pos_')) {
        const pos = interaction.customId.substring('
