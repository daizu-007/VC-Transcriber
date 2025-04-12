// auth.ts

import { SlashCommandBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle } from 'discord.js';

export default {
  data: new SlashCommandBuilder().setName('auth').setDescription('VCでの発言権限を要求する'),
  execute(interaction: any, warning_message: string) {
    const agree_button = new ButtonBuilder().setCustomId('agree').setLabel('同意する').setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder().addComponents(agree_button);
    interaction.reply({ content: warning_message, ephemeral: true, components: [row] });
  },
};
