// ping.ts

import { SlashCommandBuilder, MessageFlags } from 'discord.js';

export default {
  data: new SlashCommandBuilder().setName('ping').setDescription('Ping!'),
  async execute(interaction: any) {
    await interaction.reply({ content: 'Pong!', flags: MessageFlags.Ephemeral });
  },
};
