// types.ts
// インターフェースの定義

// configの型定義
export interface Config {
  general: {
    channels: Map<string, string>;
    ignore_words: string[];
  };
  discord: {
    token: string;
    client_id: string;
    guild_id: string;
  };
  groq: {
    token: string;
  };
  auth: {
    auth_channel: string;
  };
}
