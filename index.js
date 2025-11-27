// ============================================
// index.js — PART 1/4
// ============================================

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

// Load token
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("❌ BOT_TOKEN missing in environment");
  process.exit(1);
}

// Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ]
});


// ============================================
// FORMATIONS
// ============================================

// Main formations map
const FORMATION_POSITIONS = {
  "3-1-4-2": ["GK","CB","CB","CB","CDM","LM","CM","CM","RM","ST","ST"],
  "3-4-1-2": ["GK","CB","CB","CB","LM","CM","CM","RM","CAM","ST","ST"],
  "3-4-2-1": ["GK","CB","CB","CB","LM","CM","CM","RM","CAM","CAM","ST"],
  "3-4-3":   ["GK","CB","CB","CB","LM","CM","CM","RM","LW","ST","RW"],
  "3-5-2":   ["GK","CB","CB","CB","LM","CDM","CAM","CDM","RM","ST","ST"],

  "4-1-2-1-2":     ["GK","LB","CB","CB","RB","CDM","LM","RM","CAM","ST","ST"],
  "4-1-2-1-2 (2)": ["GK","LB","CB","CB","RB","CDM","CM","CM","CAM","ST","ST"],
  "4-1-3-2":       ["GK","LB","CB","CB","RB","CDM","LM","CM","RM","ST","ST"],
  "4-1-4-1":       ["GK","LB","CB","CB","RB","CDM","LM","CM","CM","RM","ST"],
  "4-2-1-3":       ["GK","LB","CB","CB","RB","CDM","CDM","CAM","LW","ST","RW"],
  "4-2-2-2":       ["GK","LB","CB","CB","RB","CDM","CDM","CAM","CAM","ST","ST"],
  "4-2-3-1":       ["GK","LB","CB","CB","RB","CDM","CDM","CAM","CAM","CAM","ST"],
  "4-2-3-1 (2)":   ["GK","LB","CB","CB","RB","CDM","CDM","LM","CAM","RM","ST"],
  "4-2-4":         ["GK","LB","CB","CB","RB","CM","CM","LW","ST","ST","RW"],

  "4-3-1-2": ["GK","LB","CB","CB","RB","CM","CM","CM","CAM","ST","ST"],
  "4-3-2-1": ["GK","LB","CB","CB","RB","CM","CM","CM","CF","CF","ST"],
  "4-3-3":   ["GK","LB","CB","CB","RB","CM","CM","CM","LW","ST","RW"],
  "4-3-3 (2)": ["GK","LB","CB","CB","RB","CDM","CM","CM","LW","ST","RW"],
  "4-3-3 (3)": ["GK","LB","CB","CB","RB","CDM","CDM","CM","LW","ST","RW"],
  "4-3-3 (4)": ["GK","LB","CB","CB","RB","CM","CAM","CAM","LW","ST","RW"],

  "4-4-1-1 (2)": ["GK","LB","CB","CB","RB","LM","CM","CM","RM","CF","ST"],
  "4-4-2":       ["GK","LB","CB","CB","RB","LM","CM","CM","RM","ST","ST"],
  "4-4-2 (2)":   ["GK","LB","CB","CB","RB","LM","CDM","CDM","RM","ST","ST"],

  "4-5-1":     ["GK","LB","CB","CB","RB","LM","CM","CAM","CM","RM","ST"],
  "4-5-1 (2)": ["GK","LB","CB","CB","RB","LM","CDM","CAM","CDM","RM","ST"],

  "5-2-1-2": ["GK","LWB","CB","CB","CB","RWB","CM","CM","CAM","ST","ST"],
  "5-2-3":   ["GK","LWB","CB","CB","CB","RWB","CM","CM","LW","ST","RW"],
  "5-3-2":   ["GK","LWB","CB","CB","CB","RWB","CM","CM","CM","ST","ST"],
  "5-4-1":   ["GK","LWB","CB","CB","CB","RWB","LM","CM","CM","RM","ST"]
};

