// src/index.ts

// 必要なモジュールをインポート
import { Client, Events, GatewayIntentBits, Collection, VoiceState } from 'discord.js';
import {
  joinVoiceChannel,
  EndBehaviorType,
  VoiceConnectionStatus,
  entersState,
  VoiceConnection,
} from '@discordjs/voice';
import toml from 'toml';
import fs from 'fs';
import path from 'path';
import * as Prism from 'prism-media';
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

// 録音ファイルを保存するディレクトリ
const recordingsDir = path.join(__dirname, '../tmp');
// ディレクトリが存在しない場合は作成
if (!fs.existsSync(recordingsDir)) {
  try {
    fs.mkdirSync(recordingsDir, { recursive: true });
  } catch (error) {
    console.error(`Couldn't make tmp dir: ${error}`);
    process.exit(1);
  }
}
// ディレクトリにファイルが存在する場合は削除
const files = fs.readdirSync(recordingsDir);
if (files.length > 0) {
  files.forEach((file) => {
    fs.unlinkSync(path.join(recordingsDir, file));
  });
}

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
const voiceChannels = new Collection<string, VoiceConnection>();

// WAVファイルの作成
function createWavFile(buffer: Buffer, sampleRate = 48000, numChannels = 2, bitDepth = 16) {
  const byteRate = (sampleRate * numChannels * bitDepth) / 8;
  const blockAlign = (numChannels * bitDepth) / 8;
  const dataSize = buffer.length;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0); // RIFFヘッダー
  header.writeUInt32LE(36 + dataSize, 4); // チャンクサイズ (44 - 8 + dataSize)
  header.write('WAVE', 8); // フォーマット
  header.write('fmt ', 12); // 'fmt 'チャンク
  header.writeUInt32LE(16, 16); // fmtチャンクのサイズ（16バイト）
  header.writeUInt16LE(1, 20); // フォーマット (1 = PCM)
  header.writeUInt16LE(numChannels, 22); // チャンネル数
  header.writeUInt32LE(sampleRate, 24); // サンプリングレート
  header.writeUInt32LE(byteRate, 28); // バイトレート
  header.writeUInt16LE(blockAlign, 32); // ブロックサイズ
  header.writeUInt16LE(bitDepth, 34); // ビット深度
  header.write('data', 36); // dataチャンク
  header.writeUInt32LE(dataSize, 40); // dataチャンクのサイズ

  return Buffer.concat([header, buffer]);
}

// ユーザーがVCに参加したときの処理
async function handleUserJoin(voiceState: VoiceState) {
  if (voiceState.channelId && voiceChannels.has(voiceState.channelId)) {
    return; // すでに参加しているVCには参加しない
  }
  if (!voiceState.channelId) return; // VCに参加していない場合は何もしない
  const connection = joinVoiceChannel({
    channelId: voiceState.channelId,
    guildId: voiceState.guild.id,
    adapterCreator: voiceState.guild.voiceAdapterCreator,
    selfDeaf: false,
    selfMute: true,
  });
  voiceChannels.set(voiceState.channelId, connection); // 参加しているVCのリストに追加
  const receiver = connection.receiver; // VoiceReceiverを取得

  // ユーザーが話し始めたときの処理
  receiver.speaking.on('start', (userId) => {
    const user = voiceState.guild.members.cache.get(userId);
    const audioStream = receiver.subscribe(userId, {
      end: {
        behavior: EndBehaviorType.AfterSilence,
        duration: 100,
      },
    });
    // 録音ファイルのパスを生成
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); // タイムスタンプを生成
    const filename = path.join(recordingsDir, `${userId}-${timestamp}.wav`);
    // バッファーを作成
    const pcmBuffer: Buffer[] = [];
    // デコーダーを作成
    const opusDecoder = new Prism.opus.Decoder({
      channels: 2,
      rate: 48000,
      frameSize: 960,
    });
    opusDecoder.on('data', (data) => {
      pcmBuffer.push(data); // PCMデータをバッファーに追加
    });
    const pipeline = audioStream.pipe(opusDecoder);
    audioStream.on('end', () => {
      const pcmData = Buffer.concat(pcmBuffer); // バッファーを結合
      const wavData = createWavFile(pcmData); // WAVファイルを作成
      fs.writeFile(filename, wavData, (error) => {
        if (error) {
          console.error(`Error saving WAV file: ${error}`);
        }
      });
      if (!opusDecoder.destroyed) opusDecoder.destroy(); // デコーダーを破棄
    });
    pipeline.on('error', (error) => {
      console.error(`Error recording audio: ${error}`);
      if (!audioStream.destroyed) audioStream.destroy(); // 音声ストリームを破棄
      if (!opusDecoder.destroyed) opusDecoder.destroy(); // デコーダーを破棄
    });
  }); // ここまでがユーザーが話し始めたときの処理

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
  // 接続が破棄されたときの処理
  connection.on(VoiceConnectionStatus.Destroyed, () => {
    if (!voiceState.channelId) return; // VCに参加していない場合は何もしない
    voiceChannels.delete(voiceState.channelId); // 参加しているVCのリストから削除
  });
}

// ユーザーがVCから離れたときの処理
async function handleUserLeave(voiceState: VoiceState) {
  if (!voiceState.channelId) return; // チャンネルIDがない場合は何もしない
  if (!voiceChannels.has(voiceState.channelId)) {
    return; // 元のVCに参加していなかった場合は、何もしない
  }
  // 切断もとのVCにユーザーがいない場合は、VCから切断する
  if (voiceState.channel?.members.size === 1) {
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
