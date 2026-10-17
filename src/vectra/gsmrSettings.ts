/** Laufzeit-Lautstärken für GSM-R (von Einstellungen gesetzt). */

let ttsVolume = 1;
let radioVolume = 0.7;

export function setGsmrVolumes(tts: number, radio: number): void {
  ttsVolume = Math.max(0, Math.min(1, tts));
  radioVolume = Math.max(0, Math.min(1, radio));
}

export function getTtsVolume(): number {
  return ttsVolume;
}

export function getRadioVolume(): number {
  return radioVolume;
}