// Grouped formation categories for new dropdown UI
const FORMATION_CATEGORIES = {
  "3-Back Formations": Object.keys(FORMATION_POSITIONS).filter(f => f.startsWith("3-")),
  "4-Back Formations": Object.keys(FORMATION_POSITIONS).filter(f => f.startsWith("4-")),
  "5-Back Formations": Object.keys(FORMATION_POSITIONS).filter(f => f.startsWith("5-")),
  "2-Striker Formations": Object.keys(FORMATION_POSITIONS).filter(f => {
    const arr = FORMATION_POSITIONS[f];
    const last2 = arr.slice(-2);
    return last2[0] === "ST" && last2[1] === "ST";
  })
};

const DEFAULT_FORMATION = "4-3-3";

// Default clubs
const DEFAULT_CLUBS = [
  { key: "club1", name: "Club 1", enabled: true },
  { key: "club2", name: "Club 2", enabled: false },
  { key: "club3", name: "Club 3", enabled: false },
  { key: "club4", name: "Club 4", enabled: false },
  { key: "club5", name: "Club 5", enabled: false }
];

// Slash commands
const COMMANDS = [
  { name: "spotpanel", description: "Create admin club spot panel." },
  { name: "spots", description: "View club spots (viewer mode)." },
  { name: "vcspots", description: "Create a live panel linked to your voice channel." }
];


// ============================================
// PER-GUILD STATE
// ============================================

function cloneDefaultClubs() {
  return DEFAULT_CLUBS.map(c => ({ ...c }));
}

function createBoardFromFormation(formationName) {
  const positions = FORMATION_POSITIONS[formationName] || FORMATION_POSITIONS[DEFAULT_FORMATION];
  return {
    formation: formationName,
    slots: positions.map(label => ({
      label,
      open: true,
      takenBy: null
    }))
  };
}

function createInitialBoardState(clubs) {
  const obj = {};
  clubs.forEach(c => {
    obj[c.key] = createBoardFromFormation(DEFAULT_FORMATION);
  });
  return obj;
}

// guildId -> { clubs, boardState, currentClubKey, adminPanelChannelId, adminPanelMessageId, vcPanels }
const guildStates = new Map();

function getGuildState(guildId) {
  if (!guildStates.has(guildId)) {
    const clubs = cloneDefaultClubs();
    guildStates.set(guildId, {
      clubs,
      boardState: createInitialBoardState(clubs),
      currentClubKey: "club1",
      adminPanelChannelId: null,
      adminPanelMessageId: null,
      vcPanels: {} // vcId -> { clubKey, textChannelId, messageId }
    });
  }
  return guildStates.get(guildId);
}

function getClubByKey(clubs, key) {
  return clubs.find(c => c.key === key);
}

function isManager(member) {
  if (!member) return false;

  // admin-level permission
  if (member.permissions?.has(PermissionsBitField.Flags.ManageGuild)) return true;

  // role check
  if (!member.roles?.cache) return false;
  const keywords = ["captain", "manager", "owner", "media"];
  return member.roles.cache.some(r =>
    keywords.some(k => r.name.toLowerCase().includes(k))
  );
}

// Locates VC panel object by message ID
function getVcPanelByMessage(state, messageId) {
  for (const [vcId, panel] of Object.entries(state.vcPanels)) {
    if (panel.messageId === messageId) return { vcId, panel };
  }
  return null;
}

// ============================================
// index.js — PART 2/4
// ============================================


// ============================================
// BUTTON LAYOUT ENGINE
// 3 positions per row max (visual clarity)
// Names appear ABOVE their buttons
// GK always bottom alone
// ============================================

