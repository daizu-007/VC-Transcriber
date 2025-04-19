// auth.ts

import { SlashCommandBuilder, ButtonBuilder, ActionRowBuilder, ButtonStyle, MessageFlags } from 'discord.js';

export default {
  data: new SlashCommandBuilder().setName('auth').setDescription('VCでの発言権限を要求する'),
  execute(interaction: any, warning_message: string, authChannel: string) {
    if (interaction.channel.id !== authChannel) {
      interaction.reply({
        content: 'このコマンドは特定のチャンネルでしか実行できません。',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    const agree_button = new ButtonBuilder().setCustomId('agree').setLabel('同意する').setStyle(ButtonStyle.Primary);
    const row = new ActionRowBuilder().addComponents(agree_button);
    interaction.reply({ content: warning_message, flags: MessageFlags.Ephemeral, components: [row] });
  },
};
