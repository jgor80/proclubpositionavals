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

/**
 * Dynamic formations: each club can pick one, and we build slots from this.
 * Each array is 11 positions in order.
 */
const FORMATION_POSITIONS = {
  // 3-at-the-back
  "3-1-4-2": [
    "GK",
    "CB","CB","CB",
    "CDM",
    "LM","CM","CM","RM",
    "ST","ST"
  ],

  "3-4-1-2": [
    "GK",
    "CB","CB","CB",
    "LM","CM","CM","RM",
    "CAM",
    "ST","ST"
  ],

  "3-4-2-1": [
    "GK",
    "CB","CB","CB",
    "LM","CM","CM","RM",
    "CAM","CAM",
    "ST"
  ],

  "3-4-3": [
    "GK",
    "CB","CB","CB",
    "LM","CM","CM","RM",
    "LW","ST","RW"
  ],

  "3-5-2": [
    "GK",
    "CB","CB","CB",
    "LM","CDM","CAM","CDM","RM",
    "ST","ST"
  ],

  // 4-at-the-back, 4-1-x-x and 4-2-x-x shapes
  "4-1-2-1-2": [          // 41212 (wide)
    "GK",
    "LB","CB","CB","RB",
    "CDM",
    "LM","RM",
    "CAM",
    "ST","ST"
  ],

  "4-1-2-1-2 (2)": [      // 41212(2) (narrow)
    "GK",
    "LB","CB","CB","RB",
    "CDM",
    "CM","CM",
    "CAM",
    "ST","ST"
  ],

  "4-1-3-2": [            // 4132
    "GK",
    "LB","CB","CB","RB",
    "CDM",
    "LM","CM","RM",
    "ST","ST"
  ],

  "4-1-4-1": [            // 4141
    "GK",
    "LB","CB","CB","RB",
    "CDM",
    "LM","CM","CM","RM",
    "ST"
  ],

  "4-2-1-3": [            // 4213
    "GK",
    "LB","CB","CB","RB",
    "CDM","CDM",
    "CAM",
    "LW","ST","RW"
  ],

  "4-2-2-2": [            // 4222
    "GK",
    "LB","CB","CB","RB",
    "CDM","CDM",
    "CAM","CAM",
    "ST","ST"
  ],

  "4-2-3-1": [            // 4231 (narrow, 3 CAMs)
    "GK",
    "LB","CB","CB","RB",
    "CDM","CDM",
    "CAM","CAM","CAM",
    "ST"
  ],

  "4-2-3-1 (2)": [        // 4231(2) (wide: LM/RM + CAM)
    "GK",
    "LB","CB","CB","RB",
    "CDM","CDM",
    "LM","CAM","RM",
    "ST"
  ],

  "4-2-4": [              // 424
    "GK",
    "LB","CB","CB","RB",
    "CM","CM",
    "LW","ST","ST","RW"
  ],

  // 4-3-x-x
  "4-3-1-2": [            // 4312
    "GK",
    "LB","CB","CB","RB",
    "CM","CM","CM",
    "CAM",
    "ST","ST"
  ],

  "4-3-2-1": [            // 4321 (Christmas tree)
    "GK",
    "LB","CB","CB","RB",
    "CM","CM","CM",
    "CF","CF",
    "ST"
  ],

  "4-3-3": [              // 433 base – classic FUT layout
    "GK",
    "LB","CB","CB","RB",
    "CM","CM","CM",
    "LW","ST","RW"
  ],

  "4-3-3 (2)": [          // 433(2) – 1 CDM + 2 CM
    "GK",
    "LB","CB","CB","RB",
    "CDM","CM","CM",
    "LW","ST","RW"
  ],

  "4-3-3 (3)": [          // 433(3) – more defensive, double pivot
    "GK",
    "LB","CB","CB","RB",
    "CDM","CDM","CM",
    "LW","ST","RW"
  ],

  "4-3-3 (4)": [          // 433(4) – more attacking, 2 CAM
    "GK",
    "LB","CB","CB","RB",
    "CM","CAM","CAM",
    "LW","ST","RW"
  ],

  // 4-4-x-x & 4-5-x
  "4-4-1-1 (2)": [        // 4411(2)
    "GK",
    "LB","CB","CB","RB",
    "LM","CM","CM","RM",
    "CF",
    "ST"
  ],

  "4-4-2": [              // 442
    "GK",
    "LB","CB","CB","RB",
    "LM","CM","CM","RM",
    "ST","ST"
  ],

  "4-4-2 (2)": [          // 442(2) – holding, double pivot
    "GK",
    "LB","CB","CB","RB",
    "LM","CDM","CDM","RM",
    "ST","ST"
  ],

  "4-5-1": [              // 451 – more attacking 4-5-1
    "GK",
    "LB","CB","CB","RB",
    "LM","CM","CAM","CM","RM",
    "ST"
  ],

  "4-5-1 (2)": [          // 451(2) – more defensive, double pivot
    "GK",
    "LB","CB","CB","RB",
    "LM","CDM","CAM","CDM","RM",
    "ST"
  ],

  // 5-at-the-back
  "5-2-1-2": [            // 5212
    "GK",
    "LWB","CB","CB","CB","RWB",
    "CM","CM",
    "CAM",
    "ST","ST"
  ],

  "5-2-3": [              // 523
    "GK",
    "LWB","CB","CB","CB","RWB",
    "CM","CM",
    "LW","ST","RW"
  ],

  "5-3-2": [              // 532
    "GK",
    "LWB","CB","CB","CB","RWB",
    "CM","CM","CM",
    "ST","ST"
  ],

  "5-4-1": [              // 541
    "GK",
    "LWB","CB","CB","CB","RWB",
    "LM","CM","CM","RM",
    "ST"
  ]
};