function buildButtonGrid(clubBoard, clubKey) {
  const slots = [...clubBoard.slots];

  // 🟦 Always keep GK last visually
  // GK is index 0 in data, so reverse entire array EXCEPT keep GK last
  const gk = slots[0];
  const outfield = slots.slice(1).reverse();
  const ordered = [...outfield, gk];

  // Build rows of max 3 positions
  const rows = [];
  let rowSlots = [];

  for (let i = 0; i < ordered.length; i++) {
    rowSlots.push({ slot: ordered[i], index: ordered[i] === gk ? 0 : (clubBoard.slots.length - 1 - i) });

    if (rowSlots.length === 3 || i === ordered.length - 2) {
      // Last row BEFORE GK has 2 or 3
      rows.push(rowSlots);
      rowSlots = [];
    }
  }

  // Add GK row alone
  rows.push([{ slot: gk, index: 0 }]);

  // Build ActionRowBuilders
  const actionRows = [];

  for (const row of rows) {
    // First row: NAMES
    const nameRow = new ActionRowBuilder();
    for (const r of row) {
      const label = r.slot.label;
      const taken = r.slot.open ? "OPEN" : `<@${r.slot.takenBy}>`;
      const txt = taken.length > 80 ? taken.slice(0, 77) + "..." : taken;

      const nameBtn = new ButtonBuilder()
        .setCustomId(`name_display_${clubKey}_${r.index}_${Date.now()}`) // dummy id (won't be pressed)
        .setLabel(txt)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true);

      nameRow.addComponents(nameBtn);
    }
    actionRows.push(nameRow);

    // Second row: BUTTONS
    const posRow = new ActionRowBuilder();
    for (const r of row) {
      const b = new ButtonBuilder()
        .setCustomId(`pos_${clubKey}_${r.index}`)
        .setLabel(r.slot.label)
        .setStyle(r.slot.open ? ButtonStyle.Success : ButtonStyle.Danger);

      posRow.addComponents(b);
    }
    actionRows.push(posRow);
  }

  return actionRows;
}


// ============================================
// EMBED BUILDER
// ============================================

function buildEmbedForClub(guildId, clubKey) {
  const state = getGuildState(guildId);
  const { clubs, boardState } = state;
  const club = getClubByKey(clubs, clubKey);
  const board = boardState[clubKey];

  const lines = [];
  const slots = [...board.slots];
  const gk = slots[0];
  const outfield = slots.slice(1).reverse();
  const ordered = [...outfield, gk];

  for (const s of ordered) {
    const status = s.open ? "🟢 OPEN" : `🔴 <@${s.takenBy}>`;
    lines.push(`${s.label}: ${status}`);
  }

  return new EmbedBuilder()
    .setTitle(`${club.name} — ${board.formation}`)
    .setDescription(lines.join("\n"))
    .setColor(0x3498db);
}


// ============================================
// SELECT MENU: CLUB SELECTOR
// ============================================

function buildClubSelect(guildId, currentClubKey) {
  const state = getGuildState(guildId);
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("club_select")
      .setPlaceholder("Select Club")
      .addOptions(
        state.clubs
          .filter(c => c.enabled)
          .map(c => ({
            label: c.name,
            value: c.key,
            default: c.key === currentClubKey
          }))
      )
  );
}


// ============================================
// SELECT MENU: VIEWER MODE
// ============================================

function buildViewerClubSelect(guildId, selectedKey) {
  const state = getGuildState(guildId);
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("viewer_club_select")
      .setPlaceholder("Choose Club")
      .addOptions(
        state.clubs.filter(c => c.enabled).map(c => ({
          label: c.name,
          value: c.key,
          default: c.key === selectedKey
        }))
      )
  );
}


// ============================================
// ADMIN PANEL CONTROLS
// ============================================

function buildAdminControls(clubKey) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`rename_club_${clubKey}`)
      .setLabel("Rename")
      .setStyle(ButtonStyle.Primary),

    new ButtonBuilder()
      .setCustomId("add_club")
      .setLabel("Add Club")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`remove_club_${clubKey}`)
      .setLabel("Remove")
      .setStyle(ButtonStyle.Danger),

    new ButtonBuilder()
      .setCustomId(`player_tools_${clubKey}`)
      .setLabel("Player Tools")
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(`formation_menu_${clubKey}`)
      .setLabel("Formation")
      .setStyle(ButtonStyle.Secondary)
  );
}


// ============================================
// FULL ADMIN COMPONENT SET
// ============================================

function buildAdminComponents(guildId, clubKey) {
  const clubRow = buildClubSelect(guildId, clubKey);
  const controls = buildAdminControls(clubKey);
  const grid = buildButtonGrid(getGuildState(guildId).boardState[clubKey], clubKey);

  return [clubRow, controls, ...grid];
}


// ============================================
// PANEL REFRESH SYSTEM (Admin + VC Panels)
// ============================================

