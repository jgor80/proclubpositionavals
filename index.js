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
  ChannelType
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

// Single source of truth for the placeholder id
const PLACEHOLDER_USER_ID = '__NOT_IN_VC__';

// Human label for placeholder (reused)
const PLACEHOLDER_LABEL = 'Player not in VC (placeholder)';

/**
 * Dynamic formations: each club can pick one, and we build slots from this.
 * Each array is 11 positions in order (GK first, strikers last).
 */
const FORMATION_POSITIONS = {
  // 3-at-the-back
  "3-1-4-2": [
    "GK",
    "CB", "CB", "CB",
    "CDM",
    "LM", "CM", "CM", "RM",
    "ST", "ST"
  ],

  "3-4-1-2": [
    "GK",
    "CB", "CB", "CB",
    "LM", "CM", "CM", "RM",
    "CAM",
    "ST", "ST"
  ],

  "3-4-2-1": [
    "GK",
    "CB", "CB", "CB",
    "LM", "CM", "CM", "RM",
    "CAM", "CAM",
    "ST"
  ],

  "3-4-3": [
    "GK",
    "CB", "CB", "CB",
    "LM", "CM", "CM", "RM",
    "LW", "ST", "RW"
  ],

  "3-5-2": [
    "GK",
    "CB", "CB", "CB",
    "LM", "CDM", "CAM", "CDM", "RM",
    "ST", "ST"
  ],

  // 4-at-the-back, 4-1-x-x and 4-2-x-x shapes
  "4-1-2-1-2": [          // 41212 (wide)
    "GK",
    "LB", "CB", "CB", "RB",
    "CDM",
    "LM", "RM",
    "CAM",
    "ST", "ST"
  ],

  "4-1-2-1-2 (2)": [      // 41212(2) (narrow)
    "GK",
    "LB", "CB", "CB", "RB",
    "CDM",
    "CM", "CM",
    "CAM",
    "ST", "ST"
  ],

  "4-1-3-2": [            // 4132
    "GK",
    "LB", "CB", "CB", "RB",
    "CDM",
    "LM", "CM", "RM",
    "ST", "ST"
  ],

  "4-1-4-1": [            // 4141
    "GK",
    "LB", "CB", "CB", "RB",
    "CDM",
    "LM", "CM", "CM", "RM",
    "ST"
  ],

  "4-2-1-3": [            // 4213
    "GK",
    "LB", "CB", "CB", "RB",
    "CDM", "CDM",
    "CAM",
    "LW", "ST", "RW"
  ],

  "4-2-2-2": [            // 4222
    "GK",
    "LB", "CB", "CB", "RB",
    "CDM", "CDM",
    "CAM", "CAM",
    "ST", "ST"
  ],

  "4-2-3-1": [            // 4231 (narrow, 3 CAMs)
    "GK",
    "LB", "CB", "CB", "RB",
    "CDM", "CDM",
    "CAM", "CAM", "CAM",
    "ST"
  ],

  "4-2-3-1 (2)": [        // 4231(2) (wide: LM/RM + CAM)
    "GK",
    "LB", "CB", "CB", "RB",
    "CDM", "CDM",
    "LM", "CAM", "RM",
    "ST"
  ],

  "4-2-4": [              // 424
    "GK",
    "LB", "CB", "CB", "RB",
    "CM", "CM",
    "LW", "ST", "ST", "RW"
  ],

  // 4-3-x-x
  "4-3-1-2": [            // 4312
    "GK",
    "LB", "CB", "CB", "RB",
    "CM", "CM", "CM",
    "CAM",
    "ST", "ST"
  ],

  "4-3-2-1": [            // 4321 (Christmas tree)
    "GK",
    "LB", "CB", "CB", "RB",
    "CM", "CM", "CM",
    "CF", "CF",
    "ST"
  ],

  "4-3-3": [              // 433 base – classic FUT layout
    "GK",
    "LB", "CB", "CB", "RB",
    "CM", "CM", "CM",
    "LW", "ST", "RW"
  ],

  "4-3-3 (2)": [          // 433(2) – 1 CDM + 2 CM
    "GK",
    "LB", "CB", "CB", "RB",
    "CDM", "CM", "CM",
    "LW", "ST", "RW"
  ],

  "4-3-3 (3)": [          // 433(3) – more defensive, double pivot
    "GK",
    "LB", "CB", "CB", "RB",
    "CDM", "CDM", "CM",
    "LW", "ST", "RW"
  ],

  "4-3-3 (4)": [          // 433(4) – more attacking, 2 CAM
    "GK",
    "LB", "CB", "CB", "RB",
    "CM", "CAM", "CAM",
    "LW", "ST", "RW"
  ],

  // 4-4-x-x & 4-5-x
  "4-4-1-1 (2)": [        // 4411(2)
    "GK",
    "LB", "CB", "CB", "RB",
    "LM", "CM", "CM", "RM",
    "CF",
    "ST"
  ],

  "4-4-2": [              // 442
    "GK",
    "LB", "CB", "CB", "RB",
    "LM", "CM", "CM", "RM",
    "ST", "ST"
  ],

  "4-4-2 (2)": [          // 442(2) – holding, double pivot
    "GK",
    "LB", "CB", "CB", "RB",
    "LM", "CDM", "CDM", "RM",
    "ST", "ST"
  ],

  "4-5-1": [              // 451 – more attacking 4-5-1
    "GK",
    "LB", "CB", "CB", "RB",
    "LM", "CM", "CAM", "CM", "RM",
    "ST"
  ],

  "4-5-1 (2)": [          // 451(2) – more defensive, double pivot
    "GK",
    "LB", "CB", "CB", "RB",
    "LM", "CDM", "CAM", "CDM", "RM",
    "ST"
  ],

  // 5-at-the-back
  "5-2-1-2": [            // 5212
    "GK",
    "LWB", "CB", "CB", "CB", "RWB",
    "CM", "CM",
    "CAM",
    "ST", "ST"
  ],

  "5-2-3": [              // 523
    "GK",
    "LWB", "CB", "CB", "CB", "RWB",
    "CM", "CM",
    "LW", "ST", "RW"
  ],

  "5-3-2": [              // 532
    "GK",
    "LWB", "CB", "CB", "CB", "RWB",
    "CM", "CM", "CM",
    "ST", "ST"
  ],

  "5-4-1": [              // 541
    "GK",
    "LWB", "CB", "CB", "CB", "RWB",
    "LM", "CM", "CM", "RM",
    "ST"
  ]
};

