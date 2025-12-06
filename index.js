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

/**
 * Permission helpers
 */

function hasManageGuildPermission(member) {
  if (!member || member.permissions == null) return false;

  try {
    // If it's already a PermissionsBitField-like object:
    if (typeof member.permissions.has === 'function') {
      return member.permissions.has(PermissionsBitField.Flags.ManageGuild);
    }

    // If it's a raw bitfield / bigint / number:
    const pb = new PermissionsBitField(member.permissions);
    return pb.has(PermissionsBitField.Flags.ManageGuild);
  } catch {
    return false;
  }
}

// Admins or roles with "captain", "manager", "owner", or "media" in the name
// These are allowed to assign/move/remove players, reset spots, set VC, etc.
function isManager(member) {
  if (!member) return false;

  if (hasManageGuildPermission(member)) return true;

  const managerKeywords = ['captain', 'manager', 'owner', 'media'];

  const roleCollection = member.roles?.cache
    ? [...member.roles.cache.values()]
    : Array.isArray(member.roles)
    ? member.roles
    : [];

  return roleCollection.some((role) => {
    const name = (role.name || '').toLowerCase();
    return managerKeywords.some((kw) => name.includes(kw));
  });
}

/**
 * Dynamic formations: definitions with metadata.
 */
const FORMATION_DEFINITIONS = [
  {
    formation_name: "4-5-1 ATTACK",
    formation_pattern: "4-5-1",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Overloads the midfield, providing exceptional passing triangles and ball retention capabilities.",
      weakness: "Relies heavily on the single ST and can lack direct penetration when the midfield is compact.",
      best_use: "Possession-based play against narrow defensive formations, forcing opponent fullbacks to commit high.",
      key_player_style: "High Passing/Vision CAMs; patient, controlled build-up play."
    }
  },
  {
    formation_name: "4-3-2-1",
    formation_pattern: "4-3-2-1",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attack/Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attack/Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Creates central attacking threats with three narrow forwards (CFs) and central midfield dominance.",
      weakness: "Vulnerable to wide attacks as the attacking players offer no natural width defensively.",
      best_use: "Counter-attacking or high-press strategy focusing play entirely through the middle.",
      key_player_style: "Quick, highly mobile attackers; central CMs must have high defensive work rates."
    }
  },
  {
    formation_name: "4-3-1-2",
    formation_pattern: "4-3-1-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attack/Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Excellent for 1-2 passing and quick combination play between the three attacking players (2 ST, 1 CAM).",
      weakness: "Zero natural width in attack, making it predictable if opponents defend centrally well.",
      best_use: "Exploiting center-back spacing and leveraging quick vertical passes from the CAM.",
      key_player_style: "Technically gifted CAM with high dribbling; fullbacks must provide width on attack."
    }
  },
  {
    formation_name: "4-3-3 FLAT",
    formation_pattern: "4-3-3",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "RW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Perfectly balanced structure with natural width in attack and three central midfielders for stability.",
      weakness: "Central defense can be exposed if the CMs push too high without a designated defensive anchor.",
      best_use: "All-around strategy, suitable for both short passing and quick breaks down the wings.",
      key_player_style: "Rapid Wingers for stretching the defense; CMs need balanced stats to cover attack and defense."
    }
  },
  {
    formation_name: "3-5-2",
    formation_pattern: "3-5-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Midfield" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Central defensive solidity with three CBs and midfield superiority due to five central players.",
      weakness: "Highly dependent on the LM/RM tracking back, as fullbacks are absent, creating large gaps out wide.",
      best_use: "Overwhelming the central opponent midfield and using LM/RM for crosses/cutbacks.",
      key_player_style: "LM/RM with high stamina and pace (work rate M/H or H/H); CAM linking the two strikers."
    }
  },
  {
    formation_name: "3-1-4-2",
    formation_pattern: "3-1-4-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "The single CDM acts as a crucial shield, while the 4-man midfield provides high attacking versatility and numbers.",
      weakness: "If the wingers (LM/RM) don't defend, the gaps between them and the CBs are huge.",
      best_use: "Attacking football where the two strikers and four midfielders constantly rotate positions.",
      key_player_style: "CDM must have high defensive work rate and tackling; STs should be good link-up players."
    }
  },
  {
    formation_name: "3-4-2-1",
    formation_pattern: "3-4-2-1",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attack/Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attack/Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Compact central diamond (2 CMs, 2 CAMs) for passing, with wingers providing immediate crossing options.",
      weakness: "The CMs can be exposed to central pressure, lacking a dedicated CDM anchor.",
      best_use: "High-pressure offense, pushing the two CAMs into 'false nine' positions to support the ST.",
      key_player_style: "CAMs with good shooting ability; CMs need stamina to support the defensive line."
    }
  },
  {
    formation_name: "3-4-1-2",
    formation_pattern: "3-4-1-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attack/Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Central congestion and two strikers create constant overloads and short passing options in the final third.",
      weakness: "Relies entirely on the LM/RM to cover the flanks, leaving the wide CBs vulnerable on counters.",
      best_use: "Aggressive, high-tempo attack aimed at scoring quick goals and maintaining pressure.",
      key_player_style: "CAM with high agility and balance to distribute the ball quickly to the two STs."
    }
  },
  {
    formation_name: "3-4-3 FLAT",
    formation_pattern: "3-4-3",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "LW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "RW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Maximizes attacking width with three dedicated attackers and two wide midfielders creating five forward threats.",
      weakness: "The two central midfielders are easily overrun by formations with three CMs or a dedicated CDM.",
      best_use: "Against defensive opponents where high pressure and crossing are vital to break down the defense.",
      key_player_style: "Wingers (LW/RW) with high pace and crossing ability; CBs must be fast to cover wide runs."
    }
  },
  {
    formation_name: "4-2-2-2",
    formation_pattern: "4-2-2-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attacking Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attacking Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Extremely balanced and meta-friendly, using two CDMs for defense and two wide CAMs for attack and recovery.",
      weakness: "If the wide CAMs fail to track back, the fullbacks are constantly double-teamed defensively.",
      best_use: "Overall stability and versatility, facilitating both quick counter-attacks and disciplined defense.",
      key_player_style: "CDMs with high defensive awareness; wide CAMs (RM/LM roles) must be pacey."
    }
  },
  {
    formation_name: "4-5-1 FLAT",
    formation_pattern: "4-5-1",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Midfield possession machine that minimizes central space for the opponent and ensures defensive cover.",
      weakness: "Very slow to transition into attack due to the deep midfield line and reliance on a lone striker.",
      best_use: "Controlling the tempo, neutralizing high-press teams, and maintaining a high percentage of possession.",
      key_player_style: "High-dribbling/control ST; central CMs must have high passing ability."
    }
  },
  {
    formation_name: "4-1-2-1-2 WIDE",
    formation_pattern: "4-1-2-1-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attacking Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Combines central penetration with immediate wide options from the LM/RM for crosses.",
      weakness: "The two wide midfielders (LM/RM) can be easily isolated, leading to defensive confusion on the flanks.",
      best_use: "Balanced approach, quickly moving the ball wide after winning it in the central midfield zone.",
      key_player_style: "CDM is the defensive linchpin; LM/RM must have high pace and good passing range."
    }
  },
  {
    formation_name: "4-1-2-1-2 NARROW",
    formation_pattern: "4-1-2-1-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attacking Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Highly meta-relevant due to central defensive compactness and rapid combination play between the CMs, CAM, and STs.",
      weakness: "Provides zero attacking width, relying solely on fullbacks for crossing and stretching the opponent.",
      best_use: "Quick, vertical, central tiki-taka passing and through-balls to the two strikers.",
      key_player_style: "Fullbacks with pace and high offensive work rates; all central players need high agility."
    }
  },
  {
    formation_name: "4-4-2 FLAT",
    formation_pattern: "4-4-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Simple, defensively sound structure where lines are rarely broken, providing clear defensive assignments.",
      weakness: "The gap between the midfield and two strikers can be large, isolating the attack.",
      best_use: "Holding a lead or playing defensively compact, forcing the opponent wide to cross.",
      key_player_style: "Balanced CMs for cover; one ST for link-up, the other for runs in behind."
    }
  },
  {
    formation_name: "4-3-3 HOLDING",
    formation_pattern: "4-3-3",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "RW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "The CDM offers superb protection for the back four, making it difficult to pass through the center.",
      weakness: "The two CMs are primarily box-to-box, potentially leaving the CDM isolated if they push too high.",
      best_use: "Defensively sound play with quick release to the wingers for fast counter-attacks.",
      key_player_style: "High Defensive Awareness CDM; high pace LW/RW."
    }
  },
  {
    formation_name: "4-4-1-1 MIDFIELD",
    formation_pattern: "4-4-1-1",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attacking Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "The CAM links the deep midfield four to the single striker perfectly, facilitating smooth transitions.",
      weakness: "The single ST can be easily neutralized, making goal scoring dependent on the CAM's shooting or the wingers' crosses.",
      best_use: "Balanced control; effective at overloading the flanks and using the CAM to play through balls.",
      key_player_style: "Technically creative CAM; ST with high positioning and finishing."
    }
  },
  {
    formation_name: "4-2-4",
    formation_pattern: "4-2-4",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LW", role: "Winger", spatial_location: "Attack/Midfield" },
      { abbreviation: "RW", role: "Winger", spatial_location: "Attack/Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Ultimate attacking formation, creating massive overloads with four forward players and immediate pressure on the opponent's defense.",
      weakness: "Only two central midfielders, leaving the back four extremely exposed to quick central counter-attacks.",
      best_use: "When chasing a deficit or playing against a very passive defense to maintain constant pressure.",
      key_player_style: "High-stamina CMs to cover space; all four attackers must be pacey finishers."
    }
  },
  {
    formation_name: "4-4-2 HOLDING",
    formation_pattern: "4-4-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Incredible central defensive solidity and pressing capability with two CDMs and a tight defensive line.",
      weakness: "Lack of creative midfield roles (no CAM), relying only on wingers and strikers for offense.",
      best_use: "Countering narrow formations (like 4-1-2-1-2 Narrow) and suffocating central passing lanes.",
      key_player_style: "CDMs with high physical stats and tackling; pacey STs for quick breaks."
    }
  },
  {
    formation_name: "4-3-3 DEFEND",
    formation_pattern: "4-3-3",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "RW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Features two CDMs for an unbreakable defensive spine, making it highly secure against central threats.",
      weakness: "The two CDMs can struggle to provide sufficient support for the single CM in link-up play.",
      best_use: "Maintaining a lead or playing defensively against skilled central attackers.",
      key_player_style: "CM needs excellent passing to bypass the CDMs and reach the front three; CDMs must have high defensive work rates."
    }
  },
  {
    formation_name: "4-2-1-3",
    formation_pattern: "4-2-1-3",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attacking Midfield" },
      { abbreviation: "LW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "RW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Optimal structure for defense (2 CDMs) and attack (1 CAM, 3 Forwards), creating a clear separation of duties.",
      weakness: "The midfield area between the CAM and CDMs can become isolated if they don't manually cover the space.",
      best_use: "High-powered offense delivered through the flanks, supported by the CAM for central incision.",
      key_player_style: "The CAM must be the primary creator; Wingers and ST need pace and clinical finishing."
    }
  },
  {
    formation_name: "5-4-1 FLAT",
    formation_pattern: "5-4-1",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "The most defensively secure formation with a five-man back line and five midfielders/wingers providing cover.",
      weakness: "Extremely passive in attack, relying on slow build-up or long balls to the single, isolated striker.",
      best_use: "Protecting a late lead, time-wasting, or against opponents with two highly threatening strikers.",
      key_player_style: "CBs must have good passing stats to transition; ST needs strength and jumping for hold-up play."
    }
  },
  {
    formation_name: "5-2-1-2",
    formation_pattern: "5-2-1-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attacking Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Provides defensive structure (5-back) while offering central attacking prowess through the CAM and two STs.",
      weakness: "Limited central midfield options, making it vulnerable to opponent passing through the middle third.",
      best_use: "Counter-attacking, using the fullbacks/wingbacks (LB/RB) to fly up the flanks and cross to the two strikers.",
      key_player_style: "High-stamina Fullbacks for covering the entire flank; CAM must have good vision."
    }
  },
  {
    formation_name: "4-1-3-2",
    formation_pattern: "4-1-3-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "The three-man midfield line (LM, CM, RM) can overwhelm the opponent's center, while the CDM protects the defense.",
      weakness: "The single CM is left to cover a massive amount of central space alone.",
      best_use: "Dominating the wide midfield areas and quickly feeding the ball to the two strikers.",
      key_player_style: "CDM needs high defensive work rate; LM/RM should have excellent crossing and cutback skills."
    }
  },
  {
    formation_name: "4-3-3 ATTACK",
    formation_pattern: "4-3-3",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Wingback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Wingback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Playmaker Build-Up", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Playmaker Defend", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker Roaming", spatial_location: "Midfield" },
      { abbreviation: "LW", role: "Winger Attack", spatial_location: "Attack" },
      { abbreviation: "RW", role: "Winger Versatile", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Get Forward Attack", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "The dedicated attacking roles and high positioning of the central three create constant vertical threat.",
      weakness: "Only two CBs at the back with attacking fullbacks, leaving big spaces in the defensive wide areas.",
      best_use: "High-risk, high-reward attacking football, best suited for skilled players who can utilize custom tactics and player runs.",
      key_player_style: "CAM must be the team's primary Playmaker; all forward players need high finishing and pace."
    }
  },
  {
    formation_name: "4-2-3-1 WIDE",
    formation_pattern: "4-2-3-1",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attacking Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Excellent meta balance, using two CDMs for security, a CAM for creativity, and wide midfielders for flanking attacks.",
      weakness: "The front four (LM, CAM, RM, ST) can be isolated if the CDMs are slow to release the ball forward.",
      best_use: "Controlling the game, dictating tempo, and launching attacks down the wings.",
      key_player_style: "CDMs should be defensive masters; CAM needs high passing and long-shot capability."
    }
  },
  {
    formation_name: "4-2-3-1 NARROW",
    formation_pattern: "4-2-3-1",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attacking Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attacking Midfield" },
      { abbreviation: "CAM", role: "Playmaker", spatial_location: "Attacking Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Massive central passing options with four attacking players close to the ST, allowing for intricate combination play.",
      weakness: "Complete lack of width, making it easy for the opponent to defend by shifting their defense laterally.",
      best_use: "Attacking possession strategy, constantly passing short and using through balls to the lone striker.",
      key_player_style: "Fullbacks must be set to overlap; central CAMs need high dribbling and movement."
    }
  },
  {
    formation_name: "5-3-2 HOLDING",
    formation_pattern: "5-3-2",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Maximum defensive security (5-back + 1 CDM) ensures the entire central pitch is covered defensively.",
      weakness: "The two CMs are heavily burdened with both attacking and defensive duties on the flanks.",
      best_use: "Counter-attacking with pacey strikers and disciplined defense against top-tier opponents.",
      key_player_style: "High passing/vision CDM to launch quick counter-attacks; STs with pace."
    }
  },
  {
    formation_name: "4-1-4-1",
    formation_pattern: "4-1-4-1",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CDM", role: "Holding", spatial_location: "Defensive Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "RM", role: "Winger", spatial_location: "Midfield" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "Solid defensive block with a dedicated CDM and four midfielders creating two lines of four in defense.",
      weakness: "The single striker lacks immediate support from the midfield, leading to slow offensive pressure.",
      best_use: "Maintaining defensive shape and patiently building possession through the central midfield.",
      key_player_style: "CDM with high defensive work rate; Wingers (LM/RM) need high stamina for defense and attack."
    }
  },
  {
    formation_name: "5-2-3",
    formation_pattern: "5-2-3",
    positions: [
      { abbreviation: "GK", role: "Goalkeeper", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "CB", role: "Defender", spatial_location: "Defense" },
      { abbreviation: "LB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "RB", role: "Fullback", spatial_location: "Defense" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "CM", role: "Box-to-Box", spatial_location: "Midfield" },
      { abbreviation: "LW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "RW", role: "Winger", spatial_location: "Attack" },
      { abbreviation: "ST", role: "Advanced Forward", spatial_location: "Attack" }
    ],
    meta_analysis: {
      strength: "The three-man attack ensures high pressure on the opponent's back line, supported by a solid five-man defense.",
      weakness: "Only two CMs means the midfield can be easily bypassed or overrun by three-man central midfield systems.",
      best_use: "Wing-play focused attacks, using the fullbacks and wingers to deliver balls to the striker.",
      key_player_style: "Fullbacks/Wingbacks (LB/RB) with pace and good crossing; CMs need high defensive work rates."
    }
  }
];

// Derived: name -> position abbreviations
const FORMATION_POSITIONS = {};
// Derived: name -> formatted meta info string
const FORMATION_INFO = {};

for (const def of FORMATION_DEFINITIONS) {
  const name = def.formation_name;
  FORMATION_POSITIONS[name] = def.positions.map((p) => p.abbreviation);

  const meta = def.meta_analysis || {};
  const parts = [
    meta.strength ? `Strengths: ${meta.strength}` : '',
    meta.weakness ? `Weaknesses: ${meta.weakness}` : '',
    meta.best_use ? `Best used: ${meta.best_use}` : '',
    meta.key_player_style ? `Key players: ${meta.key_player_style}` : ''
  ].filter(Boolean);

  FORMATION_INFO[name] = parts.join('\n');
}

// Default formation must exist in FORMATION_POSITIONS
const DEFAULT_FORMATION = "4-3-3 FLAT";

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

// ---------- HELPERS ----------

function formatFormationInfo(info) {
  if (!info) return '';

  let txt = info.trim();
  txt = txt.replace(/Strengths:/, '**Strengths:**');
  txt = txt.replace(/Weaknesses:/, '\n**Weaknesses:**');
  txt = txt.replace(/Best used/g, '\n**Best used**');
  txt = txt.replace(/Key players:/, '\n**Key players:**');
  return txt;
}

function getPositionGroup(label) {
  const upper = (label || '').toUpperCase();

  if (upper === 'GK') return 'GK';
  if (upper === 'CB') return 'CB';
  if (['LB', 'RB', 'LWB', 'RWB'].includes(upper)) return 'FB';
  if (upper === 'CDM') return 'CDM';
  if (upper === 'CM') return 'CM';
  if (['CAM', 'CF'].includes(upper)) return 'CAM';
  if (['LM', 'RM'].includes(upper)) return 'WM';
  if (['LW', 'RW'].includes(upper)) return 'WING';
  if (upper === 'ST') return 'ST';

  return 'OTHER';
}

// ---------- PER-GUILD STATE HELPERS ----------

function cloneDefaultClubs() {
  return DEFAULT_CLUBS.map((c) => ({ ...c }));
}

function createEmptyBoardForFormation(formationName) {
  const positions =
    FORMATION_POSITIONS[formationName] ||
    FORMATION_POSITIONS[DEFAULT_FORMATION];

  return {
    formation: formationName,
    slots: positions.map((label) => ({
      label,
      open: true,
      takenBy: null,
      waiters: [] // users to DM when this spot opens
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

function getVcPanelByMessage(state, messageId) {
  if (!state.vcPanels) return null;
  for (const [vcId, panel] of Object.entries(state.vcPanels)) {
    if (panel && panel.messageId === messageId) {
      return { vcId, panel };
    }
  }
  return null;
}

// ---------- UI BUILDERS ----------

function buildEmbedForClub(guildId, clubKey) {
  const state = getGuildState(guildId);
  if (!state) throw new Error('No state for guild');

  const { clubs, boardState, clubVcLinks } = state;
  const club = getClubByKey(clubs, clubKey);
  if (!club) throw new Error(`Unknown club key: ${clubKey}`);

  const clubBoard = boardState[clubKey];
  if (!clubBoard) throw new Error(`No board state for club key: ${clubKey}`);

  const lines = [];
  for (let i = clubBoard.slots.length - 1; i >= 0; i--) {
    const slot = clubBoard.slots[i];
    const emoji = slot.open ? '🟢' : '🔴';

    let text;
    if (slot.open) {
      text = 'OPEN';
    } else if (slot.takenBy) {
      if (slot.takenBy === '__NOT_IN_VC__') {
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
        'Players: click a spot to claim. Managers can use Player Tools / Club Tools to manage spots and clubs.'
    });

  const rawInfo = FORMATION_INFO[clubBoard.formation];
  if (rawInfo) {
    const formatted = formatFormationInfo(rawInfo);
    const value =
      formatted.length > 1024 ? formatted.slice(0, 1021) + '...' : formatted;

    embed.addFields({
      name: 'Formation notes',
      value
    });
  }

  return embed;
}

function buildButtons(guildId, clubKey) {
  const state = getGuildState(guildId);
  const { boardState } = state;
  const clubBoard = boardState[clubKey];

  const rows = [];
  let currentRow = new ActionRowBuilder();

  for (let i = clubBoard.slots.length - 1; i >= 0; i--) {
    const slot = clubBoard.slots[i];

    const button = new ButtonBuilder()
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

function buildAdminComponents(guildId, clubKey) {
  const clubRow = buildClubSelect(guildId, clubKey);

  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`formation_menu_${clubKey}`)
      .setLabel('Formation')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`player_tools_${clubKey}`)
      .setLabel('Player Tools')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`club_tools_${clubKey}`)
      .setLabel('Club Tools')
      .setStyle(ButtonStyle.Secondary)
  );

  const buttonRows = buildButtons(guildId, clubKey);

  return [clubRow, controlRow, ...buttonRows.slice(0, 3)];
}

// ---------- PANEL REFRESH & STATE OPS ----------

async function refreshClubPanels(guildId, clubKey) {
  const state = getGuildState(guildId);
  if (!state) return;

  if (
    state.adminPanelChannelId &&
    state.adminPanelMessageId &&
    state.currentClubKey === clubKey
  ) {
    try {
      const channel = await client.channels.fetch(state.adminPanelChannelId);
      if (!channel) {
        state.adminPanelChannelId = null;
        state.adminPanelMessageId = null;
      } else {
        const msg = await channel.messages.fetch(state.adminPanelMessageId);
        await msg.edit({
          embeds: [buildEmbedForClub(guildId, clubKey)],
          components: buildAdminComponents(guildId, clubKey)
        });
      }
    } catch (err) {
      if (err.code === 10008 || err.code === 50001) {
        state.adminPanelChannelId = null;
        state.adminPanelMessageId = null;
      } else {
        console.error('⚠️ Failed to update admin panel after state change:', err);
      }
    }
  }

  if (state.vcPanels) {
    for (const [vcId, panel] of Object.entries(state.vcPanels)) {
      if (!panel || panel.clubKey !== clubKey) continue;

      try {
        const channel = await client.channels.fetch(panel.textChannelId);
        if (!channel) {
          delete state.vcPanels[vcId];
          continue;
        }

        const msg = await channel.messages.fetch(panel.messageId);
        await msg.edit({
          embeds: [buildEmbedForClub(guildId, clubKey)],
          components: buildAdminComponents(guildId, clubKey)
        });
      } catch (err) {
        if (err.code === 10008 || err.code === 50001) {
          delete state.vcPanels[vcId];
        } else {
          console.error(
            `⚠️ Failed to update VC panel for voice channel ${vcId} after state change:`,
            err
          );
        }
      }
    }
  }
}

function resetClubSpots(boardState, clubKey) {
  const clubBoard = boardState[clubKey];
  if (!clubBoard) return;
  clubBoard.slots.forEach((slot) => {
    slot.open = true;
    slot.takenBy = null;
    slot.waiters = [];
  });
}

async function notifySlotWaiters(guildId, clubKey, slotIndex) {
  const state = getGuildState(guildId);
  if (!state) return;

  const guild = await client.guilds.fetch(guildId).catch(() => null);
  const clubBoard = state.boardState[clubKey];
  if (!clubBoard) return;

  const slot = clubBoard.slots[slotIndex];
  if (!slot || !Array.isArray(slot.waiters) || slot.waiters.length === 0) return;

  const club = getClubByKey(state.clubs, clubKey);
  const waiters = [...slot.waiters];
  slot.waiters = [];

  for (const userId of waiters) {
    try {
      const user = await client.users.fetch(userId);
      await user.send(
        `Good news! In **${guild ? guild.name : 'this server'}**, club **${
          club ? club.name : clubKey
        }**, the **${slot.label}** spot just opened up. Go claim it in the spots panel.`
      );
    } catch (err) {
      if (err.code !== 50007) {
        console.error(`⚠️ Failed to DM user ${userId} about open spot:`, err);
      }
    }
  }
}

// ---------- INTERACTION HELPERS ----------

async function startAssignFromVc(interaction, state, clubKey) {
  if (!isManager(interaction.member)) {
    return interaction.reply({
      content:
        'Only captains, managers, owners, media, or admins can use the Player Tools menu.',
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

  const memberOptions = members.map((m) => ({
    label: m.displayName || m.user.username,
    value: m.id
  }));

  const options = memberOptions.slice(0, 24);
  options.push({
    label: 'Player not in VC (placeholder)',
    value: '__NOT_IN_VC__',
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

async function startManagePlayers(interaction, state, clubKey) {
  if (!isManager(interaction.member)) {
    return interaction.reply({
      content:
        'Only captains, managers, owners, media, or admins can use the Player Tools menu.',
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

  const seen = new Set();
  const options = [];

  for (const slot of clubBoard.slots) {
    if (slot.open || !slot.takenBy) continue;
    const userId = slot.takenBy;

    if (userId === '__NOT_IN_VC__') {
      if (seen.has(userId)) continue;
      seen.add(userId);
      options.push({
        label: 'Player not in VC (placeholder)',
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
      // ignore
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

async function startSetClubVc(interaction, state, clubKey) {
  if (!isManager(interaction.member)) {
    return interaction.reply({
      content:
        'Only captains, managers, owners, media, or admins can use the Player Tools menu.',
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

async function doResetSpots(interaction, state, guildId, clubKey) {
  if (!isManager(interaction.member)) {
    return interaction.reply({
      content:
        'Only captains, managers, owners, media, or admins can use the Player Tools menu.',
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

async function setClubFormation(interaction, guildId, clubKey, formationName) {
  const state = getGuildState(guildId);
  if (!state) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Guild state not found.',
        ephemeral: true
      });
    }
    return;
  }

  const positions = FORMATION_POSITIONS[formationName];
  if (!positions) {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({
        content: 'Unknown formation.',
        ephemeral: true
      });
    }
    return;
  }

  if (!interaction.deferred && !interaction.replied) {
    try {
      await interaction.deferUpdate();
    } catch (err) {
      console.error('⚠️ Error deferring formation change interaction:', err);
    }
  }

  const oldBoard = state.boardState[clubKey];
  const oldSlots = oldBoard?.slots || [];

  const occupants = [];
  for (const slot of oldSlots) {
    if (!slot || slot.open || !slot.takenBy) continue;
    occupants.push({
      playerId: slot.takenBy,
      label: slot.label,
      group: getPositionGroup(slot.label)
    });
  }

  const newBoard = {
    formation: formationName,
    slots: positions.map((label) => ({
      label,
      open: true,
      takenBy: null,
      waiters: []
    }))
  };

  const newSlots = newBoard.slots;
  const usedIndices = new Set();

  const groupOrder = ['GK', 'CB', 'FB', 'CDM', 'CM', 'CAM', 'WM', 'WING', 'ST', 'OTHER'];
  const groupPriority = {};
  groupOrder.forEach((g, i) => {
    groupPriority[g] = i;
  });

  occupants.sort((a, b) => {
    const pa = groupPriority[a.group] ?? 999;
    const pb = groupPriority[b.group] ?? 999;
    return pa - pb;
  });

  function findExactIndex(label) {
    for (let i = 0; i < newSlots.length; i++) {
      if (usedIndices.has(i)) continue;
      if (newSlots[i].label === label) return i;
    }
    return -1;
  }

  function findGroupIndex(group) {
    for (let i = 0; i < newSlots.length; i++) {
      if (usedIndices.has(i)) continue;
      if (getPositionGroup(newSlots[i].label) === group) return i;
    }
    return -1;
  }

  function findAnyIndex() {
    for (let i = 0; i < newSlots.length; i++) {
      if (!usedIndices.has(i)) return i;
    }
    return -1;
  }

  for (const occ of occupants) {
    let idx = findExactIndex(occ.label);
    if (idx === -1 && occ.group) {
      idx = findGroupIndex(occ.group);
    }
    if (idx === -1) {
      idx = findAnyIndex();
    }

    if (idx !== -1) {
      newSlots[idx].open = false;
      newSlots[idx].takenBy = occ.playerId;
      usedIndices.add(idx);
    }
  }

  const oldVcId = state.clubVcLinks?.[clubKey] || null;

  state.boardState[clubKey] = newBoard;
  if (!state.clubVcLinks) state.clubVcLinks = {};
  state.clubVcLinks[clubKey] = oldVcId;

  try {
    await refreshClubPanels(guildId, clubKey);
  } catch (err) {
    console.error('⚠️ Error refreshing panels after formation change:', err);
  }

  try {
    await interaction.followUp({
      content: `Formation for this club is now **${formationName}**. Current players were moved into the closest matching spots.`,
      ephemeral: true
    });
  } catch (err) {
    if (err.code !== 10062) {
      console.error('⚠️ Error sending formation change follow-up:', err);
    }
  }
}

// ---------- READY & COMMAND REG ----------

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  console.log(`✅ App ID: ${c.application.id}`);

  try {
    await c.application.commands.set(COMMANDS);
    console.log('✅ Global commands registered for all servers');

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

client.on(Events.GuildCreate, async (guild) => {
  try {
    if (!client.application?.commands) return;
    await client.application.commands.set(COMMANDS, guild.id);
    console.log(`✅ Commands registered in newly joined guild ${guild.name} (${guild.id})`);
  } catch (err) {
    console.error('⚠️ Failed to register commands in new guild', guild.id, err);
  }
});

// ---------- MAIN INTERACTION HANDLER ----------

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    const guildId = interaction.guildId;
    if (!guildId) return;

    const state = getGuildState(guildId);
    if (!state) return;

    const { clubs, boardState } = state;

    // ----- Slash Commands -----
    if (interaction.isChatInputCommand()) {
      const cmd = interaction.commandName;

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

      // Player Tools menu (manager-only)
      if (id.startsWith('player_tools_')) {
        const clubKey = id.substring('player_tools_'.length);

        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can use the Player Tools menu.',
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
            },
            {
              label: 'Set voice channel for this club',
              value: 'set_vc'
            },
            {
              label: 'Refresh panel',
              value: 'refresh'
            },
            {
              label: 'Help / command list',
              value: 'help'
            }
          );

        const row = new ActionRowBuilder().addComponents(select);

        return interaction.reply({
          content: 'Player tools:',
          components: [row],
          ephemeral: true
        });
      }

      // Club Tools menu (manager-only)
      if (id.startsWith('club_tools_')) {
        const clubKey = id.substring('club_tools_'.length);

        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can use the Club Tools menu.',
            ephemeral: true
          });
        }

        const select = new StringSelectMenuBuilder()
          .setCustomId(`club_tools_select_${clubKey}`)
          .setPlaceholder('Choose a club tool')
          .addOptions(
            {
              label: 'Rename this club',
              value: 'rename_club'
            },
            {
              label: 'Add a new club',
              value: 'add_club'
            },
            {
              label: 'Remove this club',
              value: 'remove_club'
            },
            {
              label: 'Refresh panel',
              value: 'refresh'
            }
          );

        const row = new ActionRowBuilder().addComponents(select);

        return interaction.reply({
          content: 'Club tools:',
          components: [row],
          ephemeral: true
        });
      }

      // Formation menu button (open to everyone)
      if (id.startsWith('formation_menu_')) {
        const clubKey = id.substring('formation_menu_'.length);

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
            'Choose a formation. Current players will be moved into the closest matching spots.',
          components: rows,
          ephemeral: true
        });
      }

      // Waitlist DM buttons
      if (id === 'wait_slot_cancel') {
        return interaction.update({
          content: 'Okay, I won’t track that spot.',
          components: []
        });
      }

      if (id.startsWith('wait_slot_')) {
        const parts = id.split('_');
        const clubKey = parts[2];
        const slotIndex = parseInt(parts[3], 10);
        const userId = interaction.user.id;

        const clubBoard = stateBtn.boardState[clubKey];
        if (!clubBoard || !clubBoard.slots[slotIndex]) {
          return interaction.update({
            content: 'That spot no longer exists.',
            components: []
          });
        }

        const slot = clubBoard.slots[slotIndex];

        if (slot.open) {
          return interaction.update({
            content:
              'That spot just opened up while you were clicking. Check the panel and claim it!',
            components: []
          });
        }

        if (!Array.isArray(slot.waiters)) {
          slot.waiters = [];
        }

        if (slot.waiters.includes(userId)) {
          return interaction.update({
            content:
              'You’re already on the notification list for that spot. I’ll DM you when it opens.',
            components: []
          });
        }

        slot.waiters.push(userId);

        return interaction.update({
          content: `Got it. I’ll DM you when **${slot.label}** opens up.`,
          components: []
        });
      }

      // Player self-claim/free spot
      if (id.startsWith('pos_')) {
        const parts = id.split('_');
        const clubKey = parts[1];
        const index = parseInt(parts[2], 10);

        const clubBoard = boardStateBtn[clubKey];
        if (!clubBoard || !clubBoard.slots[index]) {
          return;
        }

        const slot = clubBoard.slots[index];

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
              // ignore
            }

            return interaction.reply({
              content: `This panel is linked to voice channel **${
                vcChannel ? vcChannel.name : vcId
              }**. Join that voice channel to claim or free a spot.`,
              ephemeral: true
            });
          }
        } else {
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
          for (let i = 0; i < clubBoard.slots.length; i++) {
            const s = clubBoard.slots[i];
            if (s.takenBy === userId) {
              s.open = true;
              s.takenBy = null;
              await notifySlotWaiters(guildIdBtn, clubKey, i);
            }
          }
          slot.open = false;
          slot.takenBy = userId;
        } else {
          if (slot.takenBy === userId) {
            slot.open = true;
            slot.takenBy = null;
            await notifySlotWaiters(guildIdBtn, clubKey, index);
          } else {
            const notifyBtn = new ButtonBuilder()
              .setCustomId(`wait_slot_${clubKey}_${index}`)
              .setLabel('Notify me when this spot opens')
              .setStyle(ButtonStyle.Primary);

            const cancelBtn = new ButtonBuilder()
              .setCustomId('wait_slot_cancel')
              .setLabel('Cancel')
              .setStyle(ButtonStyle.Secondary);

            const row = new ActionRowBuilder().addComponents(
              notifyBtn,
              cancelBtn
            );

            return interaction.reply({
              content:
                'That spot is already taken. I can DM you when it opens up if you like.',
              components: [row],
              ephemeral: true
            });
          }
        }

        await interaction.deferUpdate();
        await refreshClubPanels(guildIdBtn, clubKey);
        return;
      }
    }

    // ----- Modals -----
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;

      if (id.startsWith('rename_club_modal_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can rename clubs.',
            ephemeral: true
          });
        }

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

    // ----- Dropdowns -----
    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;
      const guildIdSel = interaction.guildId;
      const stateSel = getGuildState(guildIdSel);
      if (!stateSel) return;

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

        const vcPanelInfo = getVcPanelByMessage(stateSel, interaction.message.id);
        if (vcPanelInfo) {
          vcPanelInfo.panel.clubKey = selectedKey;
        }

        return interaction.update({
          embeds: [buildEmbedForClub(guildIdSel, selectedKey)],
          components: buildAdminComponents(guildIdSel, selectedKey)
        });
      }

      // Player Tools menu actions
      if (id.startsWith('player_tools_select_')) {
        const clubKey = id.substring('player_tools_select_'.length);
        const choice = interaction.values[0];

        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can use the Player Tools menu.',
            ephemeral: true
          });
        }

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
        if (choice === 'refresh') {
          await refreshClubPanels(guildIdSel, clubKey);
          return interaction.update({
            content: 'Panel refreshed.',
            components: []
          });
        }
        if (choice === 'help') {
          return interaction.update({
            content:
              'Commands:\n' +
              '• `/spotpanel` – create the global control panel\n' +
              '• `/spots` – read-only viewer board\n' +
              '• `/vcspots` – link a club to your current VC and show a live panel\n\n' +
              'From the **Player Tools** menu you can assign players from VC, manage players, reset spots, set the linked VC, and refresh panels.\n' +
              'From the **Club Tools** menu you can rename/add/remove clubs and refresh the panel.',
            components: []
          });
        }
        return;
      }

      // Club Tools menu actions
      if (id.startsWith('club_tools_select_')) {
        const clubKey = id.substring('club_tools_select_'.length);
        const choice = interaction.values[0];

        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can use the Club Tools menu.',
            ephemeral: true
          });
        }

        if (choice === 'rename_club') {
          const currentClub = getClubByKey(stateSel.clubs, clubKey);
          if (!currentClub) {
            return interaction.update({
              content: 'Current club not found.',
              components: []
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

        if (choice === 'add_club') {
          const disabledClub = stateSel.clubs.find((c) => !c.enabled);
          if (!disabledClub) {
            return interaction.update({
              content: 'All available club slots are already in use (max 5).',
              components: []
            });
          }

          disabledClub.enabled = true;
          stateSel.boardState[disabledClub.key] =
            createEmptyBoardForFormation(DEFAULT_FORMATION);
          if (!stateSel.clubVcLinks) stateSel.clubVcLinks = {};
          stateSel.clubVcLinks[disabledClub.key] = null;

          stateSel.currentClubKey = disabledClub.key;

          await refreshClubPanels(guildIdSel, disabledClub.key);

          return interaction.update({
            content: `Added a new club slot: **${disabledClub.name}**. Use the **Formation** and **Club Tools** buttons to configure it.`,
            components: []
          });
        }

        if (choice === 'remove_club') {
          const currentClub = getClubByKey(stateSel.clubs, clubKey);
          if (!currentClub || !currentClub.enabled) {
            return interaction.update({
              content: 'This club cannot be removed.',
              components: []
            });
          }

          const enabledCount = stateSel.clubs.filter((c) => c.enabled).length;
          if (enabledCount <= 1) {
            return interaction.update({
              content: 'You must keep at least one club enabled.',
              components: []
            });
          }

          const clubBoard = stateSel.boardState[clubKey];
          if (clubBoard && clubBoard.slots) {
            const hasTaken = clubBoard.slots.some((slot) => !slot.open);
            if (hasTaken) {
              return interaction.update({
                content:
                  'This club still has taken spots. Free all spots first before removing it.',
                components: []
              });
            }
          }

          currentClub.enabled = false;
          resetClubSpots(stateSel.boardState, clubKey);
          if (stateSel.clubVcLinks) {
            stateSel.clubVcLinks[clubKey] = null;
          }

          if (stateSel.currentClubKey === clubKey) {
            const firstEnabled = stateSel.clubs.find((c) => c.enabled);
            if (firstEnabled) stateSel.currentClubKey = firstEnabled.key;
          }

          await refreshClubPanels(guildIdSel, stateSel.currentClubKey);

          return interaction.update({
            content: `Removed club **${currentClub.name}**. Panels may need to be recreated to reflect this change.`,
            components: []
          });
        }

        if (choice === 'refresh') {
          await refreshClubPanels(guildIdSel, clubKey);
          return interaction.update({
            content: 'Panel refreshed.',
            components: []
          });
        }

        return;
      }

      // Set VC select
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

      // Assign: pick player (manager-only)
      if (id.startsWith('assign_player_pick_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can use the Player Tools menu.',
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

        const posSelect = new StringSelectMenuBuilder()
          .setCustomId(`assign_player_pos_${clubKey}_${userId}`)
          .setPlaceholder('Pick a spot')
          .addOptions(options);

        const row = new ActionRowBuilder().addComponents(posSelect);

        return interaction.update({
          content: `Now pick a spot for ${
            userId === '__NOT_IN_VC__' ? 'a player not in VC (placeholder)' : `<@${userId}>`
          } in **${club.name}**:`,
          components: [row]
        });
      }

      // Assign: pick slot (manager-only)
      if (id.startsWith('assign_player_pos_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can use the Player Tools menu.',
            ephemeral: true
          });
        }

        const parts = id.split('_');
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

        for (let i = 0; i < clubBoard.slots.length; i++) {
          const s = clubBoard.slots[i];
          if (s.takenBy === userId) {
            s.open = true;
            s.takenBy = null;
            await notifySlotWaiters(guildIdSel, clubKey, i);
          }
        }

        const slot = clubBoard.slots[slotIndex];
        slot.open = false;
        slot.takenBy = userId;

        await refreshClubPanels(guildIdSel, clubKey);

        const playerLabel =
          userId === '__NOT_IN_VC__'
            ? 'a player not in VC (placeholder)'
            : `<@${userId}>`;

        return interaction.update({
          content: `Assigned ${playerLabel} to **${slot.label}** in **${club.name}**.`,
          components: []
        });
      }

      // vcspots: pick club for VC
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

        if (!stateSel.clubVcLinks) stateSel.clubVcLinks = {};
        stateSel.clubVcLinks[clubKey] = voiceChannelId;

        return interaction.update({
          content: `Linked **${club.name}** to voice channel **${
            vc ? vc.name : 'this VC'
          }** and posted/updated the live panel in this chat.`,
          components: []
        });
      }

      // Manage: pick player (manager-only)
      if (id.startsWith('manage_player_pick_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can use the Player Tools menu.',
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
            userId === '__NOT_IN_VC__'
              ? 'the player not in VC placeholder'
              : `<@${userId}>`
          } in **${club.name}**:`,
          components: [row]
        });
      }

      // Manage: move/remove (manager-only)
      if (id.startsWith('manage_player_pos_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content:
              'Only captains, managers, owners, media, or admins can use the Player Tools menu.',
            ephemeral: true
          });
        }

        const parts = id.split('_');
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

        for (let i = 0; i < clubBoard.slots.length; i++) {
          const s = clubBoard.slots[i];
          if (s.takenBy === userId) {
            s.open = true;
            s.takenBy = null;
            await notifySlotWaiters(guildIdSel, clubKey, i);
          }
        }

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
          if (userId === '__NOT_IN_VC__') {
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
            userId === '__NOT_IN_VC__'
              ? 'the player not in VC placeholder'
              : `<@${userId}>`;

          return interaction.update({
            content: `Moved ${movedLabel} to **${newSlot.label}** in **${club.name}**.`,
            components: []
          });
        }
      }

      // Formation select groups
      if (id.startsWith('formation_select_')) {
        const parts = id.split('_');
        const clubKey = parts[2];
        const formationName = interaction.values[0];
        return setClubFormation(interaction, guildIdSel, clubKey, formationName);
      }
    }
  } catch (err) {
    console.error('❌ Error handling interaction:', err);
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({
          content: 'Error.',
          ephemeral: true
        });
      } catch {
        // ignore
      }
    }
  }
});

// Clear slots when someone leaves all voice channels
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    if (!oldState.guild || !oldState.channelId) return;
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
      for (let i = 0; i < clubBoard.slots.length; i++) {
        const slot = clubBoard.slots[i];
        if (slot && slot.takenBy === userId) {
          slot.open = true;
          slot.takenBy = null;
          await notifySlotWaiters(guildId, clubKey, i);
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