async function refreshClubPanels(guildId, clubKey) {
  const state = getGuildState(guildId);

  // ADMIN PANEL
  if (state.adminPanelChannelId && state.adminPanelMessageId) {
    try {
      const ch = await client.channels.fetch(state.adminPanelChannelId);
      const msg = await ch.messages.fetch(state.adminPanelMessageId);
      await msg.edit({
        embeds: [buildEmbedForClub(guildId, clubKey)],
        components: buildAdminComponents(guildId, clubKey)
      });
    } catch (e) {
      console.error("⚠️ Failed to update admin panel:", e);
    }
  }

  // VC PANELS
  for (const [vcId, panel] of Object.entries(state.vcPanels)) {
    if (panel.clubKey !== clubKey) continue;

    try {
      const ch = await client.channels.fetch(panel.textChannelId);
      const msg = await ch.messages.fetch(panel.messageId);

      await msg.edit({
        embeds: [buildEmbedForClub(guildId, clubKey)],
        components: buildAdminComponents(guildId, clubKey)
      });
    } catch (e) {
      console.error(`⚠️ Failed to update VC panel for VC ${vcId}:`, e);
    }
  }
}


// ============================================
// HELPERS
// ============================================

function resetClubSpots(boardState, clubKey) {
  boardState[clubKey].slots.forEach(s => {
    s.open = true;
    s.takenBy = null;
  });
}

// ============================================
// index.js — PART 3/4
// ============================================


// ============================================
// BUILD GROUPED FORMATION SELECT MENU
// ============================================

function buildFormationCategorySelect(clubKey) {
  const row = new ActionRowBuilder();
  const select = new StringSelectMenuBuilder()
    .setCustomId(`formation_category_${clubKey}`)
    .setPlaceholder("Choose formation category");

  Object.keys(FORMATION_CATEGORIES).forEach(cat => {
    select.addOptions({
      label: cat,
      value: cat
    });
  });

  row.addComponents(select);
  return row;
}

function buildFormationSelectMenu(clubKey, category) {
  const row = new ActionRowBuilder();
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`formation_select_${clubKey}`)
    .setPlaceholder("Select formation");

  const formations = FORMATION_CATEGORIES[category] || [];
  formations.forEach(f => {
    menu.addOptions({
      label: f,
      value: f
    });
  });

  row.addComponents(menu);
  return row;
}


// ============================================
// SLASH COMMAND: /spotpanel
// ============================================

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const guildId = interaction.guildId;
  const state = getGuildState(guildId);

  // Only managers/admins can create spot panel
  if (interaction.commandName === "spotpanel") {
    if (!isManager(interaction.member)) {
      return interaction.reply({
        content: "You do not have permission to create spot panels.",
        ephemeral: true
      });
    }

    const clubKey = state.currentClubKey;

    const msg = await interaction.reply({
      content: "Admin Spot Panel",
      embeds: [buildEmbedForClub(guildId, clubKey)],
      components: buildAdminComponents(guildId, clubKey),
      fetchReply: true
    });

    state.adminPanelChannelId = interaction.channelId;
    state.adminPanelMessageId = msg.id;

    return;
  }


  // ============================================
  // SLASH COMMAND: /spots (viewer mode)
  // ============================================

  if (interaction.commandName === "spots") {
    const clubKey = state.currentClubKey;

    return interaction.reply({
      embeds: [buildEmbedForClub(guildId, clubKey)],
      components: [
        buildViewerClubSelect(guildId, clubKey),
        ...buildButtonGrid(state.boardState[clubKey], clubKey)
      ]
    });
  }


  // ============================================
  // SLASH COMMAND: /vcspots
  // ============================================

  if (interaction.commandName === "vcspots") {
    if (!interaction.member.voice?.channelId) {
      return interaction.reply({
        content: "Join a voice channel first.",
        ephemeral: true
      });
    }

    const vcId = interaction.member.voice.channelId;
    const clubKey = state.currentClubKey;

    const msg = await interaction.reply({
      content: `VC Spot Panel (Linked to VC <#${vcId}>)`,
      embeds: [buildEmbedForClub(guildId, clubKey)],
      components: buildAdminComponents(guildId, clubKey),
      fetchReply: true
    });

    state.vcPanels[vcId] = {
      clubKey,
      textChannelId: interaction.channelId,
      messageId: msg.id
    };

    return;
  }
});


