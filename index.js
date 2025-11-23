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

// Default club slots; names are editable from the panel
let CLUBS = [
  { key: 'club1', name: 'Club 1', enabled: true },
  { key: 'club2', name: 'Club 2', enabled: false },
  { key: 'club3', name: 'Club 3', enabled: false },
  { key: 'club4', name: 'Club 4', enabled: false }
];

function getClubByKey(key) {
  return CLUBS.find((c) => c.key === key);
}

// Admins or roles with "captain" in the name
function isManager(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionsBitField.Flags.ManageGuild)) return true;
  if (member.roles?.cache) {
    return member.roles.cache.some((role) => /captain/i.test(role.name));
  }
  return false;
}

// clubKey -> { spots: { [pos]: { open: boolean, takenBy: string | null } } }
const boardState = {};
CLUBS.forEach((club) => {
  boardState[club.key] = {
    spots: POSITIONS.reduce((acc, p) => {
      acc[p] = { open: true, takenBy: null };
      return acc;
    }, {})
  };
});

// Which club the admin panel is currently editing
let currentClubKey = 'club1';

// Track admin panel message so we can update it
let adminPanelChannelId = null;
let adminPanelMessageId = null;

function buildEmbedForClub(clubKey) {
  const club = getClubByKey(clubKey);
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
    .setDescription(`**Club:** ${club.name}\n\n` + lines.join('\n'))
    .setFooter({
      text:
        'Players: click a spot to claim. Admins/Captains: use the panel to manage spots & clubs.'
    });
}

