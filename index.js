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
 * Dynamic formations: definitions with metadata. We derive
 * position lists & notes from this.
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
      key_player_style: "CM needs excellent passing to bypass the CDMs and reach the front three; CDMs must have