// ============================================
// BUTTON + SELECT HANDLING
// ============================================

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

  const guildId = interaction.guildId;
  const state = getGuildState(guildId);

  // Which panel is this interaction targeting?
  const isAdminPanel =
    state.adminPanelChannelId === interaction.channelId &&
    state.adminPanelMessageId === interaction.message.id;

  const vcInfo = getVcPanelByMessage(state, interaction.message.id);
  const isVcPanel = vcInfo !== null;

  // Determine club key
  let clubKey = null;
  if (isAdminPanel) clubKey = state.currentClubKey;
  if (isVcPanel) clubKey = vcInfo.panel.clubKey;

  if (!clubKey) return; // unrecognized panel


  // ============================================
  // CLUB SELECT (ADMIN)
  // ============================================

  if (interaction.customId === "club_select") {
    const newKey = interaction.values[0];
    state.currentClubKey = newKey;

    await interaction.update({
      embeds: [buildEmbedForClub(guildId, newKey)],
      components: buildAdminComponents(guildId, newKey)
    });

    return;
  }


  // ============================================
  // VIEWER CLUB SELECT
  // ============================================

  if (interaction.customId === "viewer_club_select") {
    const key = interaction.values[0];
    return interaction.update({
      embeds: [buildEmbedForClub(guildId, key)],
      components: [
        buildViewerClubSelect(guildId, key),
        ...buildButtonGrid(state.boardState[key], key)
      ]
    });
  }


  // ============================================
  // FORMATION MENU: STEP 1 (select category)
  // ============================================

  if (interaction.customId.startsWith("formation_menu_")) {
    const ck = interaction.customId.split("_")[2];
    if (!isManager(interaction.member)) {
      return interaction.reply({
        content: "Only managers/admins can change formation.",
        ephemeral: true
      });
    }

    return interaction.reply({
      content: "Choose a formation category:",
      components: [buildFormationCategorySelect(ck)],
      ephemeral: true
    });
  }

  if (interaction.customId.startsWith("formation_category_")) {
    const ck = interaction.customId.split("_")[2];
    const cat = interaction.values[0];

    return interaction.update({
      content: `Category: **${cat}** — now choose a formation`,
      components: [buildFormationSelectMenu(ck, cat)],
      ephemeral: true
    });
  }


  // ============================================
  // FORMATION MENU: STEP 2 (choose formation)
  // ============================================

  if (interaction.customId.startsWith("formation_select_")) {
    const ck = interaction.customId.split("_")[2];
    const newFormation = interaction.values[0];

    // Reset board with new formation
    state.boardState[ck] = createBoardFromFormation(newFormation);

    // Refresh all panels
    await refreshClubPanels(guildId, ck);

    return interaction.update({
      content: `Formation updated to **${newFormation}**.`,
      components: [],
      ephemeral: true
    });
  }


  // ============================================
  // PLAYER SPOT BUTTONS
  // ============================================

  if (interaction.customId.startsWith("pos_")) {
    const parts = interaction.customId.split("_");
    const ck = parts[1];
    const idx = parseInt(parts[2], 10);
    const board = state.boardState[ck];
    const slot = board.slots[idx];

    // If open: claim it
    if (slot.open) {
      slot.open = false;
      slot.takenBy = interaction.user.id;
    } else {
      // If taken by THIS PLAYER → unclaim
      if (slot.takenBy === interaction.user.id) {
        slot.open = true;
        slot.takenBy = null;
      } else {
        // taken by another player
        return interaction.reply({
          content: "This spot is already taken.",
          ephemeral: true
        });
      }
    }

    await refreshClubPanels(guildId, ck);

    return interaction.deferUpdate();
  }


  // ============================================
  // ADMIN CONTROLS
  // ============================================

  // Rename club
  if (interaction.customId.startsWith("rename_club_")) {
    const ck = interaction.customId.split("_")[2];
    const club = getClubByKey(state.clubs, ck);

    const modal = new ModalBuilder()
      .setCustomId(`rename_club_modal_${ck}`)
      .setTitle("Rename Club");

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("newName")
          .setLabel("New Club Name")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );

    return interaction.showModal(modal);
  }

  // Remove club
  if (interaction.customId.startsWith("remove_club_")) {
    const ck = interaction.customId.split("_")[2];
    const club = getClubByKey(state.clubs, ck);

    if (!isManager(interaction.member)) {
      return interaction.reply({
        content: "Only managers/admins can remove clubs.",
        ephemeral: true
      });
    }

    club.enabled = false;
    await refreshClubPanels(guildId, ck);

    return interaction.reply({
      content: `${club.name} disabled.`,
      ephemeral: true
    });
  }

  // Add club
  if (interaction.customId === "add_club") {
    const disabled = state.clubs.find(c => !c.enabled);
    if (!disabled) {
      return interaction.reply({
        content: "All 5 clubs already enabled.",
        ephemeral: true
      });
    }

    disabled.enabled = true;
    await refreshClubPanels(guildId, state.currentClubKey);

    return interaction.reply({
      content: `${disabled.name} enabled.`,
      ephemeral: true
    });
  }
});


