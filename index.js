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
// We render them front-to-back in the embed, so attackers appear on top, GK at bottom.
const FORMATION_VISUAL_ROWS = {
  "3-1-4-2": [
    [0],            // GK
    [1, 2, 3],      // CB,CB,CB
    [4],            // CDM
    [5, 6, 7, 8],   // LM,CM,CM,RM
    [9, 10]         // ST,ST
  ],
  "3-4-1-2": [
    [0],
    [1, 2, 3],
    [4, 5, 6, 7],   // LM,CM,CM,RM
    [8],            // CAM
    [9, 10]
  ],
  "3-4-2-1": [
    [0],
    [1, 2, 3],
    [4, 5, 6, 7],   // LM,CM,CM,RM
    [8, 9],         // CAM,CAM
    [10]            // ST
  ],
  "3-4-3": [
    [0],
    [1, 2, 3],
    [4, 5, 6, 7],   // LM,CM,CM,RM
    [8, 9, 10]      // LW,ST,RW
  ],
  "3-5-2": [
    [0],
    [1, 2, 3],
    [4, 5, 6, 7, 8], // LM,CDM,CAM,CDM,RM
    [9, 10]
  ],

  "4-1-2-1-2": [
    [0],
    [1, 2, 3, 4],   // LB,CB,CB,RB
    [5],            // CDM
    [6, 8, 7],      // LM,CAM,RM
    [9, 10]
  ],
  "4-1-2-1-2 (2)": [
    [0],
    [1, 2, 3, 4],
    [5],            // CDM
    [6, 7],         // CM,CM
    [8],            // CAM
    [9, 10]
  ],
  "4-1-3-2": [
    [0],
    [1, 2, 3, 4],
    [5],            // CDM
    [6, 7, 8],      // LM,CM,RM
    [9, 10]
  ],
  "4-1-4-1": [
    [0],
    [1, 2, 3, 4],
    [5],            // CDM
    [6, 7, 8, 9],   // LM,CM,CM,RM
    [10]
  ],

  "4-2-1-3": [
    [0],
    [1, 2, 3, 4],
    [5, 6],         // CDM,CDM
    [7],            // CAM
    [8, 9, 10]      // LW,ST,RW
  ],
  "4-2-2-2": [
    [0],
    [1, 2, 3, 4],
    [5, 6],         // CDMs
    [7, 8],         // CAMs
    [9, 10]
  ],
  "4-2-3-1": [
    [0],
    [1, 2, 3, 4],
    [5, 6],         // CDMs
    [7, 8, 9],      // CAM,CAM,CAM
    [10]
  ],
  "4-2-3-1 (2)": [
    [0],
    [1, 2, 3, 4],
    [5, 6],         // CDMs
    [7, 8, 9],      // LM,CAM,RM
    [10]
  ],
  "4-2-4": [
    [0],
    [1, 2, 3, 4],
    [5, 6],         // CMs
    [7, 8, 9, 10]   // LW,ST,ST,RW
  ],

  "4-3-1-2": [
    [0],
    [1, 2, 3, 4],
    [5, 6, 7],      // CMs
    [8],            // CAM
    [9, 10]
  ],
  "4-3-2-1": [
    [0],
    [1, 2, 3, 4],
    [5, 6, 7],      // CMs
    [8, 9],         // CF,CF
    [10]            // ST
  ],
  "4-3-3": [
    [0],
    [1, 2, 3, 4],
    [5, 6, 7],      // CMs
    [8, 9, 10]      // LW,ST,RW
  ],
  "4-3-3 (2)": [
    [0],
    [1, 2, 3, 4],
    [5, 6, 7],      // CDM,CM,CM
    [8, 9, 10]
  ],
  "4-3-3 (3)": [
    [0],
    [1, 2, 3, 4],
    [5, 6, 7],      // CDM,CDM,CM
    [8, 9, 10]
  ],
  "4-3-3 (4)": [
    [0],
    [1, 2, 3, 4],
    [5, 6, 7],      // CM,CAM,CAM
    [8, 9, 10]
  ],

  "4-4-1-1 (2)": [
    [0],
    [1, 2, 3, 4],
    [5, 6, 7, 8],   // LM,CM,CM,RM
    [9],            // CF
    [10]
  ],
  "4-4-2": [
    [0],
    [1, 2, 3, 4],
    [5, 6, 7, 8],   // LM,CM,CM,RM
    [9, 10]
  ],
  "4-4-2 (2)": [
    [0],
    [1, 2, 3, 4],
    [5, 6, 7, 8],   // LM,CDM,CDM,RM
    [9, 10]
  ],
  "4-5-1": [
    [0],
    [1, 2, 3, 4],
    [5, 6, 8, 9],   // LM,CM,CM,RM
    [7],            // CAM
    [10]
  ],
  "4-5-1 (2)": [
    [0],
    [1, 2, 3, 4],
    [5, 6, 8, 9],   // LM,CDM,CDM,RM
    [7],            // CAM
    [10]
  ],

  "5-2-1-2": [
    [0],
    [1, 2, 3, 4, 5], // LWB,CB,CB,CB,RWB
    [6, 7],          // CMs
    [8],             // CAM
    [9, 10]
  ],
  "5-2-3": [
    [0],
    [1, 2, 3, 4, 5],
    [6, 7],          // CMs
    [8, 9, 10]       // LW,ST,RW
  ],
  "5-3-2": [
    [0],
    [1, 2, 3, 4, 5],
    [6, 7, 8],       // CMs
    [9, 10]
  ],
  "5-4-1": [
    [0],
    [1, 2, 3, 4, 5],
    [6, 7, 8, 9],    // LM,CM,CM,RM
    [10]
  ]
};

