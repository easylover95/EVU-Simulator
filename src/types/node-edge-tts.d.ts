declare module 'node-edge-tts' {
  export interface EdgeTTSOptions {
    voice?: string;
    lang?: string;
    outputFormat?: string;
    pitch?: string;
    rate?: string;
    volume?: string;
    saveSubtitles?: boolean;
    proxy?: string;
    timeout?: number;
  }

  export class EdgeTTS {
    constructor(options?: EdgeTTSOptions);
    ttsPromise(text: string, filepath: string): Promise<void>;
  }
}
