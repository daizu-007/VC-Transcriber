// read_config.ts

import fs from 'fs';
import path from 'path';
import toml from 'toml';
import type { Config } from '../types'; // types.tsからインポート

// configを読み込む関数
export function loadConfig(): Config {
  let config: Config; // Config型を使用して型定義
  const configPath = path.resolve(__dirname, '../../config.toml'); // 相対座標を直接使用すると読み込めなかったため
  try {
    const configFile = fs.readFileSync(configPath, 'utf-8');
    if (!configFile) {
      throw new Error('Config file not found');
    }
    config = toml.parse(configFile);
    if (!config) {
      throw new Error('Config file is empty or invalid');
    }
    if (config.general && Array.isArray(config.general.channels)) {
      // Mapに変換
      config.general.channels = new Map<string, string>(config.general.channels);
    }
  } catch (error) {
    console.error('Error loading config:', error);
    process.exit(1); // エラーが発生した場合はプロセスを終了
  }
  try {
    if (!config.discord.token) {
      throw new Error('Discord token not found in config');
    }
    if (!config.groq.token) {
      throw new Error('Groq token not found in config');
    }
    if (!config.general.channels) {
      throw new Error('Channels not found in config');
    }
    if (!config.general.ignore_words) {
      throw new Error('Ignore words not found in config');
    }
    if (!config.auth.auth_channel) {
      throw new Error('Auth channel not found in config');
    }
    if (!config.discord.client_id) {
      throw new Error('Discord client ID not found in config');
    }
    if (!config.discord.guild_id) {
      throw new Error('Discord guild ID not found in config');
    }
  } catch (error) {
    console.error('Error in config:', error);
    process.exit(1); // エラーが発生した場合はプロセスを終了
  }
  return config;
}