// Each note broken onto its own line for readability in embeds
const FORMATION_INFO = {
  // 3-at-the-back
  "3-1-4-2": [
    'Strengths: Very strong through the middle with a back three plus a screening CDM, good for patient build-up and countering central overloads.',
    'Weaknesses: Can be exposed in the wide channels if LM/RM don’t track back.',
    'Best used: When you want two strikers up top and control of the middle third.',
    'Key players: Mobile, aggressive CBs; a disciplined CDM who reads play well; high-stamina LM/RM; one link-up ST and one runner in behind.'
  ].join('\n'),

  "3-4-1-2": [
    'Strengths: Central overload with a CAM behind two strikers, ideal for through balls and quick combinations.',
    'Weaknesses: Flanks can be vulnerable vs teams with very attacking fullbacks or wide wingers.',
    'Best used: When you have a playmaking CAM and two complementary forwards.',
    'Key players: Ball-playing CBs, box-to-box CMs, creative CAM, one target ST and one pacey ST.'
  ].join('\n'),

  "3-4-2-1": [
    'Strengths: Very strong between the lines with two CAMs/CFs behind a lone ST, great for tiki-taka and short passing.',
    'Weaknesses: Only one true striker and no classic wingers, so crosses are less threatening.',
    'Best used: When you have two creative attackers who like to drift and combine.',
    'Key players: Composed CBs, hardworking CM pair, two technical CAMs, a complete ST who can hold up and finish.'
  ].join('\n'),

  "3-4-3": [
    'Strengths: Super aggressive front three with wide forwards, great for pressing and fast transitions.',
    'Weaknesses: Midfield can be outnumbered and wingbacks must work hard both ways.',
    'Best used: When you want to swarm the opponent’s back line and play direct.',
    'Key players: Fast LW/RW who can score, physical CBs, energetic CMs, clinical ST.'
  ].join('\n'),

  "3-5-2": [
    'Strengths: Massive control in midfield with five across and two STs, good for slow build-up or long spells of possession.',
    'Weaknesses: Width depends heavily on LM/RM; if they don’t track back, flanks are exposed.',
    'Best used: When you have strong central players and want to dominate the middle.',
    'Key players: Stamina monsters at LM/RM, two-way CDMs, creative CAM, a target ST plus a runner.'
  ].join('\n'),

  // 4-at-the-back, 4-1-x-x and 4-2-x-x shapes
  "4-1-2-1-2": [
    'Strengths: Narrow diamond that overloads the center and supports two STs, good for quick one-twos and through balls.',
    'Weaknesses: Very little natural width, so you can struggle vs compact low blocks.',
    'Best used: When your fullbacks like to bomb forward and your CAM is a star.',
    'Key players: Overlapping LB/RB, strong CDM, high-vision CAM, two strikers with good off-the-ball movement.'
  ].join('\n'),

  "4-1-2-1-2 (2)": [
    'Strengths: Even more compact diamond with CM/CM, great for short passing and central dominance.',
    'Weaknesses: Predictable if opponents clog the middle; relies on fullbacks for width.',
    'Best used: With technically sound CMs and a creative CAM.',
    'Key players: Press-resistant CMs, smart CDM, playmaking CAM, versatile STs who can drop in.'
  ].join('\n'),

  "4-1-3-2": [
    'Strengths: Solid single pivot CDM behind an attacking three and two STs, good for pressing high and playing direct.',
    'Weaknesses: Only one holding mid, so counters through the middle can be dangerous.',
    'Best used: When you trust your CDM and want numbers in attack.',
    'Key players: Strong CDM, balanced LM/RM, CAM/CM with vision, two aggressive strikers.'
  ].join('\n'),

  "4-1-4-1": [
    'Strengths: Very stable defensively with a CDM shielding the back four and a compact midfield line of four.',
    'Weaknesses: Lone ST can get isolated if wide players don’t join quickly.',
    'Best used: When protecting a lead or playing vs stronger teams.',
    'Key players: Disciplined CDM, high-work-rate wide mids, box-to-box CMs, a complete ST who can hold up play.'
  ].join('\n'),

  "4-2-1-3": [
    'Strengths: Double pivot protects the back four while CAM and front three attack, great balance between defense and offense.',
    'Weaknesses: CAM can be crowded out if team doesn’t create wide overloads.',
    'Best used: With quick wingers and a strong central CAM.',
    'Key players: Two intelligent CDMs, creative CAM, pacey LW/RW, clinical ST.'
  ].join('\n'),

  "4-2-2-2": [
    'Strengths: Very strong in central channels with two CAMs and two STs, good for intricate passing and central overloads.',
    'Weaknesses: Flanks can be open; you rely heavily on fullbacks for width.',
    'Best used: When your fullbacks are very attacking and your CAMs are creative.',
    'Key players: Two disciplined CDMs, technical CAMs, overlapping LB/RB, two deadly finishers.'
  ].join('\n'),

  "4-2-3-1": [
    'Strengths: One of the most balanced shapes; double pivot for stability plus three attackers behind a ST.',
    'Weaknesses: Wide CAMs must track back or fullbacks get overloaded.',
    'Best used: When you have a standout CAM and versatile wide attackers.',
    'Key players: All-round CDM/CM pair, playmaking central CAM, agile wide CAMs, complete ST.'
  ].join('\n'),

  "4-2-3-1 (2)": [
    'Strengths: LM/RM + CAM behind a ST gives natural width and a central creator, good for crosses and cutbacks.',
    'Weaknesses: If LM/RM don’t work defensively, you can be stretched wide.',
    'Best used: When you like to attack through the wings.',
    'Key players: Stamina-heavy wide mids, solid CDM duo, creative CAM, strong aerial ST.'
  ].join('\n'),

  "4-2-4": [
    'Strengths: Extremely aggressive with four forwards, ideal for all-out attack and late-game comebacks.',
    'Weaknesses: Midfield is thin; you’ll be vulnerable to counters and outnumbered centrally.',
    'Best used: When chasing a goal or vs weaker opponents.',
    'Key players: Two high-energy CMs, fast LW/RW, poacher ST plus target ST.'
  ].join('\n'),

  // 4-3-x-x
  "4-3-1-2": [
    'Strengths: Three CMs plus a CAM behind two STs; strong centrally with a natural link between mid and attack.',
    'Weaknesses: No natural width, so fullbacks must push high.',
    'Best used: When your midfielders are strong passers and can control tempo.',
    'Key players: One holding CM, two box-to-box CMs, creative CAM, two complementary strikers.'
  ].join('\n'),

  "4-3-2-1": [
    'Strengths: “Christmas tree” structure; two CFs behind a lone ST for heavy central overloads and intricate build-up.',
    'Weaknesses: Almost no width; can feel cramped versus low blocks.',
    'Best used: When your attackers prefer to play between lines rather than hugging the touchline.',
    'Key players: Three balanced CMs, two creative CFs, a complete ST.'
  ].join('\n'),

  "4-3-3": [
    'Strengths: Classic all-round shape with three CMs and a front three; great for pressing, possession, and flexible attacking patterns.',
    'Weaknesses: Middle CM can get overworked if wide forwards don’t defend.',
    'Best used: When you have strong wingers and a solid midfield triangle.',
    'Key players: One holding CM, two shuttling CMs, pacey LW/RW, reliable ST.'
  ].join('\n'),

  "4-3-3 (2)": [
    'Strengths: CDM + two CMs give extra protection while keeping a dangerous front three; ideal for balanced play.',
    'Weaknesses: If CMs are too defensive, you can lack creativity.',
    'Best used: When one player excels as a pure CDM.',
    'Key players: Destroyer-type CDM, two box-to-box CMs, fast wingers, clinical ST.'
  ].join('\n'),

  "4-3-3 (3)": [
    'Strengths: Double pivot plus one CM makes it very solid defensively, great for sitting deeper and countering.',
    'Weaknesses: Can feel conservative; fewer runners from midfield into the box.',
    'Best used: Versus stronger teams or fast counters.',
    'Key players: Two disciplined CDMs, a linking CM, pacey LW/RW, lone ST who can exploit space.'
  ].join('\n'),

  "4-3-3 (4)": [
    'Strengths: CM + two CAMs behind a front three makes this very attacking and creative.',
    'Weaknesses: Defensive cover in midfield is lighter; can be risky if fullbacks push too high.',
    'Best used: When you want to dominate possession in the final third.',
    'Key players: One hard-working CM, two creative CAM types, flair LW/RW, top-tier finisher up front.'
  ].join('\n'),

  // 4-4-x-x & 4-5-x
  "4-4-1-1 (2)": [
    'Strengths: Solid 4-4-2 base with a CF dropping off the ST for link-up play, good balance between defense and attack.',
    'Weaknesses: Wide mids must work hard or your fullbacks get exposed.',
    'Best used: When you have a second striker good at creating and scoring.',
    'Key players: Two balanced CMs, high-work-rate LM/RM, creative CF, focal-point ST.'
  ].join('\n'),

  "4-4-2": [
    'Strengths: Very simple, very balanced: two banks of four and two STs, great for counters and crosses.',
    'Weaknesses: Outnumbered by 3 or 5-man midfields; can struggle to progress the ball centrally.',
    'Best used: With strong wide players and two strikers who link well.',
    'Key players: Disciplined CBs, LM/RM with pace and crossing, one target ST and one runner.'
  ].join('\n'),

  "4-4-2 (2)": [
    'Strengths: Double CDM gives excellent central protection while keeping two STs up top.',
    'Weaknesses: Less creativity from midfield; you’ll rely on flanks and long balls.',
    'Best used: To protect a lead but still have counter threat.',
    'Key players: Two strong CDMs, robust CBs, hard-working LM/RM, quick strikers.'
  ].join('\n'),

  "4-5-1": [
    'Strengths: Very strong midfield presence with a CAM; good for controlling possession and firing late runs into the box.',
    'Weaknesses: Lone ST can be isolated if LM/RM stay too deep.',
    'Best used: When your CAM is a main attacking outlet.',
    'Key players: Two solid CMs, creative CAM, LM/RM who can cut inside, complete ST.'
  ].join('\n'),

  "4-5-1 (2)": [
    'Strengths: Double pivot CDMs + CAM makes it defensively secure while still having a creator.',
    'Weaknesses: Can feel passive if LM/RM and CAM don’t push high.',
    'Best used: When you want to sit deeper but still threaten on counters through the middle.',
    'Key players: Two defensive-minded CDMs, high-energy LM/RM, clever CAM, pacey ST.'
  ].join('\n'),

  // 5-at-the-back
  "5-2-1-2": [
    'Strengths: Three CBs plus wingbacks and a CAM behind two STs; very secure at the back but still dangerous centrally.',
    'Weaknesses: Can be pinned deep if wingbacks are slow or too defensive.',
    'Best used: Versus strong opponents or when playing on the counter.',
    'Key players: Quick LWB/RWB, aerially dominant CBs, two-way CMs, creative CAM, two strikers who can exploit space.'
  ].join('\n'),

  "5-2-3": [
    'Strengths: Wingbacks plus a front three make this great for wide counters; very solid defensively.',
    'Weaknesses: Only two CMs, so you can be overrun centrally.',
    'Best used: When your wingers and wingbacks are very fast.',
    'Key players: Pace merchant LWB/RWB, mobile CB trio, hard-working CMs, direct LW/RW, fast ST.'
  ].join('\n'),

  "5-3-2": [
    'Strengths: Extremely solid with three CBs and three CMs plus two STs; tough to break down while still having a front two.',
    'Weaknesses: Width relies fully on wingbacks and can be slow to transition if CMs are too defensive.',
    'Best used: When protecting leads or playing pragmatic football.',
    'Key players: Strong CBs, tireless wingbacks, balanced midfield three, two strikers who can hold up and finish.'
  ].join('\n'),

  "5-4-1": [
    'Strengths: Very deep and compact, ideal for parking the bus or absorbing pressure.',
    'Weaknesses: Limited attacking options with one ST and deep wide mids.',
    'Best used: When you’re outmatched and playing for counters or set pieces.',
    'Key players: Dominant CB trio, disciplined wingbacks, hard-working LM/RM, a lone ST who can win duels and hold the ball up.'
  ].join('\n')
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
//   vcPanels: { [voiceChannelId]: { clubKey, textChannelId, messageId } },
//   clubVcLinks: { [clubKey]: voiceChannelId | null }
// }
const guildStates = new Map();

function getGuildState(guildId) {
  if (!guildId) return null;

  let state = guildStates.get(guildId);
  if (!state) {
    const clubs = cloneDefaultClubs();
    const boardState = createEmptyBoardState(clubs);
    const clubVcLinks = {};
    clubs.forEach((club) => {
      clubVcLinks[club.key] = null;
    });

    state = {
      clubs,
      boardState,
      currentClubKey: 'club1',
      adminPanelChannelId: null,
      adminPanelMessageId: null,
      vcPanels: {},
      clubVcLinks
    };
    guildStates.set(guildId, state);
  } else {
    // Ensure clubVcLinks exists and has keys for all clubs (future-proof)
    if (!state.clubVcLinks) {
      state.clubVcLinks = {};
    }
    state.clubs.forEach((club) => {
      if (!(club.key in state.clubVcLinks)) {
        state.clubVcLinks[club.key] = null;
      }
    });
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

// ---------- UI BUILDERS (per guild) ----------

function buildEmbedForClub(guildId, clubKey) {
  const state = getGuildState(guildId);
  if (!state) throw new Error('No state for guild');

  const { clubs, boardState, clubVcLinks } = state;
  const club = getClubByKey(clubs, clubKey);
  if (!club) throw new Error(`Unknown club key: ${clubKey}`);

  const clubBoard = boardState[clubKey];
  if (!clubBoard) throw new Error(`No board state for club key: ${clubKey}`);

  // Show from top of pitch (strikers) down to GK
  const lines = [];
  for (let i = clubBoard.slots.length - 1; i >= 0; i--) {
    const slot = clubBoard.slots[i];
    const emoji = slot.open ? '🟢' : '🔴';

    let text;
    if (slot.open) {
      text = 'OPEN';
    } else if (slot.takenBy) {
      if (slot.takenBy === PLACEHOLDER_USER_ID) {
        text = 'TAKEN by player not in VC';
      } else {
        text = `TAKEN by <@${slot.takenBy}>`;
      }
    } else {
      text = 'TAKEN';
    }

    lines.push(`**${slot.label}** – ${emoji} ${text}`);
  }

  const vcId = clubVcLinks?.[clubKey] || null;
  const vcLine = vcId ? `**Voice Channel:** <#${vcId}>\n` : '';

  const embed = new EmbedBuilder()
    .setTitle(`Club Spots – ${clubBoard.formation}`)
    .setDescription(
      `**Club:** ${club.name}\n` +
      (vcLine ? `${vcLine}\n` : '\n') +
      lines.join('\n')
    )
    .setFooter({
      text:
        'Players: click a spot to claim. Managers can assign/move/remove players and change formations.'
    });

  const info = FORMATION_INFO[clubBoard.formation];
  if (info) {
    embed.addFields({
      name: 'Formation notes',
      value: info.length > 1024 ? info.slice(0, 1021) + '...' : info
    });
  }

  return embed;
}

// Buttons for a specific club, based on its current formation slots
// Also ordered from top of pitch (attack) down to GK
function buildButtons(guildId, clubKey) {
  const state = getGuildState(guildId);
  const { boardState } = state;
  const clubBoard = boardState[clubKey];

  const rows = [];
  let currentRow = new ActionRowBuilder();

  for (let i = clubBoard.slots.length - 1; i >= 0; i--) {
    const slot = clubBoard.slots[i];

    const button = new ButtonBuilder()
      // customId: pos_<clubKey>_<index>
      .setCustomId(`pos_${clubKey}_${i}`)
      .setLabel(slot.label)
      .setStyle(slot.open ? ButtonStyle.Success : ButtonStyle.Danger);

    currentRow.addComponents(button);

    if (currentRow.components.length === 5) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
  }

  if (currentRow.components.length > 0) {
    rows.push(currentRow);
  }

  return rows;
}

// Helper: build numbered slot options for select menus (reused)
function buildSlotOptions(clubBoard) {
  const labelCounts = {};
  clubBoard.slots.forEach((slot) => {
    labelCounts[slot.label] = (labelCounts[slot.label] || 0) + 1;
  });

  const seenLabelIndex = {};
  const options = [];
  for (let idx = clubBoard.slots.length - 1; idx >= 0; idx--) {
    const slot = clubBoard.slots[idx];
    const total = labelCounts[slot.label];
    let label = slot.label;
    if (total > 1) {
      seenLabelIndex[slot.label] = (seenLabelIndex[slot.label] || 0) + 1;
      label = `${slot.label} (${seenLabelIndex[slot.label]})`;
    }
    options.push({
      label,
      value: String(idx)
    });
  }
  return options;
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
// Row 2: global/club controls (Rename, Add, Remove, Player Tools, Formation)
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

  // IMPORTANT: Max 5 rows total per message
  // clubRow (1) + controlRow (1) + up to 3 position rows = 5
  return [clubRow, controlRow, ...buttonRows.slice(0, 3)];
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

  const { clubs } = state;
  const club = getClubByKey(clubs, clubKey);
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
        content: 'The voice channel linked to this panel no longer exists.',
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

  // Up to 24 real players + 1 placeholder = 25 options (Discord limit)
  const memberOptions = members.map((m) => ({
    label: m.displayName || m.user.username,
    value: m.id
  }));

  const options = memberOptions.slice(0, 24);
  options.push({
    label: PLACEHOLDER_LABEL,
    value: PLACEHOLDER_USER_ID,
    description: 'Use when someone is playing but not connected to voice.'
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`assign_player_pick_${clubKey}`)
    .setPlaceholder('Pick a player or placeholder')
    .addOptions(options);

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
  const clubBoard = boardState[clubKey];
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

    // Handle placeholder specially
    if (userId === PLACEHOLDER_USER_ID) {
      if (seen.has(userId)) continue;
      seen.add(userId);
      options.push({
        label: PLACEHOLDER_LABEL,
        value: userId,
        description: 'Placeholder for someone not in voice'
      });
      continue;
    }

    if (seen.has(userId)) continue;
    seen.add(userId);

    let label = userId;
    try {
      const member = await interaction.guild.members.fetch(userId);
      label = member.displayName || member.user.username || userId;
    } catch {
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
  const club = getClubByKey(clubs, clubKey);

  return interaction.reply({
    content: `Pick a player in **${club ? club.name : clubKey}** to remove or move:`,
    components: [row],
    ephemeral: true
  });
}

// Helper: start "Set VC for this club" flow (manager-only)
async function startSetClubVc(interaction, state, clubKey) {
  if (!isManager(interaction.member)) {
    return interaction.reply({
      content:
        'Only captains, managers, owners, media, or admins can set the voice channel.',
      ephemeral: true
    });
  }

  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({
      content: 'Guild not found.',
      ephemeral: true
    });
  }

  const club = getClubByKey(state.clubs, clubKey);
  if (!club) {
    return interaction.reply({
      content: 'Unknown club in voice channel link request.',
      ephemeral: true
    });
  }

  const voiceChannels = guild.channels.cache.filter(
    (ch) =>
      ch.type === ChannelType.GuildVoice ||
      ch.type === ChannelType.GuildStageVoice
  );

  if (!voiceChannels.size) {
    return interaction.reply({
      content: 'No voice channels found in this server to link.',
      ephemeral: true
    });
  }

  const currentLinkedId = state.clubVcLinks?.[clubKey] || null;
  const options = [];

  // Up to 24 channels + 1 "clear" option
  const sorted = [...voiceChannels.values()].sort((a, b) => {
    if (a.rawPosition !== b.rawPosition) {
      return a.rawPosition - b.rawPosition;
    }
    return a.name.localeCompare(b.name);
  });

  for (const vc of sorted) {
    options.push({
      label: vc.name.slice(0, 100),
      value: vc.id,
      default: vc.id === currentLinkedId
    });
    if (options.length >= 24) break;
  }

  options.push({
    label: 'Clear voice channel link',
    value: '__NONE__'
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`set_vc_select_${clubKey}`)
    .setPlaceholder('Select a voice channel')
    .addOptions(options);

  const row = new ActionRowBuilder().addComponents(select);

  return interaction.reply({
    content: `Choose a voice channel to link to **${club.name}**.`,
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

  // Preserve VC link when changing formation
  const oldVcId = state.clubVcLinks?.[clubKey] || null;

  state.boardState[clubKey] = createEmptyBoardForFormation(formationName);

  if (!state.clubVcLinks) state.clubVcLinks = {};
  state.clubVcLinks[clubKey] = oldVcId;

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
        boardStateBtn[disabledClub.key] = createEmptyBoardForFormation(
          DEFAULT_FORMATION
        );
        if (!stateBtn.clubVcLinks) stateBtn.clubVcLinks = {};
        stateBtn.clubVcLinks[disabledClub.key] = null;

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
        if (stateBtn.clubVcLinks) {
          stateBtn.clubVcLinks[clubKey] = null;
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
          .setPlaceholder('Choose a tool')
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
            },
            {
              label: 'Set voice channel for this club',
              value: 'set_vc'
            }
          );

        const row = new ActionRowBuilder().addComponents(select);

        return interaction.reply({
          content: 'What do you want to do?',
          components: [row],
          ephemeral: true
        });
      }

      // Formation menu button (manager-only, opens ephemeral selects grouped by style)
      if (id.startsWith('formation_menu_')) {
        const clubKey = id.substring('formation_menu_'.length);

        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can change formations.',
            ephemeral: true
          });
        }

        const clubBoard =
          boardState[clubKey] || createEmptyBoardForFormation(DEFAULT_FORMATION);
        const currentFormation = clubBoard.formation || DEFAULT_FORMATION;

        const allNames = Object.keys(FORMATION_POSITIONS);

        const threeBack = allNames.filter((name) => name.startsWith('3-'));
        const fourBack = allNames.filter((name) => name.startsWith('4-'));
        const fiveBack = allNames.filter((name) => name.startsWith('5-'));
        const twoStrikers = allNames.filter((name) => {
          const positions = FORMATION_POSITIONS[name] || [];
          return positions.filter((p) => p === 'ST').length === 2;
        });

        const groups = [
          { id: '3back', label: '3-back formations', list: threeBack },
          { id: '4back', label: '4-back formations', list: fourBack },
          { id: '5back', label: '5-back formations', list: fiveBack },
          { id: '2st', label: 'Two-striker formations', list: twoStrikers }
        ];

        const rows = [];

        groups.forEach((group) => {
          if (!group.list.length) return;

          const options = group.list.map((name) => ({
            label: name,
            value: name,
            default: name === currentFormation
          }));

          const select = new StringSelectMenuBuilder()
            .setCustomId(`formation_select_${clubKey}_${group.id}`)
            .setPlaceholder(group.label)
            .addOptions(options.slice(0, 25));

          rows.push(new ActionRowBuilder().addComponents(select));
        });

        return interaction.reply({
          content:
            'Choose a formation. Changing formation will reset all spots to OPEN for this club.',
          components: rows,
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
            } catch {
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

    // ----- Dropdowns (club select, viewer select, player tools, assignment selects, vcspots, formation select, manage players, set VC) -----
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
        if (choice === 'set_vc') {
          return startSetClubVc(interaction, stateSel, clubKey);
        }
        return;
      }

      // Set VC: choose voice channel / clear
      if (id.startsWith('set_vc_select_')) {
        const clubKey = id.substring('set_vc_select_'.length);
        const selected = interaction.values[0];

        const club = getClubByKey(stateSel.clubs, clubKey);
        if (!club) {
          return interaction.reply({
            content: 'Unknown club in voice channel link request.',
            ephemeral: true
          });
        }

        if (!stateSel.clubVcLinks) stateSel.clubVcLinks = {};

        let responseText;
        if (selected === '__NONE__') {
          stateSel.clubVcLinks[clubKey] = null;
          responseText = `Cleared the linked voice channel for **${club.name}**.`;
        } else {
          stateSel.clubVcLinks[clubKey] = selected;
          responseText = `Linked **${club.name}** to voice channel <#${selected}>.`;
        }

        await refreshClubPanels(guildIdSel, clubKey);

        return interaction.update({
          content: responseText,
          components: []
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
        const clubBoard = stateSel.boardState[clubKey];
        if (!clubBoard) {
          return interaction.reply({
            content: 'Club board not found.',
            ephemeral: true
          });
        }

        const options = buildSlotOptions(clubBoard);

        const posSelect = new StringSelectMenuBuilder()
          .setCustomId(`assign_player_pos_${clubKey}_${userId}`)
          .setPlaceholder('Pick a spot')
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(posSelect);

        return interaction.update({
          content: `Now pick a spot for ${
            userId === PLACEHOLDER_USER_ID ? PLACEHOLDER_LABEL : `<@${userId}>`
          } in **${club.name}**:`,
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

        const playerLabel =
          userId === PLACEHOLDER_USER_ID
            ? PLACEHOLDER_LABEL
            : `<@${userId}>`;

        return interaction.update({
          content: `Assigned ${playerLabel} to **${slot.label}** in **${club.name}**.`,
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

        // Auto-link the VC for this club
        if (!stateSel.clubVcLinks) stateSel.clubVcLinks = {};
        stateSel.clubVcLinks[clubKey] = voiceChannelId;

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

        const options = buildSlotOptions(clubBoard);

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
          content: `Manage ${
            userId === PLACEHOLDER_USER_ID
              ? 'the player not in VC placeholder'
              : `<@${userId}>`
          } in **${club.name}**:`,
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

        if (choice === '__REMOVE__') {
          if (userId === PLACEHOLDER_USER_ID) {
            return interaction.update({
              content: `Removed the "player not in VC" placeholder from all spots in **${club.name}**.`,
              components: []
            });
          } else {
            return interaction.update({
              content: `Removed <@${userId}> from all spots in **${club.name}**.`,
              components: []
            });
          }
        } else {
          const slotIndex = parseInt(choice, 10);
          const newSlot = clubBoard.slots[slotIndex];
          const movedLabel =
            userId === PLACEHOLDER_USER_ID
              ? 'the player not in VC placeholder'
              : `<@${userId}>`;

          return interaction.update({
            content: `Moved ${movedLabel} to **${newSlot.label}** in **${club.name}**.`,
            components: []
          });
        }
      }

      // Formation selection (manager-only) – grouped selects
      if (id.startsWith('formation_select_')) {
        const parts = id.split('_'); // ['formation','select',clubKey,groupId]
        const clubKey = parts[2];
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
