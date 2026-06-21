const BOSANCICA_CHARACTER_MAP: Record<string, string> = {
  A: 'А', B: 'Б', C: 'Ц', Č: 'Ч', Ć: 'Ћ', D: 'Д', Đ: 'Ђ', E: 'Е', F: 'Ф',
  G: 'Г', H: 'Х', I: 'И', J: 'Ј', K: 'К', L: 'Л', M: 'М', N: 'Н', O: 'О',
  P: 'П', R: 'Р', S: 'С', Š: 'Ш', T: 'Т', U: 'У', V: 'В', Z: 'З', Ž: 'Ж',
  a: 'а', b: 'б', c: 'ц', č: 'ч', ć: 'ћ', d: 'д', đ: 'ђ', e: 'е', f: 'ф',
  g: 'г', h: 'х', i: 'и', j: 'ј', k: 'к', l: 'л', m: 'м', n: 'н', o: 'о',
  p: 'п', r: 'р', s: 'с', š: 'ш', t: 'т', u: 'у', v: 'в', z: 'з', ž: 'ж',
};

export const toBosancicaFontInput = (text: string) => {
  const withDigraphs = text
    .replaceAll('DŽ', 'Џ').replaceAll('Dž', 'Џ').replaceAll('dž', 'џ')
    .replaceAll('LJ', 'Љ').replaceAll('Lj', 'Љ').replaceAll('lj', 'љ')
    .replaceAll('NJ', 'Њ').replaceAll('Nj', 'Њ').replaceAll('nj', 'њ');

  return Array.from(withDigraphs, (character) => BOSANCICA_CHARACTER_MAP[character] ?? character).join('');
};
