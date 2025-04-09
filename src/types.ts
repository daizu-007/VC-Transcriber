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
  };
  groq: {
    token: string;
  };
}
