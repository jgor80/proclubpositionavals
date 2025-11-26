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
// Max clubs = 5
const DEFAULT_CLUBS = [
  { key: 'club1', name: 'Club 1', enabled: true },
  { key: 'club2', name: 'Club 2', enabled: false },
  { key: 'club3', name: 'Club 3', enabled: false },
  { key: 'club4', name: 'Club 4', enabled: false },
  { key: 'club5', name: 'Club 5', enabled: false }
];

// Slash commands (reused for every guild)
const COMMANDS = [
  {
    name: 'spotpanel',
    description: 'Create the global control panel for club spots.'
  },
  {
    name: 'spots',
    description: 'Show a read-only board with club dropdown.'
  },
  {
    name: 'vcspots',
    description:
      'Create/update a live club spot panel linked to your current voice channel.'
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

// guildId -> {
//   clubs,
//   boardState,
//   currentClubKey,
//   adminPanelChannelId,
//   adminPanelMessageId,
//   vcPanels: { [voiceChannelId]: { clubKey, textChannelId, messageId } }
// }
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
      adminPanelMessageId: null,
      vcPanels: {}
    };
    guildStates.set(guildId, state);
  }
  return state;
}

function getClubByKey(clubs, key) {
  return clubs.find((c) => c.key === key);
}

// Admins or roles with "captain", "manager", "owner", or "media" in the name
// These are allowed to assign/move/remove players
function isManager(member) {
  if (!member) return false;
  // Admin-style permission
  if (member.permissions?.has(PermissionsBitField.Flags.ManageGuild)) return true;
  if (!member.roles?.cache) return false;

  const managerKeywords = ['captain', 'manager', 'owner', 'media'];
  return member.roles.cache.some((role) => {
    const name = role.name.toLowerCase();
    return managerKeywords.some((kw) => name.includes(kw));
  });
}

// Find if a message belongs to a VC-linked panel
function getVcPanelByMessage(state, messageId) {
  if (!state.vcPanels) return null;
  for (const [vcId, panel] of Object.entries(state.vcPanels)) {
    if (panel && panel.messageId === messageId) {
      return { vcId, panel };
    }
  }
  return null;
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
        'Players: click a spot to claim. Managers can assign/move/remove players.'
    });
}

