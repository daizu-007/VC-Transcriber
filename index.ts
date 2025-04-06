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
let config: any = {};
try {
  const configFile = fs.readFileSync('./config.toml', 'utf-8');
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

// VCの状態が変わったときの処理
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  // ユーザーがVCに参加したときの処理
  if (oldState.channelId === null && newState.channelId !== null) {
    if (newState.channelId && voiceChannels.has(newState.channelId)) {
      return; // すでに参加しているVCには参加しない
    }
    const connection = joinVoiceChannel({
      channelId: newState.channelId,
      guildId: newState.guild.id,
      adapterCreator: newState.guild.voiceAdapterCreator,
    });
    voiceChannels.set(newState.channelId, connection); // 参加しているVCのリストに追加

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
  } else if (oldState.channelId !== null && newState.channelId === null) {
    // ユーザーがVCから離れたときの処理
    if (!voiceChannels.has(oldState.channelId)) {
      return; // 元のVCに参加していなかった場合は、何もしない
    }
    console.log('User left the voice channel!');
    console.log('The number of users in the voice channel:', oldState.channel?.members.size);
    // 切断もとのVCにユーザーがいない場合は、VCから切断する
    if (oldState.channel?.members.size === 1) {
      console.log('No users left in the voice channel, disconnecting...');
      const connection = voiceChannels.get(oldState.channelId);
      if (connection) {
        connection.destroy();
        voiceChannels.delete(oldState.channelId); // 参加しているVCのリストから削除
      }
    }
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
