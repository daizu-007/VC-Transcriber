// command_register.ts

import { REST, Routes } from 'discord.js';
import type { Config } from './types'; // types.tsからインポート
import { loadConfig } from './utils/read_config';
import fs from 'fs';
import path from 'path';

// Configを読み込む
const config: Config = loadConfig(); // Config型を使用して型定義
// configの値を取得
const DiscordToken = config.discord.token;
const clientId = config.discord.client_id;
const guildId = config.discord.guild_id;

// コマンドのディレクトリパスを取得
const commandDir = path.join(process.cwd(), 'src/commands'); // コマンドディレクトリのパスを取得
const commands: any = []; // コマンドを格納する配列
const commandFiles = fs.readdirSync(commandDir).filter((file) => file.endsWith('.ts') || file.endsWith('.js')); // コマンドファイルを取得

// コマンドを配列に追加
for (const file of commandFiles) {
  const commandModule = await import(path.join(commandDir, file)); // コマンドをインポート
  if (!commandModule.default) {
    console.warn(`Command ${file} does not have a default export.`); // デフォルトエクスポートがない場合はエラーを表示
    continue; // 次のファイルへ
  }
  const command = commandModule.default; // デフォルトエクスポートを取得
  if (!command.data) {
    console.warn(`Command ${file} does not have a data property.`); // dataプロパティがない場合はエラーを表示
    continue; // 次のファイルへ
  }
  commands.push(command.data.toJSON()); // JSONデータに変換して配列に追加
}

// Discord APIとの通信の準備
const rest = new REST({ version: '10' }).setToken(DiscordToken);

// コマンドをデプロイ
(async () => {
  try {
    console.log('デプロイを開始します。');
    await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
    console.log('デプロイが完了しました。');
  } catch (error) {
    console.error(error);
  }
})();