// Buttons for a specific club
function buildButtons(guildId, clubKey) {
  const state = getGuildState(guildId);
  const { boardState } = state;
  const clubBoard = boardState[clubKey];

  const rows = [];
  let currentRow = new ActionRowBuilder();

  POSITIONS.forEach((p, index) => {
    const slot = clubBoard.spots[p];
    const button = new ButtonBuilder()
      // embed clubKey into the customId so multiple panels can exist safely
      .setCustomId(`pos_${clubKey}_${p}`)
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

// Club select used on the admin/global panels
function buildClubSelect(guildId, currentClubKey) {
  const state = getGuildState(guildId);
  const { clubs } = state;

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

// Viewer dropdown for the read-only /spots board
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

// Admin/VC panel components for a specific club
function buildAdminComponents(guildId, clubKey) {
  const clubRow = buildClubSelect(guildId, clubKey);

  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rename_club_${clubKey}`)
      .setLabel('Rename Club')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('add_club')
      .setLabel('Add Club')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`remove_club_${clubKey}`)
      .setLabel('Remove Club')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`assign_player_${clubKey}`)
      .setLabel('Assign Player')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`manage_players_${clubKey}`)
      .setLabel('Remove/Move Players')
      .setStyle(ButtonStyle.Secondary)
  );

  const buttonRows = buildButtons(guildId, clubKey);
  return [clubRow, controlRow, ...buttonRows];
}

// Refresh all panels (global + any VC panels) that show a given club
async function refreshClubPanels(guildId, clubKey) {
  const state = getGuildState(guildId);
  if (!state) return;

  // Update global admin panel if it is currently showing this club
  if (
    state.adminPanelChannelId &&
    state.adminPanelMessageId &&
    state.currentClubKey === clubKey
  ) {
    try {
      const channel = await client.channels.fetch(state.adminPanelChannelId);
      const msg = await channel.messages.fetch(state.adminPanelMessageId);
      await msg.edit({
        embeds: [buildEmbedForClub(guildId, clubKey)],
        components: buildAdminComponents(guildId, clubKey)
      });
    } catch (err) {
      console.error('⚠️ Failed to update admin panel after state change:', err);
    }
  }

  // Update VC panels bound to this club
  if (state.vcPanels) {
    for (const [vcId, panel] of Object.entries(state.vcPanels)) {
      if (!panel || panel.clubKey !== clubKey) continue;

      try {
        const channel = await client.channels.fetch(panel.textChannelId);
        const msg = await channel.messages.fetch(panel.messageId);
        await msg.edit({
          embeds: [buildEmbedForClub(guildId, clubKey)],
          components: buildAdminComponents(guildId, clubKey)
        });
      } catch (err) {
        console.error(
          `⚠️ Failed to update VC panel for voice channel ${vcId} after state change:`,
          err
        );
      }
    }
  }
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

    // ----- Slash Commands -----
    if (interaction.isChatInputCommand()) {
      const cmd = interaction.commandName;

      // Global admin panel (anyone can make it)
      if (cmd === 'spotpanel') {
        await interaction.reply({
          embeds: [buildEmbedForClub(guildId, state.currentClubKey)],
          components: buildAdminComponents(guildId, state.currentClubKey)
        });

        const msg = await interaction.fetchReply();

        state.adminPanelChannelId = interaction.channelId;
        state.adminPanelMessageId = msg.id;
        return;
      }

      // Read-only viewer board
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

      // VC-linked live panel
      if (cmd === 'vcspots') {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
          return interaction.reply({
            content: 'You must be in a voice channel to use `/vcspots`.',
            ephemeral: true
          });
        }

        const enabledClubs = clubs.filter((c) => c.enabled);
        if (enabledClubs.length === 0) {
          return interaction.reply({
            content:
              'No enabled clubs are available. Use `/spotpanel` to add or enable clubs first.',
            ephemeral: true
          });
        }

        const select = new StringSelectMenuBuilder()
          .setCustomId(`vcspots_pickclub_${voiceChannel.id}`)
          .setPlaceholder('Select club for this voice channel')
          .addOptions(
            enabledClubs.map((club) => ({
              label: club.name,
              value: club.key
            }))
          );

        const row = new ActionRowBuilder().addComponents(select);

        return interaction.reply({
          content: `Pick which club is playing in **${voiceChannel.name}**. I’ll post/update the live panel in this chat.`,
          components: [row],
          ephemeral: true
        });
      }
    }

    // ----- Buttons -----
    if (interaction.isButton()) {
      const guildIdBtn = interaction.guildId;
      const stateBtn = getGuildState(guildIdBtn);
      if (!stateBtn) return;

      const { clubs: clubsBtn, boardState: boardStateBtn } = stateBtn;
      const id = interaction.customId;

      // Rename club (opens modal)
      if (id.startsWith('rename_club_')) {
        const clubKey = id.substring('rename_club_'.length);
        const currentClub = getClubByKey(clubsBtn, clubKey);
        if (!currentClub) {
          return interaction.reply({
            content: 'Current club not found.',
            ephemeral: true
          });
        }

        const modal = new ModalBuilder()
          .setCustomId(`rename_club_modal_${clubKey}`)
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

      // Add a new club slot (global, not tied to a specific club)
      if (id === 'add_club') {
        const disabledClub = clubsBtn.find((c) => !c.enabled);
        if (!disabledClub) {
          return interaction.reply({
            content: 'All available club slots are already in use (max 5).',
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

        return interaction.reply({
          content: `Added a new club slot: **${disabledClub.name}**. Use "Rename Club" to give it a custom name.`,
          ephemeral: true
        });
      }

      // Remove a club
      if (id.startsWith('remove_club_')) {
        const clubKey = id.substring('remove_club_'.length);
        const currentClub = getClubByKey(clubsBtn, clubKey);
        if (!currentClub || !currentClub.enabled) {
          return interaction.reply({
            content: 'This club cannot be removed.',
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

        const clubBoard = boardStateBtn[clubKey];
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

        // If the removed club was the "current" one, move pointer
        if (stateBtn.currentClubKey === clubKey) {
          const firstEnabled = clubsBtn.find((c) => c.enabled);
          if (firstEnabled) stateBtn.currentClubKey = firstEnabled.key;
        }

        return interaction.reply({
          content: `Removed club **${currentClub.name}**. Panels may need to be recreated to reflect this change.`,
          ephemeral: true
        });
      }

      // Reset all spots for a specific club
      if (id.startsWith('reset_spots_')) {
        const clubKey = id.substring('reset_spots_'.length);
        const clubBoard = boardStateBtn[clubKey];
        if (!clubBoard) {
          return interaction.reply({
            content: 'Club not found.',
            ephemeral: true
          });
        }

        POSITIONS.forEach((p) => {
          clubBoard.spots[p].open = true;
          clubBoard.spots[p].takenBy = null;
        });

        await refreshClubPanels(guildIdBtn, clubKey);

        return interaction.reply({
          content: 'All spots set to 🟢 OPEN for this club.',
          ephemeral: true
        });
      }

      // Assign player button for a specific club (manager-only)
      if (id.startsWith('assign_player_')) {
        const clubKey = id.substring('assign_player_'.length);

        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can assign or move players.',
            ephemeral: true
          });
        }

        // Enforce correct VC for VC panels
        const vcPanelInfo = getVcPanelByMessage(stateBtn, interaction.message.id);
        let voiceChannel = null;

        if (vcPanelInfo) {
          const { vcId } = vcPanelInfo;
          voiceChannel =
            interaction.guild.channels.cache.get(vcId) ||
            (await interaction.guild.channels.fetch(vcId).catch(() => null));

          if (!voiceChannel) {
            return interaction.reply({
              content:
                'The voice channel linked to this panel no longer exists.',
              ephemeral: true
            });
          }

          if (interaction.member?.voice?.channelId !== vcId) {
            return interaction.reply({
              content: `You must be in **${voiceChannel.name}** to assign players for this panel.`,
              ephemeral: true
            });
          }
        } else {
          // Global panel: allow any VC, but must be in one
          voiceChannel = interaction.member?.voice?.channel;
          if (!voiceChannel) {
            return interaction.reply({
              content:
                'You must be in a voice channel with the players you want to assign.',
              ephemeral: true
            });
          }
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
          .setCustomId(`assign_player_pick_${clubKey}`)
          .setPlaceholder('Pick a player')
          .addOptions(options.slice(0, 25));

        const row = new ActionRowBuilder().addComponents(select);
        const club = getClubByKey(clubsBtn, clubKey);

        return interaction.reply({
          content: `Pick a player to assign in **${club ? club.name : clubKey}**:`,
          components: [row],
          ephemeral: true
        });
      }

      // Manager button: remove/move players already on the board
      if (id.startsWith('manage_players_')) {
        const clubKey = id.substring('manage_players_'.length);

        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can remove or move players.',
            ephemeral: true
          });
        }

        const clubBoard = boardStateBtn[clubKey];
        if (!clubBoard) {
          return interaction.reply({
            content: 'Club not found.',
            ephemeral: true
          });
        }

        // Collect unique players who currently have spots
        const seen = new Set();
        const options = [];

        for (const pos of POSITIONS) {
          const slot = clubBoard.spots[pos];
          if (!slot || slot.open || !slot.takenBy) continue;
          const userId = slot.takenBy;
          if (seen.has(userId)) continue;
          seen.add(userId);

          let label = userId;
          try {
            const member = await interaction.guild.members.fetch(userId);
            label = member.displayName || member.user.username || userId;
          } catch (err) {
            // ignore fetch error, just keep userId
          }

          options.push({
            label,
            value: userId,
            description: `Currently in a spot`
          });
        }

        if (options.length === 0) {
          return interaction.reply({
            content: 'There are no players to manage for this club.',
            ephemeral: true
          });
        }

        const select = new StringSelectMenuBuilder()
          .setCustomId(`manage_player_pick_${clubKey}`)
          .setPlaceholder('Select a player to remove/move')
          .addOptions(options.slice(0, 25));

        const row = new ActionRowBuilder().addComponents(select);
        const club = getClubByKey(clubsBtn, clubKey);

        return interaction.reply({
          content: `Pick a player in **${club ? club.name : clubKey}** to remove or move:`,
          components: [row],
          ephemeral: true
        });
      }

      // Player self-claim/free spot (must be in VC; and on VC panels, must be the right VC)
      if (id.startsWith('pos_')) {
        // customId: pos_<clubKey>_<position>
        const parts = id.split('_'); // ['pos', clubKey, pos]
        const clubKey = parts[1];
        const pos = parts[2];

        const clubBoard = boardStateBtn[clubKey];
        if (!clubBoard || !Object.prototype.hasOwnProperty.call(clubBoard.spots, pos)) {
          return;
        }

        // Is this message a VC panel?
        const vcPanelInfo = getVcPanelByMessage(stateBtn, interaction.message.id);
        if (vcPanelInfo) {
          const { vcId } = vcPanelInfo;
          if (interaction.member?.voice?.channelId !== vcId) {
            let vcChannel = null;
            try {
              vcChannel =
                interaction.guild.channels.cache.get(vcId) ||
                (await interaction.guild.channels.fetch(vcId));
            } catch (err) {
              // ignore; vcChannel remains null
            }

            return interaction.reply({
              content: `This panel is linked to voice channel **${
                vcChannel ? vcChannel.name : vcId
              }**. Join that voice channel to claim or free a spot.`,
              ephemeral: true
            });
          }
        } else {
          // Not a VC panel: require being in some VC at least
          const inVoice = interaction.member?.voice?.channelId;
          if (!inVoice) {
            return interaction.reply({
              content:
                'You must be connected to a voice channel to claim or free a spot.',
              ephemeral: true
            });
          }
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
                'This spot is already taken by someone else. Ask a manager if you need to be moved.',
              ephemeral: true
            });
          }
        }

        return interaction.update({
          embeds: [buildEmbedForClub(guildIdBtn, clubKey)],
          components: buildAdminComponents(guildIdBtn, clubKey)
        });
      }
    }

    // ----- Modals (rename club) -----
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;

      if (id.startsWith('rename_club_modal_')) {
        const clubKey = id.substring('rename_club_modal_'.length);

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

        const currentClub = getClubByKey(stateModal.clubs, clubKey);
        if (!currentClub) {
          return interaction.reply({
            content: 'Current club not found.',
            ephemeral: true
          });
        }

        currentClub.name = newName;

        await refreshClubPanels(interaction.guildId, clubKey);

        return interaction.reply({
          content: `Club renamed to **${newName}**.`,
          ephemeral: true
        });
      }
    }

    // ----- Dropdowns (club select, viewer select, assignment selects, vcspots, manage players) -----
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

      // Change which club we're editing on a given panel
      if (id === 'club_select') {
        const selectedKey = interaction.values[0];
        const club = getClubByKey(stateSel.clubs, selectedKey);
        if (!club) {
          return interaction.reply({
            content: 'Unknown club selected.',
            ephemeral: true
          });
        }

        stateSel.currentClubKey = selectedKey;

        // If this message is a VC panel, update its mapping
        const vcPanelInfo = getVcPanelByMessage(stateSel, interaction.message.id);
        if (vcPanelInfo) {
          vcPanelInfo.panel.clubKey = selectedKey;
        }

        return interaction.update({
          embeds: [buildEmbedForClub(guildIdSel, selectedKey)],
          components: buildAdminComponents(guildIdSel, selectedKey)
        });
      }

      // First step of manager assignment: pick player (manager-only)
      if (id.startsWith('assign_player_pick_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can assign or move players.',
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

      // Second step of manager assignment: pick spot (manager-only)
      if (id.startsWith('assign_player_pos_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can assign or move players.',
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

        await refreshClubPanels(guildIdSel, clubKey);

        return interaction.update({
          content: `Assigned <@${userId}> to **${pos}** in **${club.name}**.`,
          components: []
        });
      }

      // vcspots: pick which club is playing in this VC
      if (id.startsWith('vcspots_pickclub_')) {
        const voiceChannelId = id.substring('vcspots_pickclub_'.length);
        const clubKey = interaction.values[0];

        const club = getClubByKey(stateSel.clubs, clubKey);
        if (!club || !club.enabled) {
          return interaction.reply({
            content: 'Unknown or disabled club selected.',
            ephemeral: true
          });
        }

        let vc;
        try {
          vc = await interaction.guild.channels.fetch(voiceChannelId);
        } catch (err) {
          console.error('⚠️ Failed to fetch voice channel for vcspots:', err);
        }

        // Try to reuse an existing panel for this VC, otherwise create one
        const existingPanel = stateSel.vcPanels[voiceChannelId];
        let panelMessage = null;

        try {
          if (existingPanel) {
            const channel = await interaction.guild.channels.fetch(
              existingPanel.textChannelId
            );
            panelMessage = await channel.messages.fetch(existingPanel.messageId);
            await panelMessage.edit({
              embeds: [buildEmbedForClub(guildIdSel, clubKey)],
              components: buildAdminComponents(guildIdSel, clubKey)
            });
          }
        } catch (err) {
          console.error(
            '⚠️ Failed to edit existing VC panel, sending a new one instead:',
            err
          );
          panelMessage = null;
        }

        if (!panelMessage) {
          panelMessage = await interaction.channel.send({
            embeds: [buildEmbedForClub(guildIdSel, clubKey)],
            components: buildAdminComponents(guildIdSel, clubKey)
          });
        }

        stateSel.vcPanels[voiceChannelId] = {
          clubKey,
          textChannelId: panelMessage.channel.id,
          messageId: panelMessage.id
        };

        return interaction.update({
          content: `Linked **${club.name}** to voice channel **${
            vc ? vc.name : 'this VC'
          }** and posted/updated the live panel in this chat.`,
          components: []
        });
      }

      // Manage players: pick which player to manage (manager-only)
      if (id.startsWith('manage_player_pick_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can remove or move players.',
            ephemeral: true
          });
        }

        const clubKey = id.substring('manage_player_pick_'.length);
        const club = getClubByKey(stateSel.clubs, clubKey);
        if (!club) {
          return interaction.reply({
            content: 'Unknown club in manage request.',
            ephemeral: true
          });
        }

        const userId = interaction.values[0];

        const posSelect = new StringSelectMenuBuilder()
          .setCustomId(`manage_player_pos_${clubKey}_${userId}`)
          .setPlaceholder('Choose a new spot or remove from all')
          .addOptions([
            ...POSITIONS.map((p) => ({
              label: p,
              value: p
            })),
            {
              label: 'Remove from all spots',
              value: '__REMOVE__'
            }
          ]);

        const row = new ActionRowBuilder().addComponents(posSelect);

        return interaction.update({
          content: `Manage <@${userId}> in **${club.name}**:`,
          components: [row]
        });
      }

      // Manage players: choose new position or remove (manager-only)
      if (id.startsWith('manage_player_pos_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can remove or move players.',
            ephemeral: true
          });
        }

        const parts = id.split('_'); // ['manage','player','pos',clubKey,userId]
        const clubKey = parts[3];
        const userId = parts[4];
        const choice = interaction.values[0];

        const club = getClubByKey(stateSel.clubs, clubKey);
        if (!club) {
          return interaction.reply({
            content: 'Unknown club in manage request.',
            ephemeral: true
          });
        }

        const clubBoard = stateSel.boardState[clubKey];
        if (!clubBoard) {
          return interaction.reply({
            content: 'Club board not found.',
            ephemeral: true
          });
        }

        // Clear all spots this user holds in this club
        for (const p of POSITIONS) {
          const s = clubBoard.spots[p];
          if (s && s.takenBy === userId) {
            s.open = true;
            s.takenBy = null;
          }
        }

        if (choice !== '__REMOVE__') {
          const pos = choice;
          const slot = clubBoard.spots[pos];
          if (!slot) {
            return interaction.reply({
              content: 'Unknown position for this club.',
              ephemeral: true
            });
          }
          slot.open = false;
          slot.takenBy = userId;
        }

        await refreshClubPanels(guildIdSel, clubKey);

        return interaction.update({
          content:
            choice === '__REMOVE__'
              ? `Removed <@${userId}> from all spots in **${club.name}**.`
              : `Moved <@${userId}> to **${choice}** in **${club.name}**.`,
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
    // If they are still in *some* voice channel (moved), don’t clear yet
    if (newState.channelId) return;

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

    for (const clubKey of touchedClubKeys) {
      await refreshClubPanels(guildId, clubKey);
    }
  } catch (err) {
    console.error('❌ Error in VoiceStateUpdate handler:', err);
  }
});

// ---------- LOGIN ----------

client.login(token);