const FORMATION_INFO = {
  // 3-at-the-back
  "3-1-4-2": `Strengths: Very strong through the middle with a back three plus a screening CDM, good for patient build-up and countering central overloads. Weaknesses: Can be exposed in the wide channels if LM/RM don’t track back. Best used when you want two strikers up top and control of the middle third. Key players: Mobile, aggressive CBs; a disciplined CDM who reads play well; high-stamina LM/RM; one link-up ST and one runner in behind.`,
  "3-4-1-2": `Strengths: Central overload with a CAM behind two strikers, ideal for through balls and quick combinations. Weaknesses: Flanks can be vulnerable vs teams with very attacking fullbacks or wide wingers. Best used when you have a playmaking CAM and two complementary forwards. Key players: Ball-playing CBs, box-to-box CMs, creative CAM, one target ST and one pacey ST.`,
  "3-4-2-1": `Strengths: Very strong between the lines with two CAMs/CFs behind a lone ST, great for tiki-taka and short passing. Weaknesses: Only one true striker and no classic wingers, so crosses are less threatening. Best used when you have two creative attackers who like to drift and combine. Key players: Composed CBs, hardworking CM pair, two technical CAMs, a complete ST who can hold up and finish.`,
  "3-4-3": `Strengths: Super aggressive front three with wide forwards, great for pressing and fast transitions. Weaknesses: Midfield can be outnumbered and wingbacks must work hard both ways. Best used when you want to swarm the opponent’s back line and play direct. Key players: Fast LW/RW who can score, physical CBs, energetic CMs, clinical ST.`,
  "3-5-2": `Strengths: Massive control in midfield with five across and two STs, good for slow build-up or long spells of possession. Weaknesses: Width depends heavily on LM/RM; if they don’t track back, flanks are exposed. Best used when you have strong central players and want to dominate the middle. Key players: Stamina monsters at LM/RM, two-way CDMs, creative CAM, a target ST plus a runner.`,

  // 4-at-the-back, 4-1-x-x and 4-2-x-x shapes
  "4-1-2-1-2": `Strengths: Narrow diamond that overloads the center and supports two STs, good for quick one-twos and through balls. Weaknesses: Very little natural width, so you can struggle vs compact low blocks. Best used when your fullbacks like to bomb forward and your CAM is a star. Key players: Overlapping LB/RB, strong CDM, high-vision CAM, two strikers with good off-the-ball movement.`,
  "4-1-2-1-2 (2)": `Strengths: Even more compact diamond with CM/CM, great for short passing and central dominance. Weaknesses: Predictable if opponents clog the middle; relies on fullbacks for width. Best used with technically sound CMs and a creative CAM. Key players: Press-resistant CMs, smart CDM, playmaking CAM, versatile STs who can drop in.`,
  "4-1-3-2": `Strengths: Solid single pivot CDM behind an attacking three and two STs, good for pressing high and playing direct. Weaknesses: Only one holding mid, so counters through the middle can be dangerous. Best used when you trust your CDM and want numbers in attack. Key players: Strong CDM, balanced LM/RM, CAM/CM with vision, two aggressive strikers.`,
  "4-1-4-1": `Strengths: Very stable defensively with a CDM shielding the back four and a compact midfield line of four. Weaknesses: Lone ST can get isolated if wide players don’t join quickly. Best used when protecting a lead or playing vs stronger teams. Key players: Disciplined CDM, high-work-rate wide mids, box-to-box CMs, a complete ST who can hold up play.`,
  "4-2-1-3": `Strengths: Double pivot protects the back four while CAM and front three attack, great balance between defense and offense. Weaknesses: CAM can be crowded out if team doesn’t create wide overloads. Best used with quick wingers and a strong central CAM. Key players: Two intelligent CDMs, creative CAM, pacey LW/RW, clinical ST.`,
  "4-2-2-2": `Strengths: Very strong in central channels with two CAMs and two STs, good for intricate passing and central overloads. Weaknesses: Flanks can be open; you rely heavily on fullbacks for width. Best used when your fullbacks are very attacking and your CAMs are creative. Key players: Two disciplined CDMs, technical CAMs, overlapping LB/RB, two deadly finishers.`,
  "4-2-3-1": `Strengths: One of the most balanced shapes; double pivot for stability plus three attackers behind a ST. Great for possession or counter-attacks. Weaknesses: Wide CAMs must track back or fullbacks get overloaded. Best used when you have a standout CAM and versatile wide attackers. Key players: All-round CDM/CM pair, playmaking central CAM, agile wide CAMs, complete ST.`,
  "4-2-3-1 (2)": `Strengths: LM/RM + CAM behind a ST gives natural width and a central creator, good for crosses and cutbacks. Weaknesses: If LM/RM don’t work defensively, you can be stretched wide. Best used when you like to attack through the wings. Key players: Stamina-heavy wide mids, solid CDM duo, creative CAM, strong aerial ST.`,
  "4-2-4": `Strengths: Extremely aggressive with four forwards, ideal for all-out attack and late-game comebacks. Weaknesses: Midfield is thin; you’ll be vulnerable to counters and outnumbered centrally. Best used when chasing a goal or vs weaker opponents. Key players: Two high-energy CMs, fast LW/RW, poacher ST plus target ST.`,

  // 4-3-x-x
  "4-3-1-2": `Strengths: Three CMs plus a CAM behind two STs; strong centrally with a natural link between mid and attack. Weaknesses: No natural width, so fullbacks must push high. Best used when your midfielders are strong passers and can control tempo. Key players: One holding CM, two box-to-box CMs, creative CAM, two complementary strikers.`,
  "4-3-2-1": `Strengths: “Christmas tree” structure; two CFs behind a lone ST for heavy central overloads and intricate build-up. Weaknesses: Almost no width; can feel cramped versus low blocks
