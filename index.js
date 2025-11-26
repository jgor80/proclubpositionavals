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
  TextInputStyle,
  MessageFlags
} = require("discord.js");

// Get token from environment variable only
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("❌ BOT_TOKEN env var not set");
  process.exit(1);
}

// We need Guilds + GuildVoiceStates for VC-aware spot claiming
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates]
});

/**
 * Dynamic formations: each club can pick one, and we build slots from this.
 * Each array is 11 positions in order (index 0 = GK).
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

// Row layout for each formation: arrays of slot indices (into FORMATION_POSITIONS)
// From back to front: [GK row], [defence row], [mid rows...], [attack rows...]
const FORMATION_VISUAL_ROWS = {
  "3-1-4-2": [
    [0],
    [1,2,3],
    [4],
    [5,6,7,8],
    [9,10]
  ],
  "3-4-1-2": [
    [0],
    [1,2,3],
    [4,5,6,7],
    [8],
    [9,10]
  ],
  "3-4-2-1": [
    [0],
    [1,2,3],
    [4,5,6,7],
    [8,9],
    [10]
  ],
  "3-4-3": [
    [0],
    [1,2,3],
    [4,5,6,7],
    [8,9,10]
  ],
  "3-5-2": [
    [0],
    [1,2,3],
    [4,5,6,7,8],
    [9,10]
  ],

  "4-1-2-1-2": [
    [0],
    [1,2,3,4],
    [5],
    [6,8,7],
    [9,10]
  ],
  "4-1-2-1-2 (2)": [
    [0],
    [1,2,3,4],
    [5],
    [6,7],
    [8],
    [9,10]
  ],
  "4-1-3-2": [
    [0],
    [1,2,3,4],
    [5],
    [6,7,8],
    [9,10]
  ],
  "4-1-4-1": [
    [0],
    [1,2,3,4],
    [5],
    [6,7,8,9],
    [10]
  ],

  "4-2-1-3": [
    [0],
    [1,2,3,4],
    [5,6],
    [7],
    [8,9,10]
  ],
  "4-2-2-2": [
    [0],
    [1,2,3,4],
    [5,6],
    [7,8],
    [9,10]
  ],
  "4-2-3-1": [
    [0],
    [1,2,3,4],
    [5,6],
    [7,8,9],
    [10]
  ],
  "4-2-3-1 (2)": [
    [0],
    [1,2,3,4],
    [5,6],
    [7,8,9],
    [10]
  ],
  "4-2-4": [
    [0],
    [1,2,3,4],
    [5,6],
    [7,8,9,10]
  ],

  "4-3-1-2": [
    [0],
    [1,2,3,4],
    [5,6,7],
    [8],
    [9,10]
  ],
  "4-3-2-1": [
    [0],
    [1,2,3,4],
    [5,6,7],
    [8,9],
    [10]
  ],
  "4-3-3": [
    [0],
    [1,2,3,4],
    [5,6,7],
    [8,9,10]
  ],
  "4-3-3 (2)": [
    [0],
    [1,2,3,4],
    [5,6,7],
    [8,9,10]
  ],
  "4-3-3 (3)": [
    [0],
    [1,2,3,4],
    [5,6,7],
    [8,9,10]
  ],
  "4-3-3 (4)": [
    [0],
    [1,2,3,4],
    [5,6,7],
    [8,9,10]
  ],

  "4-4-1-1 (2)": [
    [0],
    [1,2,3,4],
    [5,6,7,8],
    [9],
    [10]
  ],
  "4-4-2": [
    [0],
    [1,2,3,4],
    [5,6,7,8],
    [9,10]
  ],
  "4-4-2 (2)": [
    [0],
    [1,2,3,4],
    [5,6,7,8],
    [9,10]
  ],
  "4-5-1": [
    [0],
    [1,2,3,4],
    [5,6,8,9],
    [7],
    [10]
  ],
  "4-5-1 (2)": [
    [0],
    [1,2,3,4],
    [5,6,8,9],
    [7],
    [10]
  ],

  "5-2-1-2": [
    [0],
    [1,2,3,4,5],
    [6,7],
    [8],
    [9,10]
  ],
  "5-2-3": [
    [0],
    [1,2,3,4,5],
    [6,7],
    [8,9,10]
  ],
  "5-3-2": [
    [0],
    [1,2,3,4,5],
    [6,7,8],
    [9,10]
  ],
  "5-4-1": [
    [0],
    [1,2,3,4,5],
    [6,7,8,9],
    [10]
  ]
};

/**
 * Short notes for each formation: strengths, weaknesses, best use.
 */
