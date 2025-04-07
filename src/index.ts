// src/index.ts

// 必要なモジュールをインポート
import { Client, Events, GatewayIntentBits, Collection } from 'discord.js';
import {
  joinVoiceChannel,
  VoiceReceiver,
  EndBehaviorType,
  createAudioPlayer,
  NoSubscriberBehavior,
  createAudioResource,
  StreamType,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
} from '@discordjs/voice';
import toml from 'toml';
import fs from 'fs';
import path from 'path';
// 型定義をインポート
import type { Config } from './types'; // types.tsからインポート

// クライアントを作成
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
  ],
});

// configを読み込む
let config: Config; // Config型を使用して型定義
const configPath = path.resolve(__dirname, '../config.toml'); // 相対座標を直接使用すると読み込めなかったため
try {
  const configFile = fs.readFileSync(configPath, 'utf-8');
  if (!configFile) {
    throw new Error('Config file not found');
  }
  config = toml.parse(configFile);
  if (!config) {
    throw new Error('Config file is empty or invalid');
  }
} catch (error) {
  console.error('Error loading config:', error);
  process.exit(1); // エラーが発生した場合はプロセスを終了
}
const token = config.general.token;

// 参加しているVCのリスト
const voiceChannels = new Collection<string, any>();

// ユーザーがVCに参加したときの処理
async function handleUserJoin(voiceState: any) {
  if (voiceState.channelId && voiceChannels.has(voiceState.channelId)) {
    return; // すでに参加しているVCには参加しない
  }
  const connection = joinVoiceChannel({
    channelId: voiceState.channelId,
    guildId: voiceState.guild.id,
    adapterCreator: voiceState.guild.voiceAdapterCreator,
  });
  voiceChannels.set(voiceState.channelId, connection); // 参加しているVCのリストに追加
  // 接続が確立されたときの処理
  connection.on(VoiceConnectionStatus.Ready, () => {
    console.log('Connected to voice channel!');
  });
  // 接続が切断されたときの処理
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    await entersState(connection, VoiceConnectionStatus.Signalling, 5_000).catch(() => {
      connection.destroy();
    });
  });
}

// ユーザーがVCから離れたときの処理
async function handleUserLeave(voiceState: any) {
  if (!voiceChannels.has(voiceState.channelId)) {
    return; // 元のVCに参加していなかった場合は、何もしない
  }
  console.log('User left the voice channel!');
  console.log('The number of users in the voice channel:', voiceState.channel?.members.size);
  // 切断もとのVCにユーザーがいない場合は、VCから切断する
  if (voiceState.channel?.members.size === 1) {
    console.log('No users left in the voice channel, disconnecting...');
    const connection = voiceChannels.get(voiceState.channelId);
    if (connection) {
      connection.destroy();
      voiceChannels.delete(voiceState.channelId); // 参加しているVCのリストから削除
    }
  }
}

// VCの状態が変わったときの処理
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  // ユーザーがVCに参加したときの処理
  if (oldState.channelId === null && newState.channelId !== null) {
    handleUserJoin(newState); // ユーザーがVCに参加したときの処理を呼び出す
  } else if (oldState.channelId !== null && newState.channelId === null) {
    handleUserLeave(oldState); // ユーザーがVCから離れたときの処理を呼び出す
  }
});

// Botが起動したときの処理
client.once(Events.ClientReady, (readyClient) => {
  console.log(`${readyClient.user.tag}でログインしました。`);
});

// Botを起動
client.login(token).catch((error) => {
  console.error('Error logging in:', error);
  process.exit(1); // ログインに失敗した場合はプロセスを終了
});