function buildButtons() {
  const clubBoard = boardState[currentClubKey];
  const rows = [];
  let currentRow = new ActionRowBuilder();

  POSITIONS.forEach((p, index) => {
    const slot = clubBoard.spots[p];
    const button = new ButtonBuilder()
      .setCustomId(`pos_${p}`)
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

function buildClubSelect() {
  const enabledClubs = CLUBS.filter((club) => club.enabled);
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

function buildViewerClubSelect(selectedKey) {
  const enabledClubs = CLUBS.filter((club) => club.enabled);
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

function buildAdminComponents() {
  const clubRow = buildClubSelect();

  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('rename_club')
      .setLabel('Rename Club')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('add_club')
      .setLabel('Add Club')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('remove_club')
      .setLabel('Remove Club')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('assign_player')
      .setLabel('Assign Player')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('reset_spots')
      .setLabel('Reset Spots')
      .setStyle(ButtonStyle.Secondary)
  );

  const buttonRows = buildButtons();
  return [clubRow, controlRow, ...buttonRows];
}

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Logged in as ${c.user.tag}`);
  console.log(`✅ App ID: ${c.application.id}`);

  const commands = [
    {
      name: 'spotpanel',
      description: 'Create the control panel for club spots.'
    },
    {
      name: 'spots',
      description: 'Show a read-only board with club dropdown.'
    }
  ];

  // GLOBAL registration – works on every server the bot is in
  await c.application.commands.set(commands);
  console.log('✅ Global commands registered for all servers');
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = interaction.commandName;

      if (cmd === 'spotpanel') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can create the control panel.',
            ephemeral: true
          });
        }

        const msg = await interaction.reply({
          embeds: [buildEmbedForClub(currentClubKey)],
          components: buildAdminComponents(),
          fetchReply: true
        });

        adminPanelChannelId = interaction.channelId;
        adminPanelMessageId = msg.id;
        return;
      }

      if (cmd === 'spots') {
        let key = currentClubKey;
        const currentClub = getClubByKey(key);
        if (!currentClub || !currentClub.enabled) {
          const firstEnabled = CLUBS.find((c) => c.enabled) || CLUBS[0];
          key = firstEnabled ? firstEnabled.key : currentClubKey;
        }

        return interaction.reply({
          embeds: [buildEmbedForClub(key)],
          components: [buildViewerClubSelect(key)],
          ephemeral: false
        });
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'rename_club') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can rename clubs.',
            ephemeral: true
          });
        }

        const currentClub = getClubByKey(currentClubKey);
        if (!currentClub) {
          return interaction.reply({
            content: 'Current club not found.',
            ephemeral: true
          });
        }

        const modal = new ModalBuilder()
          .setCustomId('rename_club_modal')
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

      if (interaction.customId === 'add_club') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can add clubs.',
            ephemeral: true
          });
        }

        const disabledClub = CLUBS.find((c) => !c.enabled);
        if (!disabledClub) {
          return interaction.reply({
            content: 'All available club slots are already in use (max 4).',
            ephemeral: true
          });
        }

        disabledClub.enabled = true;

        if (!boardState[disabledClub.key]) {
          boardState[disabledClub.key] = { spots: {} };
        }
        boardState[disabledClub.key].spots = POSITIONS.reduce((acc, p) => {
          acc[p] = { open: true, takenBy: null };
          return acc;
        }, {});

        currentClubKey = disabledClub.key;

        if (adminPanelChannelId && adminPanelMessageId) {
          try {
            const channel = await client.channels.fetch(adminPanelChannelId);
            const msg = await channel.messages.fetch(adminPanelMessageId);
            await msg.edit({
              embeds: [buildEmbedForClub(currentClubKey)],
              components: buildAdminComponents()
            });
          } catch (err) {
            console.error('⚠️ Failed to update admin panel after add_club:', err);
          }
        }

        return interaction.reply({
          content: `Added a new club slot: **${disabledClub.name}**. Use "Rename Club" to give it a custom name.`,
          ephemeral: true
        });
      }

      if (interaction.customId === 'remove_club') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can remove clubs.',
            ephemeral: true
          });
        }

        const currentClub = getClubByKey(currentClubKey);
        if (!currentClub || !currentClub.enabled) {
          return interaction.reply({
            content: 'Current club cannot be removed.',
            ephemeral: true
          });
        }

        const enabledCount = CLUBS.filter((c) => c.enabled).length;
        if (enabledCount <= 1) {
          return interaction.reply({
            content: 'You must keep at least one club enabled.',
            ephemeral: true
          });
        }

        const clubBoard = boardState[currentClubKey];
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

        const firstEnabled = CLUBS.find((c) => c.enabled);
        if (firstEnabled) currentClubKey = firstEnabled.key;

        if (adminPanelChannelId && adminPanelMessageId) {
          try {
            const channel = await client.channels.fetch(adminPanelChannelId);
            const msg = await channel.messages.fetch(adminPanelMessageId);
            await msg.edit({
              embeds: [buildEmbedForClub(currentClubKey)],
              components: buildAdminComponents()
            });
          } catch (err) {
            console.error('⚠️ Failed to update admin panel after remove_club:', err);
          }
        }

        return interaction.reply({
          content: `Removed club **${currentClub.name}** from the panel.`,
          ephemeral: true
        });
      }

      if (interaction.customId === 'reset_spots') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can reset spots.',
            ephemeral: true
          });
        }

        const clubBoard = boardState[currentClubKey];
        POSITIONS.forEach((p) => {
          clubBoard.spots[p].open = true;
          clubBoard.spots[p].takenBy = null;
        });

        if (adminPanelChannelId && adminPanelMessageId) {
          try {
            const channel = await client.channels.fetch(adminPanelChannelId);
            const msg = await channel.messages.fetch(adminPanelMessageId);
            await msg.edit({
              embeds: [buildEmbedForClub(currentClubKey)],
              components: buildAdminComponents()
            });
          } catch (err) {
            console.error('⚠️ Failed to update admin panel after reset_spots:', err);
          }
        }

        return interaction.reply({
          content: 'All spots set to 🟢 OPEN for the current club.',
          ephemeral: true
        });
      }

      if (interaction.customId === 'assign_player') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can assign players.',
            ephemeral: true
          });
        }

        const voiceChannel = interaction.member?.voice?.channel;
        if (!voiceChannel) {
          return interaction.reply({
            content: 'You must be in a voice channel with the players you want to assign.',
            ephemeral: true
          });
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
          .setCustomId(`assign_player_pick_${currentClubKey}`)
          .setPlaceholder('Pick a player')
          .addOptions(options.slice(0, 25));

        const row = new ActionRowBuilder().addComponents(select);
        const club = getClubByKey(currentClubKey);

        return interaction.reply({
          content: `Pick a player to assign in **${club ? club.name : currentClubKey}**:`,
          components: [row],
          ephemeral: true
        });
      }

      if (interaction.customId.startsWith('pos_')) {
        const pos = interaction.customId.substring('pos_'.length);
        const clubBoard = boardState[currentClubKey];
        if (!clubBoard || !clubBoard.spots.hasOwnProperty(pos)) return;

        const inVoice = interaction.member?.voice?.channelId;
        if (!inVoice) {
          return interaction.reply({
            content: 'You must be connected to a voice channel to claim or free a spot.',
            ephemeral: true
          });
        }

        const userId = interaction.user.id;
        const slot = clubBoard.spots[pos];

        if (slot.open) {
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
                'This spot is already taken by someone else. Ask a captain if you need to be moved.',
              ephemeral: true
            });
          }
        }

        return interaction.update({
          embeds: [buildEmbedForClub(currentClubKey)],
          components: buildAdminComponents()
        });
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'rename_club_modal') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can rename clubs.',
            ephemeral: true
          });
        }

        const newName = interaction.fields.getTextInputValue('club_name').trim();
        if (!newName) {
          return interaction.reply({
            content: 'Club name cannot be empty.',
            ephemeral: true
          });
        }

        const currentClub = getClubByKey(currentClubKey);
        if (!currentClub) {
          return interaction.reply({
            content: 'Current club not found.',
            ephemeral: true
          });
        }

        currentClub.name = newName;

        if (adminPanelChannelId && adminPanelMessageId) {
          try {
            const channel = await client.channels.fetch(adminPanelChannelId);
            const msg = await channel.messages.fetch(adminPanelMessageId);
            await msg.edit({
              embeds: [buildEmbedForClub(currentClubKey)],
              components: buildAdminComponents()
            });
          } catch (err) {
            console.error('⚠️ Failed to update admin panel after rename:', err);
          }
        }

        return interaction.reply({
          content: `Club renamed to **${newName}**.`,
          ephemeral: true
        });
      }
    }

    if (interaction.isStringSelectMenu()) {
      const id = interaction.customId;

      if (id === 'viewer_club_select') {
        const selectedKey = interaction.values[0];
        const club = getClubByKey(selectedKey);
        if (!club || !club.enabled) {
          return interaction.reply({
            content: 'Unknown or disabled club selected.',
            ephemeral: true
          });
        }

        return interaction.update({
          embeds: [buildEmbedForClub(selectedKey)],
          components: [buildViewerClubSelect(selectedKey)]
        });
      }

      if (id === 'club_select') {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can change the club.',
            ephemeral: true
          });
        }

        const selectedKey = interaction.values[0];
        const club = getClubByKey(selectedKey);
        if (!club) {
          return interaction.reply({
            content: 'Unknown club selected.',
            ephemeral: true
          });
        }

        currentClubKey = selectedKey;

        return interaction.update({
          embeds: [buildEmbedForClub(currentClubKey)],
          components: buildAdminComponents()
        });
      }

      if (id.startsWith('assign_player_pick_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can assign players.',
            ephemeral: true
          });
        }

        const clubKey = id.substring('assign_player_pick_'.length);
        const club = getClubByKey(clubKey);
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

      if (id.startsWith('assign_player_pos_')) {
        if (!isManager(interaction.member)) {
          return interaction.reply({
            content: 'Only admins or captains can assign players.',
            ephemeral: true
          });
        }

        const parts = id.split('_');
        const clubKey = parts[3];
        const userId = parts[4];
        const pos = interaction.values[0];

        const club = getClubByKey(clubKey);
        if (!club) {
          return interaction.reply({
            content: 'Unknown club in assignment request.',
            ephemeral: true
          });
        }

        const clubBoard = boardState[clubKey];
        if (!clubBoard || !clubBoard.spots[pos]) {
          return interaction.reply({
            content: 'Unknown position for this club.',
            ephemeral: true
          });
        }

        for (const p of POSITIONS) {
          const s = clubBoard.spots[p];
          if (s && s.takenBy === userId) {
            s.open = true;
            s.takenBy = null;
          }
        }

        const slot = clubBoard.spots[pos];
        slot.open = false;
        slot.takenBy = userId;

        if (clubKey === currentClubKey && adminPanelChannelId && adminPanelMessageId) {
          try {
            const channel = await client.channels.fetch(adminPanelChannelId);
            const msg = await channel.messages.fetch(adminPanelMessageId);
            await msg.edit({
              embeds: [buildEmbedForClub(currentClubKey)],
              components: buildAdminComponents()
            });
          } catch (err) {
            console.error('⚠️ Failed to update admin panel after assignment:', err);
          }
        }

        return interaction.update({
          content: `Assigned <@${userId}> to **${pos}** in **${club.name}**.`,
          components: []
        });
      }
    }
  } catch (err) {
    console.error('❌ Error handling interaction:', err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Error.', ephemeral: true });
    }
  }
});

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  try {
    if (!oldState.guild || !oldState.channelId) return;
    if (newState.channelId) return;

    const userId = oldState.id;
    const touchedClubKeys = new Set();

    for (const clubKey of Object.keys(boardState)) {
      const clubBoard = boardState[clubKey];
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

    if (
      touchedClubKeys.has(currentClubKey) &&
      adminPanelChannelId &&
      adminPanelMessageId
    ) {
      try {
        const channel = await client.channels.fetch(adminPanelChannelId);
        const msg = await channel.messages.fetch(adminPanelMessageId);
        await msg.edit({
          embeds: [buildEmbedForClub(currentClubKey)],
          components: buildAdminComponents()
        });
      } catch (err) {
        console.error('⚠️ Failed to update admin panel after voice leave:', err);
      }
    }
  } catch (err) {
    console.error('❌ Error in VoiceStateUpdate handler:', err);
  }
});

client.login(token);