const FORMATION_INFO = {
  "3-1-4-2": "Big central block + 2 STs. Great for press/combos; needs fast CBs and a disciplined CDM.",
  "3-4-1-2": "CAM links two STs. Good for possession; wide areas exposed if LM/RM don’t track.",
  "3-4-2-1": "Dual CAMs behind ST. Very creative but lone ST must hold the ball well.",
  "3-4-3": "Front 3 stretch the pitch; huge counter threat. Space behind wide CBs/LM/RM.",
  "3-5-2": "Classic all-rounder. Packed midfield and 2 STs; relies on hard-working wide mids.",

  "4-1-2-1-2": "Diamond midfield for quick 1-2s. Width mostly from fullbacks; CDM must shield well.",
  "4-1-3-2": "CDM anchor with 3 mids + 2 STs. Direct and aggressive; CM must work defensively.",
  "4-1-4-1": "Very solid block. Great for compact defence; lone ST can get isolated.",
  "4-2-1-3": "Double pivot protects defence; CAM + wide forwards attack. Build-up can be slow.",
  "4-2-2-2": "Two CDMs + two CAMs. Strong central triangles; width comes mainly from fullbacks.",
  "4-2-3-1": "Meta-style balance. Safe in defence with good attacking shape; lone ST needs support.",
  "4-2-4": "Ultra-attacking. Great for late comebacks, but midfield is wide open on counters.",

  "4-3-1-2": "3 CMs + CAM feeding 2 STs. Strong through the middle; flanks rely on fullbacks.",
  "4-3-2-1": "‘Christmas tree’ with CFs in half-spaces. Very good between lines, weaker on wings.",
  "4-3-3": "Modern balanced shape. Natural width; can be outnumbered by heavy midfields.",
  "4-3-3 (2)": "CDM + 2 CMs. Extra cover in front of defence with decent build-up options.",
  "4-3-3 (3)": "Double pivot tilt; strong defensively, CM must link play.",
  "4-3-3 (4)": "More attacking with extra CAMs; great for chance creation.",

  "4-4-1-1 (2)": "Flat 4 mid + CF under ST. Good balance; wingers must work both ways.",
  "4-4-2": "Simple, aggressive, very effective. Great for pressing; CMs need to handle overloads.",
  "4-4-2 (2)": "More defensive 4-4-2 with CDMs. Hard to break; less creativity from deep.",
  "4-5-1": "Packed midfield to control centre. Lone ST and wide mids must carry the attack.",
  "4-5-1 (2)": "Double pivot 4-5-1. Very safe but fewer forward runs from midfield.",

  "5-2-1-2": "Back 5 + CAM + 2 STs. Strong defensively and good on the break; wingbacks key.",
  "5-2-3": "Back 5 with front 3. Great for deep block + counters; midfield can be bypassed.",
  "5-3-2": "Rock-solid with 3 CMs and 2 STs. Width depends on wingbacks pushing high.",
  "5-4-1": "Maximum defensive security. Hard to break but very limited numbers in attack."
};

// Subset of formations to show in the formation select menu (Discord limit 25 options).
const FORMATION_MENU_ORDER = [
  "3-1-4-2",
  "3-4-1-2",
  "3-4-2-1",
  "3-4-3",
  "3-5-2",
  "4-1-2-1-2",
  "4-1-3-2",
  "4-1-4-1",
  "4-2-1-3",
  "4-2-2-2",
  "4-2-3-1",
  "4-2-4",
  "4-3-1-2",
  "4-3-2-1",
  "4-3-3",
  "4-3-3 (2)",
  "4-4-1-1 (2)",
  "4-4-2",
  "4-4-2 (2)",
  "4-5-1",
  "4-5-1 (2)",
  "5-2-1-2",
  "5-2-3",
  "5-3-2",
  "5-4-1"
];

const DEFAULT_FORMATION = "4-3-3";

// Default club slots per guild; names are editable from the panel
// Max clubs = 5
const DEFAULT_CLUBS = [
  { key: "club1", name: "Club 1", enabled: true },
  { key: "club2", name: "Club 2", enabled: false },
  { key: "club3", name: "Club 3", enabled: false },
  { key: "club4", name: "Club 4", enabled: false },
  { key: "club5", name: "Club 5", enabled: false }
];