// ============================================
// MODAL SUBMISSION: RENAMING CLUB
// ============================================

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isModalSubmit()) return;

  const guildId = interaction.guildId;
  const state = getGuildState(guildId);

  if (interaction.customId.startsWith("rename_club_modal_")) {
    const ck = interaction.customId.split("_")[3];
    const club = getClubByKey(state.clubs, ck);

    const newName = interaction.fields.getTextInputValue("newName");
    club.name = newName;

    await refreshClubPanels(guildId, ck);

    return interaction.reply({
      content: `Club renamed to **${newName}**.`,
      ephemeral: true
    });
  }
});
// ============================================
// index.js — PART 4/4
// ============================================


// ============================================
// AUTO-REMOVE PLAYERS WHEN THEY LEAVE VC
// ============================================

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    const guild = oldState.guild;
    if (!guild) return;

    const guildId = guild.id;
    const state = getGuildState(guildId);

    // Only care when user LEAVES voice entirely
    if (!oldState.channelId) return;
    if (newState.channelId) return; // they moved — don't clear

    const userId = oldState.id;
    const touched = new Set();

    // Clear from ALL clubs
    for (const clubKey of Object.keys(state.boardState)) {
      const board = state.boardState[clubKey];
      let changed = false;

      for (const slot of board.slots) {
        if (slot.takenBy === userId) {
          slot.takenBy = null;
          slot.open = true;
          changed = true;
        }
      }

      if (changed) touched.add(clubKey);
    }

    // Update all panels for clubs affected
    for (const ck of touched) {
      await refreshClubPanels(guildId, ck);
    }
  } catch (err) {
    console.error("❌ VoiceStateUpdate error:", err);
  }
});



// ============================================
// REFRESH PANEL FUNCTION (GLOBAL + VC PANELS)
// ============================================

async function refreshClubPanels(guildId, clubKey) {
  try {
    const state = getGuildState(guildId);
    if (!state) return;

    const embed = buildEmbedForClub(guildId, clubKey);
    const components = buildAdminComponents(guildId, clubKey);

    // ===== Global Admin Panel =====
    if (
      state.adminPanelChannelId &&
      state.adminPanelMessageId &&
      state.currentClubKey === clubKey
    ) {
      try {
        const chan = await client.channels.fetch(state.adminPanelChannelId);
        const msg = await chan.messages.fetch(state.adminPanelMessageId);

        await msg.edit({
          embeds: [embed],
          components
        });
      } catch (err) {
        console.error("⚠️ Failed to update global admin panel:", err);
      }
    }

    // ===== VC PANELS =====
    for (const [vcId, panel] of Object.entries(state.vcPanels)) {
      if (!panel) continue;
      if (panel.clubKey !== clubKey) continue;

      try {
        const chan = await client.channels.fetch(panel.textChannelId);
        const msg = await chan.messages.fetch(panel.messageId);

        await msg.edit({
          embeds: [embed],
          components
        });
      } catch (err) {
        console.error(`⚠️ Failed to update VC panel for VC ${vcId}:`, err);
      }
    }
  } catch (err) {
    console.error("❌ Error refreshing club panels:", err);
  }
}



// ============================================
// HARDEN — Prevent unhandled promise rejections
// ============================================

process.on("unhandledRejection", err => {
  console.error("🚨 Unhandled Rejection:", err);
});

process.on("uncaughtException", err => {
  console.error("🚨 Uncaught Exception:", err);
});



// ============================================
// LOGIN
// ============================================

client.login(process.env.BOT_TOKEN);
console.log("🔌 SpotBot is starting…");

