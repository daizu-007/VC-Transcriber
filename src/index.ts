// src/index.ts

// 必要なモジュールをインポート
import {
  Client,
  Events,
  GatewayIntentBits,
  Collection,
  VoiceState,
  ChannelType,
  EmbedBuilder,
  GuildMember,
  MessageFlags,
} from 'discord.js';
import {
  joinVoiceChannel,
  EndBehaviorType,
  VoiceConnectionStatus,
  entersState,
  VoiceConnection,
} from '@discordjs/voice';
import fs from 'fs';
import path from 'path';
import { dirname } from 'path';
import * as Prism from 'prism-media';
import Groq from 'groq-sdk';
import { loadConfig } from './utils/read_config.js';
// 型定義をインポート
import type { Config } from './types'; // types.tsからインポート
import { fileURLToPath, pathToFileURL } from 'url';

// __dirnameを作成
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
const recordingsDir = path.join(process.cwd(), './tmp');
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
const config: Config = loadConfig(); // Config型を使用して型定義
// configの値を取得
const DiscordToken = config.discord.token;
const groqToken = config.groq.token;
const channels = config.general.channels;
const ignoreWords = config.general.ignore_words;
const warning_message = config.general.warning_message;
const roleId = config.discord.role_id;
const commands: Record<string, any> = {}; // コマンドを格納するオブジェクト
const notificationChannel = config.discord.notification_channel;
const authChannel = config.auth.auth_channel;
const dm_message = config.general.dm_message; // DMメッセージ

// コマンドをインポート
async function importCommands() {
  const commandDir = path.join(__dirname, 'commands'); // コマンドディレクトリのパスを取得
  const isBun = typeof process !== 'undefined' && process.versions && 'bun' in process.versions;
  const fileExtension = isBun ? ['.ts', '.js'] : ['.js']; // Bunなら.tsと.js、Nodeなら.jsのみ
  const commandFiles = fs.readdirSync(commandDir).filter((file) => fileExtension.some((ext) => file.endsWith(ext))); // コマンドファイルを取得
  // コマンド名を配列に追加
  for (const file of commandFiles) {
    const filePath = path.join(commandDir, file); // コマンドファイルのパスを取得
    const fileURL = pathToFileURL(filePath).href; // ファイルURLを取得
    const commandModule = await import(fileURL); // コマンドをインポート
    if (!commandModule.default) {
      console.warn(`Command ${file} does not have a default export.`); // デフォルトエクスポートがない場合はエラーを表示
      continue; // 次のファイルへ
    }
    const command = commandModule.default; // デフォルトエクスポートを取得
    if (!command.data) {
      console.warn(`Command ${file} does not have a data property.`); // dataプロパティがない場合はエラーを表示
      continue; // 次のファイルへ
    }
    commands[command.data.name] = command; // コマンド名をキーにしてコマンドを格納
  }
}

// Groqの初期化
const groq = new Groq({
  apiKey: groqToken,
});

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

// 音声データを文字起こしする関数
async function transcribeAudio(filePath: string) {
  try {
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'whisper-large-v3',
      prompt: 'A conversation in Japanese about Minecraft Mods',
      response_format: 'json',
      language: 'ja',
    });
    return transcription.text; // 文字起こし結果を返す
  } catch (error) {
    console.error(`Error transcribing audio: ${error}`);
    return ''; // エラーが発生した場合は空文字を返す
  }
}

// 録音の警告をDMで送信する関数
async function sendWarningMessage(member: GuildMember) {
  try {
    await member.send(dm_message); // DMで警告メッセージを送信
  } catch (error) {
    console.error(`Error sending warning message: ${error}`);
  }
}