// Slash commands (reused for every guild)
const COMMANDS = [
  {
    name: "spotpanel",
    description: "Create the global control panel for club spots."
  },
  {
    name: "spots",
    description: "Show a read-only board with club dropdown."
  },
  {
    name: "vcspots",
    description:
      "Create/update a live club spot panel linked to your current voice channel."
  }
];

// ---------- PER-GUILD STATE HELPERS ----------

function cloneDefaultClubs() {
  return DEFAULT_CLUBS.map((c) => ({ ...c }));
}

function createEmptyBoardForFormation(formationName) {
  const positions =
    FORMATION_POSITIONS[formationName] || FORMATION_POSITIONS[DEFAULT_FORMATION];
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
      currentClubKey: "club1",
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

  const managerKeywords = ["captain", "manager", "owner", "media"];
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
  if (!state) throw new Error("No state for guild");

  const { clubs, boardState } = state;
  const club = getClubByKey(clubs, clubKey);
  if (!club) throw new Error("Unknown club key: " + clubKey);

  const clubBoard = boardState[clubKey];
  if (!clubBoard) throw new Error("No board state for club key: " + clubKey);

  // Compact description; formation is represented by button layout
  const description =
    "**Club:** " + club.name +
    "\n**Formation:** " + clubBoard.formation +
    "\n\nUse the buttons below to claim your spot.";

  const embed = new EmbedBuilder()
    .setTitle("Club Spots")
    .setDescription(description)
    .setFooter({
      text:
        "Players: click a spot to claim. Managers can assign/move/remove players and change formations."
    });

  const info = FORMATION_INFO[clubBoard.formation];
  if (info) {
    const trimmed = info.length > 1024 ? info.slice(0, 1021) + "..." : info;
    embed.addFields({
      name: "Formation notes",
      value: trimmed
    });
  }

  return embed;
}

// Buttons for a specific club, arranged in formation order.
// We flatten the formation rows (attack → mid → defence → GK) into a 1D sequence,
// then pack into rows of up to 5 buttons (Discord limit). GK ends up on the bottom row.
function buildButtons(guildId, clubKey) {
  const state = getGuildState(guildId);
  const { boardState } = state;
  const clubBoard = boardState[clubKey];
  const slots = clubBoard.slots;

  const layout = FORMATION_VISUAL_ROWS[clubBoard.formation];

  let orderedIndices = [];
  if (layout) {
    // layout is [GK row, DEF row, MID rows..., ATT row]
    // We want attack at top, GK at bottom → reverse, then flatten.
    const rowsTopToBottom = [...layout].reverse();
    orderedIndices = rowsTopToBottom.flat();
  } else {
    // Fallback: natural order, but still GK last by moving index 0 to end
    orderedIndices = [...slots.keys()];
    if (orderedIndices.length > 0) {
      const gk = orderedIndices.shift();
      orderedIndices.push(gk);
    }
  }

  const rows = [];
  let currentRow = new ActionRowBuilder();

  orderedIndices.forEach((slotIndex) => {
    const slot = slots[slotIndex];

    const button = new ButtonBuilder()
      // customId: pos_<clubKey>_<slotIndex>
      .setCustomId("pos_" + clubKey + "_" + slotIndex)
      .setLabel(slot.label)
      .setStyle(slot.open ? ButtonStyle.Success : ButtonStyle.Danger);

    currentRow.addComponents(button);

    if (currentRow.components.length === 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
  });

  if (currentRow.components.length > 0) {
    rows.push(currentRow);
  }

  return rows;
}

// Club select used on the admin/global panels
function buildClubSelect(guildId, currentClubKey) {
  const state = getGuildState(guildId);
  const { clubs } = state;

  const enabledClubs = clubs.filter((club) => club.enabled);
  const select = new StringSelectMenuBuilder()
    .setCustomId("club_select")
    .setPlaceholder("Select club")
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
    .setCustomId("viewer_club_select")
    .setPlaceholder("Select club")
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
      .setCustomId("rename_club_" + clubKey)
      .setLabel("Rename Club")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("add_club")
      .setLabel("Add Club")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("remove_club_" + clubKey)
      .setLabel("Remove Club")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("player_tools_" + clubKey)
      .setLabel("Player Tools")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("formation_menu_" + clubKey)
      .setLabel("Formation")
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
      console.error("⚠️ Failed to update admin panel after state change:", err);
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
          "⚠️ Failed to update VC panel for voice channel " + vcId + " after state change:",
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
  console.log("✅ Logged in as " + c.user.tag);
  console.log("✅ App ID: " + c.application.id);

  try {
    // Global commands (for all servers)
    await c.application.commands.set(COMMANDS);
    console.log("✅ Global commands registered for all servers");

    // Also explicitly register per existing guild (helps them appear faster)
    for (const guild of c.guilds.cache.values()) {
      try {
        await c.application.commands.set(COMMANDS, guild.id);
        console.log("✅ Commands registered in guild " + guild.name + " (" + guild.id + ")");
      } catch (err) {
        console.error("⚠️ Failed to register commands in guild", guild.id, err);
      }
    }
  } catch (err) {
    console.error("❌ Failed to register commands:", err);
  }
});