const DEFAULT_FORMATION = "4-3-3";

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

function createEmptyBoardForFormation(formationName) {
  const positions = FORMATION_POSITIONS[formationName] || FORMATION_POSITIONS[DEFAULT_FORMATION];
  return {
    formation: formationName,
    slots: positions.map((label) => ({
      label,
      open: true,
      takenBy: null
    }))
  };
}

function createEmptyBoardState(clubs) {
  const state = {};
  clubs.forEach((club) => {
    state[club.key] = createEmptyBoardForFormation(DEFAULT_FORMATION);
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
// These are allowed to assign/move/remove players and change formations
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

// ---------- FORMATION DISPLAY HELPERS ----------

// Build a “3-column-ish” layout of indices for display (names + positions)
function buildThreeColumnDisplayRows(clubBoard) {
  const slots = clubBoard.slots;
  const sideOf = (label) => {
    const up = label.toUpperCase();
    if (up.startsWith('L')) return 'L';
    if (up.startsWith('R')) return 'R';
    return 'C';
  };

  const strikerIndices = [];
  const attOtherIndices = [];
  const midIndices = [];
  const defIndices = [];
  const gkIndices = [];

  slots.forEach((slot, index) => {
    const label = slot.label.toUpperCase();
    if (label === 'GK') {
      gkIndices.push(index);
    } else if (label === 'ST' || label === 'CF') {
      strikerIndices.push(index);
    } else if (['LW', 'RW', 'LF', 'RF', 'CAM'].includes(label)) {
      attOtherIndices.push(index);
    } else if (['LM', 'RM', 'CM', 'CDM'].includes(label)) {
      midIndices.push(index);
    } else {
      defIndices.push(index);
    }
  });

  const buildGroupRows = (indices) => {
    const rows = [];
    const left = indices.filter((i) => sideOf(slots[i].label) === 'L');
    const right = indices.filter((i) => sideOf(slots[i].label) === 'R');
    const center = indices.filter(
      (i) =>
        sideOf(slots[i].label) === 'C' &&
        !left.includes(i) &&
        !right.includes(i)
    );

    while (left.length || center.length || right.length) {
      const row = [];
      if (left.length) row.push(left.shift());
      if (center.length) row.push(center.shift());
      if (right.length) row.push(right.shift());
      if (row.length === 0) break;
      rows.push(row);
    }
    return rows;
  };

  const rows = [];

  // Strikers first – each on their own “line”
  strikerIndices.forEach((i) => rows.push([i]));

  // Other attackers
  rows.push(...buildGroupRows(attOtherIndices));

  // Midfielders
  rows.push(...buildGroupRows(midIndices));

  // Defenders; special handling for a back five:
  if (defIndices.length === 5) {
    const left = defIndices.filter((i) => sideOf(slots[i].label) === 'L');
    const right = defIndices.filter((i) => sideOf(slots[i].label) === 'R');
    const center = defIndices.filter(
      (i) =>
        sideOf(slots[i].label) === 'C' &&
        !left.includes(i) &&
        !right.includes(i)
    );

    const topRow = [];
    if (left.length) topRow.push(left.shift());
    if (right.length) topRow.push(right.shift());
    if (topRow.length) rows.push(topRow);

    const rest = [...left, ...center, ...right];
    if (rest.length) {
      rows.push(...buildGroupRows(rest));
    }
  } else {
    rows.push(...buildGroupRows(defIndices));
  }

  // Goalkeeper at the very bottom, alone
  gkIndices.forEach((i) => rows.push([i]));

  return rows;
}

// Build the text lines that visualize names above positions
function buildFormationDisplayLines(clubBoard) {
  const slots = clubBoard.slots;
  const rows = buildThreeColumnDisplayRows(clubBoard);
  const colWidth = 16;

  const pad = (str) => {
    if (!str) str = '';
    if (str.length > colWidth) {
      return str.slice(0, colWidth - 1) + '…';
    }
    return str + ' '.repeat(colWidth - str.length);
  };

  const lines = [];

  for (const row of rows) {
    const nameCells = row.map((idx) => {
      const slot = slots[idx];
      if (slot.open) return 'OPEN';
      if (slot.takenBy) return `<@${slot.takenBy}>`;
      return 'TAKEN';
    });
    const posCells = row.map((idx) => slots[idx].label);

    const nameLine = nameCells.map(pad).join(' ');
    const posLine = posCells.map(pad).join(' ');

    lines.push(nameLine);
    lines.push(posLine);
    lines.push('');
  }

  if (lines.length && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return lines;
}

// ---------- UI BUILDERS (per guild) ----------

function buildEmbedForClub(guildId, clubKey) {
  const state = getGuildState(guildId);
  if (!state) throw new Error('No state for guild');

  const { clubs, boardState } = state;
  const club = getClubByKey(clubs, clubKey);
  if (!club) throw new Error(`Unknown club key: ${clubKey}`);

  const clubBoard = boardState[clubKey];
  if (!clubBoard) throw new Error(`No board state for club key: ${clubKey}`);

  const vizLines = buildFormationDisplayLines(clubBoard);

  let description = `**Club:** ${club.name}\n**Formation:** ${clubBoard.formation}\n`;
  if (vizLines.length) {
    description += '\n' + vizLines.join('\n');
  }
  description +=
    '\nPlayers: click a spot below to claim. Managers can assign/move/remove players and change formations.';

  return new EmbedBuilder().setTitle('Club Spots').setDescription(description);
}

// Buttons for a specific club, arranged in 3 rows (attack/mid/def + GK bottom)
function buildButtons(guildId, clubKey) {
  const state = getGuildState(guildId);
  const { boardState } = state;
  const clubBoard = boardState[clubKey];
  const slots = clubBoard.slots;

  // Order positions using the same 3-column logic as the visualizer
  const displayRows = buildThreeColumnDisplayRows(clubBoard);
  let orderedIndices = displayRows.flat();

  // Ensure GK is on its own bottom row
  const gkIndex = orderedIndices.find(
    (i) => slots[i].label.toUpperCase() === 'GK'
  );
  if (gkIndex !== undefined) {
    orderedIndices = orderedIndices.filter((i) => i !== gkIndex);
  }

  const rows = [];

  // First two rows: all non-GK positions, up to 5 buttons per row
  const row1Indices = orderedIndices.slice(0, 5);
  const row2Indices = orderedIndices.slice(5);

  if (row1Indices.length) {
    const row = new ActionRowBuilder();
    row1Indices.forEach((idx) => {
      const slot = slots[idx];
      const button = new ButtonBuilder()
        .setCustomId(`pos_${clubKey}_${idx}`)
        .setLabel(slot.label)
        .setStyle(slot.open ? ButtonStyle.Success : ButtonStyle.Danger);
      row.addComponents(button);
    });
    rows.push(row);
  }

  if (row2Indices.length) {
    const row = new ActionRowBuilder();
    row2Indices.forEach((idx) => {
      const slot = slots[idx];
      const button = new ButtonBuilder()
        .setCustomId(`pos_${clubKey}_${idx}`)
        .setLabel(slot.label)
        .setStyle(slot.open ? ButtonStyle.Success : ButtonStyle.Danger);
      row.addComponents(button);
    });
    rows.push(row);
  }

  // Third row: GK only, if present
  if (gkIndex !== undefined) {
    const gkSlot = slots[gkIndex];
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`pos_${clubKey}_${gkIndex}`)
        .setLabel(gkSlot.label)
        .setStyle(gkSlot.open ? ButtonStyle.Success : ButtonStyle.Danger)
    );
    rows.push(row);
  }

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
// Row 1: club select
// Row 2: control buttons (Rename, Add, Remove, Player Tools, Formation)
// Rows 3-5: dynamic position buttons from formation
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
      .setCustomId(`player_tools_${clubKey}`)
      .setLabel('Player Tools')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`formation_menu_${clubKey}`)
      .setLabel('Formation')
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

// Helper: reset all slots for a club (keep formation)
function resetClubSpots(boardState, clubKey) {
  const clubBoard = boardState[clubKey];
  if (!clubBoard) return;
  clubBoard.slots.forEach((slot) => {
    slot.open = true;
    slot.takenBy = null;
  });
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

// Helper: start "Assign from VC" flow (manager-only)
async function startAssignFromVc(interaction, state, clubKey) {
  if (!isManager(interaction.member)) {
    return interaction.reply({
      content:
        'Only captains, managers, owners, media, or admins can assign or move players.',
      ephemeral: true
    });
  }

  const { clubs, boardState } = state;
  const clubsBtn = clubs;
  const boardStateBtn = boardState;

  const club = getClubByKey(clubsBtn, clubKey);
  if (!club) {
    return interaction.reply({
      content: 'Unknown club in assignment request.',
      ephemeral: true
    });
  }

  // Enforce correct VC for VC panels
  const vcPanelInfo = getVcPanelByMessage(state, interaction.message.id);
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

  return interaction.reply({
    content: `Pick a player to assign in **${club.name}**:`,
    components: [row],
    ephemeral: true
  });
}

// Helper: start "Manage existing players" flow (manager-only)
async function startManagePlayers(interaction, state, clubKey) {
  if (!isManager(interaction.member)) {
    return interaction.reply({
      content:
        'Only captains, managers, owners, media, or admins can remove or move players.',
      ephemeral: true
    });
  }

  const { clubs, boardState } = state;
  const clubsBtn = clubs;
  const boardStateBtn = boardState;

  const clubBoard = boardStateBtn[clubKey];
  if (!clubBoard) {
    return interaction.reply({
      content: 'Club not found.',
      ephemeral: true
    });
  }

  // Collect unique players who currently have slots
  const seen = new Set();
  const options = [];

  for (const slot of clubBoard.slots) {
    if (slot.open || !slot.takenBy) continue;
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
      description: 'Currently in at least one spot'
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

// Helper: reset all spots (manager-only)
async function doResetSpots(interaction, state, guildId, clubKey) {
  if (!isManager(interaction.member)) {
    return interaction.reply({
      content:
        'Only captains, managers, owners, media, or admins can reset spots.',
      ephemeral: true
    });
  }

  resetClubSpots(state.boardState, clubKey);
  await refreshClubPanels(guildId, clubKey);

  return interaction.reply({
    content: 'All spots set to 🟢 OPEN for this club.',
    ephemeral: true
  });
}

// Helper: set formation and rebuild slots (manager-only)
async function setClubFormation(interaction, guildId, clubKey, formationName) {
  if (!isManager(interaction.member)) {
    return interaction.reply({
      content:
        'Only captains, managers, owners, media, or admins can change formations.',
      ephemeral: true
    });
  }

  const state = getGuildState(guildId);
  if (!state) {
    return interaction.reply({
      content: 'Guild state not found.',
      ephemeral: true
    });
  }

  const positions = FORMATION_POSITIONS[formationName];
  if (!positions) {
    return interaction.reply({
      content: 'Unknown formation.',
      ephemeral: true
    });
  }

  state.boardState[clubKey] = createEmptyBoardForFormation(formationName);
  await refreshClubPanels(guildId, clubKey);

  return interaction.update({
    content: `Formation for this club is now **${formationName}**. All spots have been reset.`,
    components: []
  });
}

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
        boardStateBtn[disabledClub.key] = createEmptyBoardForFormation(DEFAULT_FORMATION);
        stateBtn.currentClubKey = disabledClub.key;

        return interaction.reply({
          content: `Added a new club slot: **${disabledClub.name}**. Use "Rename Club" & "Formation" to configure it.`,
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
        if (clubBoard && clubBoard.slots) {
          const hasTaken = clubBoard.slots.some((slot) => !slot.open);
          if (hasTaken) {
            return interaction.reply({
              content:
                'This club still has taken spots. Free all spots first before removing it.',
              ephemeral: true
            });
          }
        }

        currentClub.enabled = false;
        resetClubSpots(boardStateBtn, clubKey);

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

      // Player tools (manager-only, opens ephemeral menu)
      if (id.startsWith('player_tools_')) {
        const clubKey = id.substring('player_tools_'.length);

        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can use player tools.',
            ephemeral: true
          });
        }

        const select = new StringSelectMenuBuilder()
          .setCustomId(`player_tools_select_${clubKey}`)
          .setPlaceholder('Choose a player tool')
          .addOptions(
            {
              label: 'Assign from your voice channel',
              value: 'assign'
            },
            {
              label: 'Remove/move existing players',
              value: 'manage'
            },
            {
              label: 'Reset all spots',
              value: 'reset'
            }
          );

        const row = new ActionRowBuilder().addComponents(select);

        return interaction.reply({
          content: 'What do you want to do?',
          components: [row],
          ephemeral: true
        });
      }

      // Formation menu button (manager-only, opens ephemeral select of all formations)
      if (id.startsWith('formation_menu_')) {
        const clubKey = id.substring('formation_menu_'.length);

        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can change formations.',
            ephemeral: true
          });
        }

        const clubBoard = boardState[clubKey] || createEmptyBoardForFormation(DEFAULT_FORMATION);
        const currentFormation = clubBoard.formation || DEFAULT_FORMATION;

        const formationNames = Object.keys(FORMATION_POSITIONS);

        const select = new StringSelectMenuBuilder()
          .setCustomId(`formation_select_${clubKey}`)
          .setPlaceholder('Select a formation')
          .addOptions(
            formationNames.map((name) => ({
              label: name,
              value: name,
              default: name === currentFormation
            })).slice(0, 25) // Discord limit per select; you can trim if needed
          );

        const row = new ActionRowBuilder().addComponents(select);

        return interaction.reply({
          content:
            'Choose a formation. Changing formation will reset all spots to OPEN for this club.',
          components: [row],
          ephemeral: true
        });
      }

      // Player self-claim/free spot (must be in VC; and on VC panels, must be the right VC)
      if (id.startsWith('pos_')) {
        // customId: pos_<clubKey>_<index>
        const parts = id.split('_'); // ['pos', clubKey, index]
        const clubKey = parts[1];
        const index = parseInt(parts[2], 10);

        const clubBoard = boardStateBtn[clubKey];
        if (!clubBoard || !clubBoard.slots[index]) {
          return;
        }

        const slot = clubBoard.slots[index];

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

        if (slot.open) {
          // Claim: clear any other slots this user holds in this club
          clubBoard.slots.forEach((s) => {
            if (s.takenBy === userId) {
              s.open = true;
              s.takenBy = null;
            }
          });
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

        await interaction.deferUpdate();
        await refreshClubPanels(guildIdBtn, clubKey);
        return;
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

    // ----- Dropdowns (club select, viewer select, player tools, assignment selects, vcspots, formation select, manage players) -----
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

      // Player Tools selection (manager-only)
      if (id.startsWith('player_tools_select_')) {
        const clubKey = id.substring('player_tools_select_'.length);
        const choice = interaction.values[0];

        if (choice === 'assign') {
          return startAssignFromVc(interaction, stateSel, clubKey);
        }
        if (choice === 'manage') {
          return startManagePlayers(interaction, stateSel, clubKey);
        }
        if (choice === 'reset') {
          return doResetSpots(interaction, stateSel, guildIdSel, clubKey);
        }
        return;
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
        const clubBoard = stateSel.boardState[clubKey];
        if (!clubBoard) {
          return interaction.reply({
            content: 'Club board not found.',
            ephemeral: true
          });
        }

        // Build slot options with numbering if duplicate labels
        const labelCounts = {};
        clubBoard.slots.forEach((slot) => {
          labelCounts[slot.label] = (labelCounts[slot.label] || 0) + 1;
        });

        const seenLabelIndex = {};
        const options = clubBoard.slots.map((slot, idx) => {
          const total = labelCounts[slot.label];
          let label = slot.label;
          if (total > 1) {
            seenLabelIndex[slot.label] = (seenLabelIndex[slot.label] || 0) + 1;
            label = `${slot.label} (${seenLabelIndex[slot.label]})`;
          }
          return {
            label,
            value: String(idx)
          };
        });

        const posSelect = new StringSelectMenuBuilder()
          .setCustomId(`assign_player_pos_${clubKey}_${userId}`)
          .setPlaceholder('Pick a spot')
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(posSelect);

        return interaction.update({
          content: `Now pick a spot for <@${userId}> in **${club.name}**:`,
          components: [row]
        });
      }

      // Second step of manager assignment: pick spot index (manager-only)
      if (id.startsWith('assign_player_pos_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can assign or move players.',
            ephemeral: true
          });
        }

        const parts = id.split('_'); // ['assign','player','pos',clubKey,userId]
        const clubKey = parts[3];
        const userId = parts[4];
        const slotIndex = parseInt(interaction.values[0], 10);

        const club = getClubByKey(stateSel.clubs, clubKey);
        if (!club) {
          return interaction.reply({
            content: 'Unknown club in assignment request.',
            ephemeral: true
          });
        }

        const clubBoard = stateSel.boardState[clubKey];
        if (!clubBoard || !clubBoard.slots[slotIndex]) {
          return interaction.reply({
            content: 'Unknown spot for this club.',
            ephemeral: true
          });
        }

        // Clear any slots this user holds in this club
        clubBoard.slots.forEach((s) => {
          if (s.takenBy === userId) {
            s.open = true;
            s.takenBy = null;
          }
        });

        // Assign to chosen slot (override previous occupant)
        const slot = clubBoard.slots[slotIndex];
        slot.open = false;
        slot.takenBy = userId;

        await refreshClubPanels(guildIdSel, clubKey);

        return interaction.update({
          content: `Assigned <@${userId}> to **${slot.label}** in **${club.name}**.`,
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
        const clubBoard = stateSel.boardState[clubKey];
        if (!clubBoard) {
          return interaction.reply({
            content: 'Club board not found.',
            ephemeral: true
          });
        }

        // Build slot options with numbering if duplicate labels
        const labelCounts = {};
        clubBoard.slots.forEach((slot) => {
          labelCounts[slot.label] = (labelCounts[slot.label] || 0) + 1;
        });

        const seenLabelIndex = {};
        const options = clubBoard.slots.map((slot, idx) => {
          const total = labelCounts[slot.label];
          let label = slot.label;
          if (total > 1) {
            seenLabelIndex[slot.label] = (seenLabelIndex[slot.label] || 0) + 1;
            label = `${slot.label} (${seenLabelIndex[slot.label]})`;
          }
          return {
            label,
            value: String(idx)
          };
        });

        options.push({
          label: 'Remove from all spots',
          value: '__REMOVE__'
        });

        const posSelect = new StringSelectMenuBuilder()
          .setCustomId(`manage_player_pos_${clubKey}_${userId}`)
          .setPlaceholder('Choose a new spot or remove from all')
          .addOptions(options);

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

        // Clear all slots this user holds in this club
        clubBoard.slots.forEach((s) => {
          if (s.takenBy === userId) {
            s.open = true;
            s.takenBy = null;
          }
        });

        if (choice !== '__REMOVE__') {
          const slotIndex = parseInt(choice, 10);
          const slot = clubBoard.slots[slotIndex];
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
              : `Moved <@${userId}> to **${clubBoard.slots[parseInt(choice, 10)].label}** in **${club.name}**.`,
          components: []
        });
      }

      // Formation selection (manager-only)
      if (id.startsWith('formation_select_')) {
        const clubKey = id.substring('formation_select_'.length);
        const formationName = interaction.values[0];
        return setClubFormation(interaction, guildIdSel, clubKey, formationName);
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

// When someone leaves voice, clear any slots they held in any club
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
      if (!clubBoard || !clubBoard.slots) continue;

      let changed = false;
      for (const slot of clubBoard.slots) {
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
