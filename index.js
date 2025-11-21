const {
  Client,
  GatewayIntentBits,
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionsBitField,
  StringSelectMenuBuilder
} = require('discord.js');

// Get token from environment variable only
const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('❌ BOT_TOKEN env var not set');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

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

// Club options
const CLUBS = [
  'Rush Superstars',
  'RushSuperstars1',
  'RushSuperstars2',
  'RushSuperstars3',
  'RS Academy'
];

// Per-channel state:
// channelId -> { currentClub: string, spots: { [pos]: boolean } }
const channelState = new Map();

// Create or get state for a channel
function getState(channelId) {
  if (!channelState.has(channelId)) {
    const spots = {};
    POSITIONS.forEach((p) => (spots[p] = true)); // all OPEN

    channelState.set(channelId, {
      currentClub: CLUBS[0], // default club
      spots
    });
  }
  return channelState.get(channelId);
}

// Build the main embed for a channel
function buildEmbed(state) {
  const lines = POSITIONS.map((p) => {
    const open = state.spots[p];
    const emoji = open ? '🟢' : '🔴';
    const text = open ? 'OPEN' : 'TAKEN';
    return `**${p}** – ${emoji} ${text}`;
  });

  return new EmbedBuilder()
    .setTitle('Div Spots')
    .setDescription(`**Club:** ${state.currentClub}\n\n` + lines.join('\n'))
    .setFooter({ text: 'Admins: tap a button or pick a club.' });
}

// Build the position buttons (max 5 per row)
function buildButtons(state) {
  const rows = [];
  let currentRow = new ActionRowBuilder();

  POSITIONS.forEach((p, index) => {
    const open = state.spots[p];
    const button = new ButtonBuilder()
      .setCustomId(`pos_${p}`)
      .setLabel(p)
      .setStyle(open ? ButtonStyle.Success : ButtonStyle.Danger); // green = OPEN, red = TAKEN

    currentRow.addComponents(button);

    // If row has 5 buttons or we're at the end, push the row
    if (currentRow.components.length === 5 || index === POSITIONS.length - 1) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
  });

  return rows;
}

// Build the club dropdown
function buildClubSelect(state) {
  const select = new StringSelectMenuBuilder()
    .setCustomId('club_select')
    .setPlaceholder('Select club')
    .addOptions(
      CLUBS.map((name) => ({
        label: name,
        value: name,
        default: name === state.currentClub
      }))
    );

  const row = new ActionRowBuilder().addComponents(select);
  return row;
}

// Combine dropdown + buttons into components array
function buildComponents(state) {
  const clubRow = buildClubSelect(state);
  const buttonRows = buildButtons(state);
  return [clubRow, ...buttonRows];
}

// When the bot starts
client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  console.log(`✅ App ID: ${c.application.id}`);

  await c.application.commands.set([
    { name: 'div', description: 'Show Div spots (per channel).' },
    { name: 'divall', description: 'Set all spots to OPEN (this channel).' }
  ]);

  console.log('✅ Commands /div and /divall registered');
});

// Handle slash commands, buttons, and dropdowns
client.on(Events.InteractionCreate, async (interaction) => {
  // Simple log for debugging on Railway
  console.log('🔔 Interaction received:', {
    guildId: interaction.guildId,
    channelId: interaction.channelId,
    type: interaction.type,
    commandName: interaction.commandName,
    customId: interaction.customId
  });

  try {
    // Only handle interactions in guild channels
    if (!interaction.guildId || !interaction.channelId) return;

    const state = getState(interaction.channelId);

    // Slash commands
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'div') {
        // Send main board message (pin this in that channel)
        return interaction.reply({
          embeds: [buildEmbed(state)],
          components: buildComponents(state)
        });
      }

      if (interaction.commandName === 'divall') {
        // Only admins can reset all spots
        if (
          !interaction.memberPermissions?.has(
            PermissionsBitField.Flags.ManageGuild
          )
        ) {
          return interaction.reply({
            content: 'Only admins can reset all spots.',
            ephemeral: true
          });
        }

        POSITIONS.forEach((p) => (state.spots[p] = true));

        return interaction.reply({
          content: 'All spots set to 🟢 OPEN in this channel.',
          ephemeral: true
        });
      }
    }

    // Position buttons
    if (interaction.isButton()) {
      const [prefix, pos] = interaction.customId.split('_');
      if (prefix !== 'pos' || !state.spots.hasOwnProperty(pos)) return;

      // Only admins can change spots
      if (
        !interaction.memberPermissions?.has(
          PermissionsBitField.Flags.ManageGuild
        )
      ) {
        return interaction.reply({
          content: 'Only admins can change spots.',
          ephemeral: true
        });
      }

      // Flip OPEN / TAKEN
      state.spots[pos] = !state.spots[pos];

      return interaction.update({
        embeds: [buildEmbed(state)],
        components: buildComponents(state)
      });
    }

    // Club dropdown
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId !== 'club_select') return;

      // Only admins can change club
      if (
        !interaction.memberPermissions?.has(
          PermissionsBitField.Flags.ManageGuild
        )
      ) {
        return interaction.reply({
          content: 'Only admins can change the club.',
          ephemeral: true
        });
      }

      const selected = interaction.values[0];
      if (!CLUBS.includes(selected)) {
        return interaction.reply({
          content: 'Unknown club selected.',
          ephemeral: true
        });
      }

      state.currentClub = selected;

      return interaction.update({
        embeds: [buildEmbed(state)],
        components: buildComponents(state)
      });
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

// Log in
client.login(token);
