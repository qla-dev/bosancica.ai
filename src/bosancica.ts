const BOSANCICA_CHARACTER_MAP: Record<string, string> = {
  A: 'А', B: 'Б', C: 'Ц', Č: 'Ч', Ć: 'Ћ', D: 'Д', Đ: 'Ђ', E: 'Е', F: 'Ф',
  G: 'Г', H: 'Х', I: 'И', J: 'Ј', K: 'К', L: 'Л', M: 'М', N: 'Н', O: 'О',
  P: 'П', R: 'Р', S: 'С', Š: 'Ш', T: 'Т', U: 'У', V: 'В', Z: 'З', Ž: 'Ж',
  a: 'а', b: 'б', c: 'ц', č: 'ч', ć: 'ћ', d: 'д', đ: 'ђ', e: 'е', f: 'ф',
  g: 'г', h: 'х', i: 'и', j: 'ј', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о',
  p: 'п', r: 'р', s: 'с', š: 'ш', t: 'т', u: 'у', v: 'в', z: 'з', ž: 'ж',
};

// OCR models emit a digital Cyrillic/Bosančica transcription. This map keeps
// recognition separate from transliteration, so the original text remains
// available for researcher review while the UI can show a modern Latin reading.
// Historical characters outside this agreed baseline remain unchanged.
const CYRILLIC_TO_LATIN: Record<string, string> = {
  'А': 'A', 'а': 'a', 'Б': 'B', 'б': 'b', 'В': 'V', 'в': 'v',
  'Г': 'G', 'г': 'g', 'Д': 'D', 'д': 'd', 'Ђ': 'Đ', 'ђ': 'đ',
  'Е': 'E', 'е': 'e', 'Ж': 'Ž', 'ж': 'ž', 'З': 'Z', 'з': 'z',
  'И': 'I', 'и': 'i', 'Ј': 'J', 'ј': 'j', 'К': 'K', 'к': 'k',
  'Л': 'L', 'л': 'l', 'Љ': 'Lj', 'љ': 'lj', 'М': 'M', 'м': 'm',
  'Н': 'N', 'н': 'n', 'Њ': 'Nj', 'њ': 'nj', 'О': 'O', 'о': 'o',
  'П': 'P', 'п': 'p', 'Р': 'R', 'р': 'r', 'С': 'S', 'с': 's',
  'Т': 'T', 'т': 't', 'Ћ': 'Ć', 'ћ': 'ć', 'У': 'U', 'у': 'u',
  'Ф': 'F', 'ф': 'f', 'Х': 'H', 'х': 'h', 'Ц': 'C', 'ц': 'c',
  'Ч': 'Č', 'ч': 'č', 'Џ': 'Dž', 'џ': 'dž', 'Ш': 'Š', 'ш': 'š',
  'Ꙋ': 'U', 'ꙋ': 'u',
};

const VOWELS = /[AaEeIiOoUuÀàÁáÂâÄäĄąÆæÈèÉéÊêËëÌìÍíÎîÏïĮįÒòÓóÔôÖöØøŌōÙùÚúÛûÜüŲųŮůÝýŸÿАаЕеЁёИиІіЇїОоУуЎўЫыЭэЮюЯяѦѧѪѫѨѩ]/u;

/**
 * Yat (ѣ) is read "j" before a vowel and "ja" everywhere else,
 * including when it ends a word or stands on its own.
 */
export const transliterateBosancicaToLatin = (text: string) => {
  const characters = Array.from(text);

  return characters.map((character, index) => {
    if (character === 'ѣ') return VOWELS.test(characters[index + 1] ?? '') ? 'j' : 'ja';
    if (character === 'Ѣ') return VOWELS.test(characters[index + 1] ?? '') ? 'J' : 'JA';

    return CYRILLIC_TO_LATIN[character] ?? character;
  }).join('');
};

export const toBosancicaFontInput = (text: string) => {
  const withDigraphs = text
    .replaceAll('DŽ', 'Џ').replaceAll('Dž', 'Џ').replaceAll('dž', 'џ')
    .replaceAll('LJ', 'Љ').replaceAll('Lj', 'Љ').replaceAll('lj', 'љ')
    .replaceAll('NJ', 'Њ').replaceAll('Nj', 'Њ').replaceAll('nj', 'њ');

  return Array.from(withDigraphs, (character) => BOSANCICA_CHARACTER_MAP[character] ?? character).join('');
};