// When the bot joins a new server later, register there too
client.on(Events.GuildCreate, async (guild) => {
  try {
    if (!client.application?.commands) return;
    await client.application.commands.set(COMMANDS, guild.id);
    console.log(
      "✅ Commands registered in newly joined guild " + guild.name + " (" + guild.id + ")"
    );
  } catch (err) {
    console.error("⚠️ Failed to register commands in new guild", guild.id, err);
  }
});

// ---------- INTERACTIONS ----------

// Helper: start "Assign from VC" flow (manager-only)
async function startAssignFromVc(interaction, state, clubKey) {
  if (!isManager(interaction.member)) {
    return interaction.reply({
      content:
        "Only captains, managers, owners, media, or admins can assign or move players.",
      flags: MessageFlags.Ephemeral
    });
  }

  const { clubs, boardState } = state;
  const clubsBtn = clubs;
  const boardStateBtn = boardState;

  const club = getClubByKey(clubsBtn, clubKey);
  if (!club) {
    return interaction.reply({
      content: "Unknown club in assignment request.",
      flags: MessageFlags.Ephemeral
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
        content: "The voice channel linked to this panel no longer exists.",
        flags: MessageFlags.Ephemeral
      });
    }

    if (interaction.member?.voice?.channelId !== vcId) {
      return interaction.reply({
        content: "You must be in **" + voiceChannel.name + "** to assign players for this panel.",
        flags: MessageFlags.Ephemeral
      });
    }
  } else {
    // Global panel: allow any VC, but must be in one
    voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({
        content:
          "You must be in a voice channel with the players you want to assign.",
        flags: MessageFlags.Ephemeral
      });
    }
  }

  const members = [...voiceChannel.members.values()].filter((m) => !m.user.bot);
  if (members.length === 0) {
    return interaction.reply({
      content: "No non-bot players found in your voice channel to assign.",
      flags: MessageFlags.Ephemeral
    });
  }

  const options = members.map((m) => ({
    label: m.displayName || m.user.username,
    value: m.id
  }));

  const select = new StringSelectMenuBuilder()
    .setCustomId("assign_player_pick_" + clubKey)
    .setPlaceholder("Pick a player")
    .addOptions(options.slice(0, 25));

  const row = new ActionRowBuilder().addComponents(select);

  return interaction.reply({
    content: "Pick a player to assign in **" + club.name + "**:",
    components: [row],
    flags: MessageFlags.Ephemeral
  });
}

