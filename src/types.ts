export type Role = 'korisnik' | 'trener';

export interface BosancicaLetter {
  id: string;
  charName: string; // e.g. "Az", "Buki", "Vedi"
  latinChar: string; // e.g. "A", "B", "V"
  svgPath: string; // custom SVG path representing the letter shape
  description: string; // historical description or sound representation
  variants: string[]; // alternative shapes or notes
  examplesCount: number; // number of community-trained examples
}

export interface PresetDocument {
  id: string;
  title: string;
  year: string;
  origin: string;
  imageUrl: string;
  rawBosančicaText: string;
  latinText: string;
  lines: {
    textBosančica: string;
    textLatinica: string;
    top: number; // percentage from top
    height: number; // percentage height
  }[];
}

export interface ScanItem {
  id: string;
  date: string;
  fileName: string;
  title: string;
  rawBosančicaText: string;
  latinText: string;
  accuracy: number;
  durationMs: number;
}

export interface ValidationSample {
  id: string;
  letterId: string;
  letterName: string;
  drawnPath: string; // canvas path/dataUrl
  timestamp: string;
  status: 'pending' | 'approved' | 'rejected';
}
