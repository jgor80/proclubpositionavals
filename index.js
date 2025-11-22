// Admin: configure club name and number of clubs
if (cmd === 'divsetup') {
  if (
    !interaction.memberPermissions?.has(
      PermissionsBitField.Flags.ManageGuild
    )
  ) {
    return interaction.reply({
      content: 'Only admins can configure clubs.',
      ephemeral: true
    });
  }

  const basename = interaction.options.getString('basename');
  let clubCount = interaction.options.getInteger('clubs');

  if (clubCount < 1) clubCount = 1;
  if (clubCount > 4) clubCount = 4;

  // Update CLUBS array names + enabled flags
  CLUBS.forEach((club, index) => {
    if (index < clubCount) {
      club.enabled = true;
      club.name = clubCount === 1 ? basename : `${basename} ${index + 1}`;
    } else {
      club.enabled = false;
    }
  });

  // Rebuild boardState for all clubs (clear spots)
  CLUBS.forEach((club) => {
    if (!boardState[club.key]) {
      boardState[club.key] = { spots: {} };
    }
    const clubBoard = boardState[club.key];
    clubBoard.spots = POSITIONS.reduce((acc, p) => {
      acc[p] = { open: true, takenBy: null };
      return acc;
    }, {});
  });

  // Ensure currentClubKey points to an enabled club
  const firstEnabled = CLUBS.find(c => c.enabled);
  if (firstEnabled) {
    currentClubKey = firstEnabled.key;
  }

  // Update admin panel if it exists
  if (adminPanelChannelId && adminPanelMessageId) {
    try {
      const channel = await client.channels.fetch(adminPanelChannelId);
      const msg = await channel.messages.fetch(adminPanelMessageId);
      await msg.edit({
        embeds: [buildEmbedForClub(currentClubKey)],
        components: buildAdminComponents()
      });
    } catch (err) {
      console.error('⚠️ Failed to update admin panel after /divsetup:', err);
    }
  }

  return interaction.reply({
    content: `Configured **${clubCount}** club(s) with base name **${basename}**.`,
    ephemeral: true
  });
}
