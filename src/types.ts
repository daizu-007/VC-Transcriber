// types.ts
// インターフェースの定義

// configの型定義
export interface Config {
  general: {
    channels: Map<string, string>;
    ignore_words: string[];
    warning_message: string;
    dm_message: string;
  };
  discord: {
    token: string;
    client_id: string;
    guild_id: string;
    role_id: string;
    notification_channel: string;
  };
  groq: {
    token: string;
  };
  auth: {
    auth_channel: string;
  };
}