// 同意ボタンを押したときの処理
async function handleAgreeButton(interaction: any) {
  try {
    const member = interaction.member;
    // 通知チャンネルにメッセージを送信
    const channel = interaction.guild.channels.cache.get(notificationChannel);
    if (channel && channel.type === ChannelType.GuildText) {
      await channel.send(`${member.user} がVCでの音声の録音及び文字起こしに同意しました。`);
    } else {
      console.error(`Channel not found or not a text channel: ${notificationChannel}`);
    }
    // ロールを取得
    const role = interaction.guild.roles.cache.get(roleId);
    if (!role) {
      await interaction.reply({
        content: 'ロールが見つかりませんでした。管理者に連絡してください。',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    // ユーザーにロールを付与
    if (member instanceof GuildMember) {
      await member.roles.add(role);
      await interaction.reply({ content: '認証に成功しました！VCを楽しんでください！', flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({
        content: 'ロールの付与に失敗しました。管理者に連絡してください。',
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (error) {
    console.error(`Error handling agree button: ${error}`);
    await interaction.reply({
      content: '同意ボタンの処理中にエラーが発生しました。管理者に連絡してください。',
      flags: MessageFlags.Ephemeral,
    });
  }
}

// ユーザーがVCに参加したときの処理
async function handleUserJoin(voiceState: VoiceState) {
  const member = voiceState.member as GuildMember; // VoiceStateからGuildMemberを取得
  if (member.user.bot) return; // Botの場合は何もしない
  try {
    await sendWarningMessage(member); // 録音の警告をDMで送信
  } catch (error) {
    console.error(`Error sending warning message: ${error}`);
  }
  if (voiceState.channelId && voiceChannels.has(voiceState.channelId)) {
    return; // すでに参加しているVCには参加しない
  }
  if (!voiceState.channelId) return; // VCに参加していない場合は何もしない
  let connection: VoiceConnection;
  try {
    connection = joinVoiceChannel({
      channelId: voiceState.channelId,
      guildId: voiceState.guild.id,
      adapterCreator: voiceState.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: true,
    });
  } catch (error) {
    console.error(`Error joining voice channel: ${error}`);
    return; // VCに参加できなかった場合は何もしない
  }
  voiceChannels.set(voiceState.channelId, connection); // 参加しているVCのリストに追加
  const receiver = connection.receiver; // VoiceReceiverを取得

  // ユーザーが話し始めたときの処理
  receiver.speaking.on('start', (userId) => {
    try {
      const user = voiceState.guild.members.cache.get(userId);
      const audioStream = receiver.subscribe(userId, {
        end: {
          behavior: EndBehaviorType.AfterSilence,
          duration: 100,
        },
      });
      // 録音ファイルのパスを生成
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-'); // タイムスタンプを生成
      const uuid = Math.random().toString(36).substring(2, 15); // UUIDを生成
      const filename = path.join(recordingsDir, `${userId}-${timestamp}-${uuid}.wav`); // ファイル名を生成
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
      // ユーザーの発話が終了したときの処理
      audioStream.on('end', async () => {
        const pcmData = Buffer.concat(pcmBuffer); // バッファーを結合
        const wavData = createWavFile(pcmData); // WAVファイルを作成
        await fs.promises.writeFile(filename, wavData); // WAVファイルを保存
        if (!opusDecoder.destroyed) opusDecoder.destroy(); // デコーダーを破棄
        const text = await transcribeAudio(filename); // 音声ファイルを文字起こし
        if (text === '' || ignoreWords.some((word) => text.includes(word)) || !voiceState.channelId) {
          fs.promises.unlink(filename); // 文字起こし結果が空または無視ワードが含まれている場合はファイルを削除
          return; // 何もしない
        }
        const channelId = channels.get(voiceState.channelId); // テキストチャンネルのIDを取得
        if (channelId) {
          const channel = voiceState.guild.channels.cache.get(channelId); // テキストチャンネルを取得
          if (channel && channel.type === ChannelType.GuildText) {
            // テキストチャンネルの場合
            await channel.send({
              embeds: [
                new EmbedBuilder()
                  .setAuthor({
                    name: user?.user.tag ?? 'Unknown User',
                    iconURL: user?.displayAvatarURL() ?? 'https://cdn.discordapp.com/embed/avatars/1.png',
                  })
                  .setDescription(text), // 文字起こし結果を送信
              ],
            });
          } else {
            console.error(`Channel not found or not a text channel: ${channelId}`);
          }
        }
        await fs.promises.unlink(filename); // 一時ファイルを削除
      });
      pipeline.on('error', (error) => {
        console.error(`Audio pipeline error for user ${userId}: ${error.message}`);
        if (!audioStream.destroyed) audioStream.destroy(); // 音声ストリームを破棄
        if (!opusDecoder.destroyed) opusDecoder.destroy(); // デコーダーを破棄
      });
    } catch (error) {
      console.error(`Error processing audio stream: ${error}`);
    }
  }); // ここまでがユーザーが話し始めたときの処理

  // 接続が確立されたときの処理
  connection.on(VoiceConnectionStatus.Ready, () => {
    console.log('Connected to voice channel!');
  });
  // 接続が切断されたときの処理
  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    await entersState(connection, VoiceConnectionStatus.Signalling, 5_000).catch(() => {
      connection.destroy();
      if (voiceState.channelId) voiceChannels.delete(voiceState.channelId);
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

// コマンドが実行されたときの処理
client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.isCommand()) {
    if (interaction.commandName in commands) {
      const command = commands[interaction.commandName]; // コマンドを取得
      try {
        await command.execute(interaction, warning_message, authChannel); // コマンドを実行
      } catch (error) {
        console.error('Error executing command:', error);
        await interaction.reply({ content: 'コマンドの実行中にエラーが発生しました。', ephemeral: true });
      }
    }
  } else if (interaction.isButton()) {
    if (interaction.customId === 'agree') {
      await handleAgreeButton(interaction); // 同意ボタンが押されたときの処理を呼び出す
    }
  }
});

// Botが起動したときの処理
client.once(Events.ClientReady, (readyClient) => {
  console.log(`${readyClient.user.tag}でログインしました。`);
});

async function main() {
  await importCommands(); // コマンドをインポート
  // Botを起動
  client.login(DiscordToken).catch((error) => {
    console.error('Error logging in:', error);
    process.exit(1); // ログインに失敗した場合はプロセスを終了
  });
}

main(); // メイン関数を実行
