import type { Object3D } from 'three';

export const LEITSTELLE_MODEL_URL: string;
export const ZOOM_COMPLETE_EVENT: 'mainmenu3d:zoomcomplete';

export interface MainMenu3DZoomDetail {
  name: string;
  uuid: string;
  object: Object3D;
}

export interface MainMenu3DOptions {
  modelUrl?: string;
  onZoomComplete?: (detail: MainMenu3DZoomDetail) => void;
  onLoad?: () => void;
  onError?: (error: Error) => void;
}

export declare class MainMenu3D {
  constructor(container: HTMLElement, options?: MainMenu3DOptions);
  resetCamera(animated?: boolean): void;
  dispose(): void;
}

export default MainMenu3D;
