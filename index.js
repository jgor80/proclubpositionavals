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
const token = process.env.BOT_TOKEN;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Positions you want to track
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

// Default club
let currentClub = CLUBS[0];

// true = OPEN, false = TAKEN
const spots = {};
POSITIONS.forEach((p) => (spots[p] = true));

// Build the embed (display)
function buildEmbed() {
  const lines = POSITIONS.map((p) => {
    const open = spots[p];
    const emoji = open ? '🟢' : '🔴';
    const text = open ? 'OPEN' : 'TAKEN';
    return `**${p}** – ${emoji} ${text}`;
  });

  return new EmbedBuilder()
    .setTitle('Div Spots')
    .setDescription(`**Club:** ${currentClub}\n\n` + lines.join('\n'))
    .setFooter({ text: 'Admins: tap a button or pick a club.' });
}

// Build the position buttons (max 5 per row)
function buildButtons() {
  const rows = [];
  let currentRow = new ActionRowBuilder();

  POSITIONS.forEach((p, index) => {
    const open = spots[p];
    const button = new ButtonBuilder()
      .setCustomId(`pos_${p}`)
      .setLabel(p)
      .setStyle(open ? ButtonStyle.Success : ButtonStyle.Danger); // green=open, red=taken

    currentRow.addComponents(button);

    // If row has 5 buttons or this is the last position, push row and start new
    if (currentRow.components.length === 5 || index === POSITIONS.length - 1) {
      rows.push(currentRow);
      currentRow = new ActionRowBuilder();
    }
  });

  return rows;
}

// Build the club dropdown
function buildClubSelect() {
  const select = new StringSelectMenuBuilder()
    .setCustomId('club_select')
    .setPlaceholder('Select club')
    .addOptions(
      CLUBS.map((name) => ({
        label: name,
        value: name
      }))
    );

  const row = new ActionRowBuilder().addComponents(select);
  return row;
}

// All components together: dropdown + buttons
function buildComponents() {
  const clubRow = buildClubSelect();
  const buttonRows = buildButtons();
  return [clubRow, ...buttonRows];
}

// When the bot starts
client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);

  // Slash commands: /div and /divall
  await c.application.commands.set([
    { name: 'div', description: 'Show Div spots.' },
    { name: 'divall', description: 'Set all spots to OPEN.' }
  ]);
  console.log('✅ Commands /div and /divall registered');
});

// Handle commands, buttons, dropdown
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'div') {
        // Send main board message (pin this)
        return interaction.reply({
          embeds: [buildEmbed()],
          components: buildComponents()
        });
      }

      if (interaction.commandName === 'divall') {
        // Only admins can reset all
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

        POSITIONS.forEach((p) => (spots[p] = true));
        return interaction.reply({
          content: 'All spots set to 🟢 OPEN.',
          ephemeral: true
        });
      }
    }

    // Position buttons
    if (interaction.isButton()) {
      const [prefix, pos] = interaction.customId.split('_');
      if (prefix !== 'pos' || !spots.hasOwnProperty(pos)) return;

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

      // Flip OPEN/TAKEN
      spots[pos] = !spots[pos];

      // Update same message (the pinned one)
      return interaction.update({
        embeds: [buildEmbed()],
        components: buildComponents()
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

      currentClub = selected;

      // Update same message
      return interaction.update({
        embeds: [buildEmbed()],
        components: buildComponents()
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