// Helper: start "Manage existing players" flow (manager-only)
async function startManagePlayers(interaction, state, clubKey) {
  if (!isManager(interaction.member)) {
    return interaction.reply({
      content:
        "Only captains, managers, owners, media, or admins can remove or move players.",
      flags: MessageFlags.Ephemeral
    });
  }

  const { clubs, boardState } = state;
  const clubsBtn = clubs;
  const boardStateBtn = boardState;

  const clubBoard = boardStateBtn[clubKey];
  if (!clubBoard) {
    return interaction.reply({
      content: "Club not found.",
      flags: MessageFlags.Ephemeral
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
      description: "Currently in at least one spot"
    });
  }

  if (options.length === 0) {
    return interaction.reply({
      content: "There are no players to manage for this club.",
      flags: MessageFlags.Ephemeral
    });
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId("manage_player_pick_" + clubKey)
    .setPlaceholder("Select a player to remove/move")
    .addOptions(options.slice(0, 25));

  const row = new ActionRowBuilder().addComponents(select);
  const club = getClubByKey(clubsBtn, clubKey);

  return interaction.reply({
    content: "Pick a player in **" + (club ? club.name : clubKey) + "** to remove or move:",
    components: [row],
    flags: MessageFlags.Ephemeral
  });
}

// Helper: reset all spots (manager-only)
async function doResetSpots(interaction, state, guildId, clubKey) {
  if (!isManager(interaction.member)) {
    return interaction.reply({
      content:
        "Only captains, managers, owners, media, or admins can reset spots.",
      flags: MessageFlags.Ephemeral
    });
  }

  resetClubSpots(state.boardState, clubKey);
  await refreshClubPanels(guildId, clubKey);

  return interaction.reply({
    content: "All spots set to 🟢 OPEN for this club.",
    flags: MessageFlags.Ephemeral
  });
}

// Helper: set formation and rebuild slots (manager-only)
async function setClubFormation(interaction, guildId, clubKey, formationName) {
  if (!isManager(interaction.member)) {
    return interaction.reply({
      content:
        "Only captains, managers, owners, media, or admins can change formations.",
      flags: MessageFlags.Ephemeral
    });
  }

  const state = getGuildState(guildId);
  if (!state) {
    return interaction.reply({
      content: "Guild state not found.",
      flags: MessageFlags.Ephemeral
    });
  }

  const positions = FORMATION_POSITIONS[formationName];
  if (!positions) {
    return interaction.reply({
      content: "Unknown formation.",
      flags: MessageFlags.Ephemeral
    });
  }

  state.boardState[clubKey] = createEmptyBoardForFormation(formationName);
  await refreshClubPanels(guildId, clubKey);

  return interaction.update({
    content: "Formation for this club is now **" + formationName + "**. All spots have been reset.",
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
      if (cmd === "spotpanel") {
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
      if (cmd === "spots") {
        let key = state.currentClubKey;
        const currentClub = getClubByKey(clubs, key);
        if (!currentClub || !currentClub.enabled) {
          const firstEnabled = clubs.find((c) => c.enabled) || clubs[0];
          key = firstEnabled ? firstEnabled.key : state.currentClubKey;
        }

        return interaction.reply({
          embeds: [buildEmbedForClub(guildId, key)],
          components: [buildViewerClubSelect(guildId, key)]
        });
      }

      // VC-linked live panel
      if (cmd === "vcspots") {
        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
          return interaction.reply({
            content: "You must be in a voice channel to use `/vcspots`.",
            flags: MessageFlags.Ephemeral
          });
        }

        const enabledClubs = clubs.filter((c) => c.enabled);
        if (enabledClubs.length === 0) {
          return interaction.reply({
            content:
              "No enabled clubs are available. Use `/spotpanel` to add or enable clubs first.",
            flags: MessageFlags.Ephemeral
          });
        }

        const select = new StringSelectMenuBuilder()
          .setCustomId("vcspots_pickclub_" + voiceChannel.id)
          .setPlaceholder("Select club for this voice channel")
          .addOptions(
            enabledClubs.map((club) => ({
              label: club.name,
              value: club.key
            }))
          );

        const row = new ActionRowBuilder().addComponents(select);

        return interaction.reply({
          content:
            "Pick which club is playing in **" +
            voiceChannel.name +
            "**. I’ll post/update the live panel in this chat.",
          components: [row],
          flags: MessageFlags.Ephemeral
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
      if (id.startsWith("rename_club_")) {
        const clubKey = id.substring("rename_club_".length);
        const currentClub = getClubByKey(clubsBtn, clubKey);
        if (!currentClub) {
          return interaction.reply({
            content: "Current club not found.",
            flags: MessageFlags.Ephemeral
          });
        }

        const modal = new ModalBuilder()
          .setCustomId("rename_club_modal_" + clubKey)
          .setTitle("Rename Club")
          .addComponents(
            new ActionRowBuilder().addComponents(
              new TextInputBuilder()
                .setCustomId("club_name")
                .setLabel("New club name")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue(currentClub.name)
            )
          );

        await interaction.showModal(modal);
        return;
      }

      // Add a new club slot (global, not tied to a specific club)
      if (id === "add_club") {
        const disabledClub = clubsBtn.find((c) => !c.enabled);
        if (!disabledClub) {
          return interaction.reply({
            content: "All available club slots are already in use (max 5).",
            flags: MessageFlags.Ephemeral
          });
        }

        disabledClub.enabled = true;
        boardStateBtn[disabledClub.key] = createEmptyBoardForFormation(DEFAULT_FORMATION);
        stateBtn.currentClubKey = disabledClub.key;

        return interaction.reply({
          content:
            "Added a new club slot: **" +
            disabledClub.name +
            "**. Use \"Rename Club\" & \"Formation\" to configure it.",
          flags: MessageFlags.Ephemeral
        });
      }

      // Remove a club
      if (id.startsWith("remove_club_")) {
        const clubKey = id.substring("remove_club_".length);
        const currentClub = getClubByKey(clubsBtn, clubKey);
        if (!currentClub || !currentClub.enabled) {
          return interaction.reply({
            content: "This club cannot be removed.",
            flags: MessageFlags.Ephemeral
          });
        }

        const enabledCount = clubsBtn.filter((c) => c.enabled).length;
        if (enabledCount <= 1) {
          return interaction.reply({
            content: "You must keep at least one club enabled.",
            flags: MessageFlags.Ephemeral
          });
        }

        const clubBoard = boardStateBtn[clubKey];
        if (clubBoard && clubBoard.slots) {
          const hasTaken = clubBoard.slots.some((slot) => !slot.open);
          if (hasTaken) {
            return interaction.reply({
              content:
                "This club still has taken spots. Free all spots first before removing it.",
              flags: MessageFlags.Ephemeral
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
          content:
            "Removed club **" +
            currentClub.name +
            "**. Panels may need to be recreated to reflect this change.",
          flags: MessageFlags.Ephemeral
        });
      }

      // Player tools (manager-only, opens ephemeral menu)
      if (id.startsWith("player_tools_")) {
        const clubKey = id.substring("player_tools_".length);

        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              "Only captains, managers, owners, media, or admins can use player tools.",
            flags: MessageFlags.Ephemeral
          });
        }

        const select = new StringSelectMenuBuilder()
          .setCustomId("player_tools_select_" + clubKey)
          .setPlaceholder("Choose a player tool")
          .addOptions(
            {
              label: "Assign from your voice channel",
              value: "assign"
            },
            {
              label: "Remove/move existing players",
              value: "manage"
            },
            {
              label: "Reset all spots",
              value: "reset"
            }
          );

        const row = new ActionRowBuilder().addComponents(select);

        return interaction.reply({
          content: "What do you want to do?",
          components: [row],
          flags: MessageFlags.Ephemeral
        });
      }

      // Formation menu button (manager-only, opens ephemeral select of formations)
      if (id.startsWith("formation_menu_")) {
        const clubKey = id.substring("formation_menu_".length);

        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              "Only captains, managers, owners, media, or admins can change formations.",
            flags: MessageFlags.Ephemeral
          });
        }

        const clubBoard = boardState[clubKey] || createEmptyBoardForFormation(DEFAULT_FORMATION);
        const currentFormation = clubBoard.formation || DEFAULT_FORMATION;

        const formationNames = FORMATION_MENU_ORDER;

        const select = new StringSelectMenuBuilder()
          .setCustomId("formation_select_" + clubKey)
          .setPlaceholder("Select a formation")
          .addOptions(
            formationNames.map((name) => ({
              label: name,
              value: name,
              default: name === currentFormation
            }))
          );

        const row = new ActionRowBuilder().addComponents(select);

        return interaction.reply({
          content:
            "Choose a formation. Changing formation will reset all spots to OPEN for this club.",
          components: [row],
          flags: MessageFlags.Ephemeral
        });
      }

      // Player self-claim/free spot (must be in VC; and on VC panels, must be the right VC)
      if (id.startsWith("pos_")) {
        // customId: pos_<clubKey>_<index>
        const parts = id.split("_"); // ["pos", clubKey, index]
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
              content:
                "This panel is linked to voice channel **" +
                (vcChannel ? vcChannel.name : vcId) +
                "**. Join that voice channel to claim or free a spot.",
              flags: MessageFlags.Ephemeral
            });
          }
        } else {
          // Not a VC panel: require being in some VC at least
          const inVoice = interaction.member?.voice?.channelId;
          if (!inVoice) {
            return interaction.reply({
              content:
                "You must be connected to a voice channel to claim or free a spot.",
              flags: MessageFlags.Ephemeral
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
                "This spot is already taken by someone else. Ask a manager if you need to be moved.",
              flags: MessageFlags.Ephemeral
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

      if (id.startsWith("rename_club_modal_")) {
        const clubKey = id.substring("rename_club_modal_".length);

        const newName = interaction.fields.getTextInputValue("club_name").trim();
        if (!newName) {
          return interaction.reply({
            content: "Club name cannot be empty.",
            flags: MessageFlags.Ephemeral
          });
        }

        const stateModal = getGuildState(interaction.guildId);
        if (!stateModal) {
          return interaction.reply({
            content: "Guild state not found.",
            flags: MessageFlags.Ephemeral
          });
        }

        const currentClub = getClubByKey(stateModal.clubs, clubKey);
        if (!currentClub) {
          return interaction.reply({
            content: "Current club not found.",
            flags: MessageFlags.Ephemeral
          });
        }

        currentClub.name = newName;

        await refreshClubPanels(interaction.guildId, clubKey);

        return interaction.reply({
          content: "Club renamed to **" + newName + "**.",
          flags: MessageFlags.Ephemeral
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
      if (id === "viewer_club_select") {
        const selectedKey = interaction.values[0];
        const club = getClubByKey(stateSel.clubs, selectedKey);
        if (!club || !club.enabled) {
          return interaction.reply({
            content: "Unknown or disabled club selected.",
            flags: MessageFlags.Ephemeral
          });
        }

        return interaction.update({
          embeds: [buildEmbedForClub(guildIdSel, selectedKey)],
          components: [buildViewerClubSelect(guildIdSel, selectedKey)]
        });
      }

      // Change which club we're editing on a given panel
      if (id === "club_select") {
        const selectedKey = interaction.values[0];
        const club = getClubByKey(stateSel.clubs, selectedKey);
        if (!club) {
          return interaction.reply({
            content: "Unknown club selected.",
            flags: MessageFlags.Ephemeral
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
      if (id.startsWith("player_tools_select_")) {
        const clubKey = id.substring("player_tools_select_".length);
        const choice = interaction.values[0];

        if (choice === "assign") {
          return startAssignFromVc(interaction, stateSel, clubKey);
        }
        if (choice === "manage") {
          return startManagePlayers(interaction, stateSel, clubKey);
        }
        if (choice === "reset") {
          return doResetSpots(interaction, stateSel, guildIdSel, clubKey);
        }
        return;
      }

      // First step of manager assignment: pick player (manager-only)
      if (id.startsWith("assign_player_pick_")) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              "Only captains, managers, owners, media, or admins can assign or move players.",
            flags: MessageFlags.Ephemeral
          });
        }

        const clubKey = id.substring("assign_player_pick_".length);
        const club = getClubByKey(stateSel.clubs, clubKey);
        if (!club) {
          return interaction.reply({
            content: "Unknown club in assignment request.",
            flags: MessageFlags.Ephemeral
          });
        }

        const userId = interaction.values[0];
        const clubBoard = stateSel.boardState[clubKey];
        if (!clubBoard) {
          return interaction.reply({
            content: "Club board not found.",
            flags: MessageFlags.Ephemeral
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
            label = slot.label + " (" + seenLabelIndex[slot.label] + ")";
          }
          return {
            label,
            value: String(idx)
          };
        });

        const posSelect = new StringSelectMenuBuilder()
          .setCustomId("assign_player_pos_" + clubKey + "_" + userId)
          .setPlaceholder("Pick a spot")
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(posSelect);

        return interaction.update({
          content: "Now pick a spot for <@" + userId + "> in **" + club.name + "**:",
          components: [row]
        });
      }

      // Second step of manager assignment: pick spot index (manager-only)
      if (id.startsWith("assign_player_pos_")) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              "Only captains, managers, owners, media, or admins can assign or move players.",
            flags: MessageFlags.Ephemeral
          });
        }

        const parts = id.split("_"); // ["assign","player","pos",clubKey,userId]
        const clubKey = parts[3];
        const userId = parts[4];
        const slotIndex = parseInt(interaction.values[0], 10);

        const club = getClubByKey(stateSel.clubs, clubKey);
        if (!club) {
          return interaction.reply({
            content: "Unknown club in assignment request.",
            flags: MessageFlags.Ephemeral
          });
        }

        const clubBoard = stateSel.boardState[clubKey];
        if (!clubBoard || !clubBoard.slots[slotIndex]) {
          return interaction.reply({
            content: "Unknown spot for this club.",
            flags: MessageFlags.Ephemeral
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
          content:
            "Assigned <@" +
            userId +
            "> to **" +
            slot.label +
            "** in **" +
            club.name +
            "**.",
          components: []
        });
      }

      // vcspots: pick which club is playing in this VC
      if (id.startsWith("vcspots_pickclub_")) {
        const voiceChannelId = id.substring("vcspots_pickclub_".length);
        const clubKey = interaction.values[0];

        const club = getClubByKey(stateSel.clubs, clubKey);
        if (!club || !club.enabled) {
          return interaction.reply({
            content: "Unknown or disabled club selected.",
            flags: MessageFlags.Ephemeral
          });
        }

        let vc;
        try {
          vc = await interaction.guild.channels.fetch(voiceChannelId);
        } catch (err) {
          console.error("⚠️ Failed to fetch voice channel for vcspots:", err);
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
            "⚠️ Failed to edit existing VC panel, sending a new one instead:",
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
          content:
            "Linked **" +
            club.name +
            "** to voice channel **" +
            (vc ? vc.name : "this VC") +
            "** and posted/updated the live panel in this chat.",
          components: []
        });
      }

      // Manage players: pick which player to manage (manager-only)
      if (id.startsWith("manage_player_pick_")) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              "Only captains, managers, owners, media, or admins can remove or move players.",
            flags: MessageFlags.Ephemeral
          });
        }

        const clubKey = id.substring("manage_player_pick_".length);
        const club = getClubByKey(stateSel.clubs, clubKey);
        if (!club) {
          return interaction.reply({
            content: "Unknown club in manage request.",
            flags: MessageFlags.Ephemeral
          });
        }

        const userId = interaction.values[0];
        const clubBoard = stateSel.boardState[clubKey];
        if (!clubBoard) {
          return interaction.reply({
            content: "Club board not found.",
            flags: MessageFlags.Ephemeral
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
            label = slot.label + " (" + seenLabelIndex[slot.label] + ")";
          }
          return {
            label,
            value: String(idx)
          };
        });

        options.push({
          label: "Remove from all spots",
          value: "__REMOVE__"
        });

        const posSelect = new StringSelectMenuBuilder()
          .setCustomId("manage_player_pos_" + clubKey + "_" + userId)
          .setPlaceholder("Choose a new spot or remove from all")
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(posSelect);

        return interaction.update({
          content: "Manage <@" + userId + "> in **" + club.name + "**:",
          components: [row]
        });
      }

      // Manage players: choose new position or remove (manager-only)
      if (id.startsWith("manage_player_pos_")) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              "Only captains, managers, owners, media, or admins can remove or move players.",
            flags: MessageFlags.Ephemeral
          });
        }

        const parts = id.split("_"); // ["manage","player","pos",clubKey,userId]
        const clubKey = parts[3];
        const userId = parts[4];
        const choice = interaction.values[0];

        const club = getClubByKey(stateSel.clubs, clubKey);
        if (!club) {
          return interaction.reply({
            content: "Unknown club in manage request.",
            flags: MessageFlags.Ephemeral
          });
        }

        const clubBoard = stateSel.boardState[clubKey];
        if (!clubBoard) {
          return interaction.reply({
            content: "Club board not found.",
            flags: MessageFlags.Ephemeral
          });
        }

        // Clear all slots this user holds in this club
        clubBoard.slots.forEach((s) => {
          if (s.takenBy === userId) {
            s.open = true;
            s.takenBy = null;
          }
        });

        if (choice !== "__REMOVE__") {
          const slotIndex = parseInt(choice, 10);
          const slot = clubBoard.slots[slotIndex];
          if (!slot) {
            return interaction.reply({
              content: "Unknown position for this club.",
              flags: MessageFlags.Ephemeral
            });
          }
          slot.open = false;
          slot.takenBy = userId;
        }

        await refreshClubPanels(guildIdSel, clubKey);

        return interaction.update({
          content:
            choice === "__REMOVE__"
              ? "Removed <@" + userId + "> from all spots in **" + club.name + "**."
              : "Moved <@" +
                userId +
                "> to **" +
                clubBoard.slots[parseInt(choice, 10)].label +
                "** in **" +
                club.name +
                "**.",
          components: []
        });
      }

      // Formation selection (manager-only)
      if (id.startsWith("formation_select_")) {
        const clubKey = id.substring("formation_select_".length);
        const formationName = interaction.values[0];
        return setClubFormation(interaction, guildIdSel, clubKey, formationName);
      }
    }
  } catch (err) {
    console.error("❌ Error handling interaction:", err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: "Error.",
        flags: MessageFlags.Ephemeral
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
    console.error("❌ Error in VoiceStateUpdate handler:", err);
  }
});

// ---------- LOGIN ----------

client.login(token);
