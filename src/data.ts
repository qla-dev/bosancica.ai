import { BosancicaLetter, PresetDocument, ScanItem } from './types';

// Svi tekstovi i opisi su na bosanskom jeziku
const LEGACY_BOSANCICA_LETTERS: BosancicaLetter[] = [
  {
    id: '1',
    charName: 'Az',
    latinChar: 'A',
    svgPath: 'M 25,85 L 50,15 L 75,85 M 35,60 L 65,60 M 50,15 L 50,85',
    description: 'Početno slovo abecede. Simbolizuje postojanje i sopstvo ("ja"). U bosanskom pismu se često klesalo sa produženom desnom nožicom.',
    variants: ['Klesani oštri prelaz', 'Zaobljena gornja petlja'],
    examplesCount: 142
  },
  {
    id: '2',
    charName: 'Buki',
    latinChar: 'B',
    svgPath: 'M 30,85 L 30,15 L 65,15 C 80,15 80,48 60,48 C 80,48 80,85 55,85 Z',
    description: 'Slovo koje označava "boga" ili "bivanje". Karakteriše ga izražen gornji polu-luk koji je često uži od donjeg.',
    variants: ['Kvadratna "škrinja"', 'Cursive brzi potez'],
    examplesCount: 98
  },
  {
    id: '3',
    charName: 'Vedi',
    latinChar: 'V',
    svgPath: 'M 30,85 L 30,15 C 60,15 70,45 30,50 C 70,50 65,85 30,85',
    description: 'Značenje slova je "znati" ili "vidjeti". U Bosančici ima jedinstvenu trouglastu simetriju na prelazu lukova.',
    variants: ['Trouglasti lukovi', 'Dvostruka kružnica'],
    examplesCount: 115
  },
  {
    id: '4',
    charName: 'Glagolje',
    latinChar: 'G',
    svgPath: 'M 30,85 L 30,15 L 75,15 L 75,40 M 30,45 L 65,45',
    description: 'Slovo predstavlja "govoriti" ili "delati". Bosančica ga bilježi s izrazito naglašenim gornjim horizontalnim krovom i kraćim pratećim kukama.',
    variants: ['Kose gornje crte', 'Sa donjim trnom'],
    examplesCount: 84
  },
  {
    id: '5',
    charName: 'Dobro',
    latinChar: 'D',
    svgPath: 'M 20,70 L 40,70 L 40,15 L 60,15 L 60,70 L 80,70 L 80,85 M 20,85 L 80,85',
    description: 'Znači "dobro". Najprepoznatljivije slovo na bosanskim stećcima, klesano sa karakterističnim bočnim produžecima koji liče na postolje.',
    variants: ['Kraljevska široka baza', 'Uski stećak stil'],
    examplesCount: 176
  },
  {
    id: '6',
    charName: 'Jest',
    latinChar: 'E / JE',
    svgPath: 'M 70,15 L 30,15 L 30,85 L 70,85 M 30,50 L 65,50 M 55,15 L 55,50',
    description: 'Označava postojanje ("jest"). U starobosanskim poveljama se piše sa izraženim unutrašnjim jezicima i kratkim donjim navojem.',
    variants: ['Polukružni luk', 'Sa ukrštenim zubom'],
    examplesCount: 121
  },
  {
    id: '7',
    charName: 'Živjeti',
    latinChar: 'Ž',
    svgPath: 'M 20,30 L 80,70 M 80,30 L 20,70 M 50,15 L 50,85 M 35,50 L 65,50',
    description: 'Predstavlja "život". Kompleksno slovo nalik zvijezdi ili pauku, simbolizira vitalnost i raskršće puteva na stećku.',
    variants: ['Heraldička zvijezda', 'Jednostavni troskok'],
    examplesCount: 74
  },
  {
    id: '8',
    charName: 'Zemlja',
    latinChar: 'Z',
    svgPath: 'M 25,20 L 75,20 L 45,50 L 70,85 L 25,85',
    description: 'Značenje je "tlo" ili "zemlja". Bosanska varijanta posjeduje specifičnu gornju ravnu liniju i donji zmijoliki rep koji se spušta ispod reda.',
    variants: ['Zmijoliki rep', 'Ugaona spirala'],
    examplesCount: 91
  },
  {
    id: '9',
    charName: 'Iže',
    latinChar: 'I',
    svgPath: 'M 25,15 L 25,85 M 75,15 L 75,85 M 25,15 L 75,85',
    description: 'Glavni vokal "I". Tradicionalno prelomljeno udesno ili sa horizontalnom spojnom gredom koja stoji nagnuto.',
    variants: ['Nagnuta greda', 'Ravna kosa'],
    examplesCount: 133
  },
  {
    id: '10',
    charName: 'Kako',
    latinChar: 'K',
    svgPath: 'M 25,15 L 25,85 M 70,15 L 26,50 L 70,85 M 40,40 L 70,40',
    description: 'Znači "poput" ili "kako". Karakteristično po tome što se kose desne grane sastaju visoko na vertikalnom stubu.',
    variants: ['Visoko račvanje', 'Sa ukrasnim cvijetom'],
    examplesCount: 88
  },
  {
    id: '11',
    charName: 'Ljudi',
    latinChar: 'L',
    svgPath: 'M 20,85 L 45,15 L 70,85 M 40,30 Q 55,20 70,30',
    description: 'Označava "čovječanstvo" ili "ljude". U Bosančici klesano sa prepoznatljivim lučnim krovom ili jednostavnim kosim stubovima.',
    variants: ['Stećak krovni luk', 'Simetrični šator'],
    examplesCount: 104
  },
  {
    id: '12',
    charName: 'Mislite',
    latinChar: 'M',
    svgPath: 'M 20,85 L 20,20 L 50,60 L 80,20 L 80,85',
    description: 'Predstavlja "mišljenje" i "mudrost". Bočna rebra su široko razvučena, čineći slovo stabilnim i dominantnim na kamenim ornamentima.',
    variants: ['Široki lukovi', 'Oštri klinasti rez'],
    examplesCount: 153
  }
];

const BOSANCICA_ARCHIVE_DEFINITIONS = [
  ['A', 'А'],
  ['B', 'Б'],
  ['C', 'Ц'],
  ['Č', 'Ч'],
  ['Ć', 'Ћ'],
  ['D', 'Д'],
  ['Đ', 'Ђ'],
  ['DŽ', 'Џ'],
  ['E', 'Е'],
  ['F', 'Ф'],
  ['G', 'Г'],
  ['H', 'Х'],
  ['I', 'И'],
  ['JE', 'Ј'],
  ['JU', 'Ю'],
  ['K', 'К'],
  ['L', 'Л'],
  ['LJ', 'Љ'],
  ['M', 'М'],
  ['N', 'Н'],
  ['NJ', 'Њ'],
  ['O', 'О'],
  ['OT', 'Ѡ'],
  ['P', 'П'],
  ['POLUGLAS', 'Ь'],
  ['R', 'Р'],
  ['S', 'С'],
  ['Š', 'Ш'],
  ['ŠT / ŠĆ / Ć', 'Щ'],
  ['T', 'Т'],
  ['U', 'У'],
  ['V', 'В'],
  ['Z', 'З'],
  ['Ž', 'Ж'],
] as const;

export const BOSANCICA_LETTERS: BosancicaLetter[] = BOSANCICA_ARCHIVE_DEFINITIONS.map(
  ([latinChar, fontInput], index) => ({
    id: `bosancica-${index + 1}`,
    charName: latinChar,
    latinChar,
    fontInput,
    svgPath: '',
    description: '',
    variants: ['Standardni rukopisni oblik'],
    examplesCount: 48 + ((index * 17) % 129),
  }),
);

export const PRESET_DOCUMENTS: PresetDocument[] = [
  {
    id: 'doc-1',
    title: 'Povelja bana Kulina',
    year: '1189.',
    origin: 'Lokacija pisanja: Podrečje (Visoko)',
    imageUrl: 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?auto=format&fit=crop&w=800&q=80', // Beautiful aged medieval parchment texture
    rawBosančicaText: 'Ⱆ ⰉⰏⰅ ⰑⰪA Ⰹ ⰔⰉⰐA Ⰹ ⰔⰂⰅⰕⰑⰃA ⰄⰖⰘA. Ⱑ ⰁAⰐⰠ ⰁⰑⰔⰐⰠⰔⰍⰉ ⰍⰖ Jews ⰉⰐⰠ ⰒⰪⰉⰔⰅⰆ0 ⰕⰅⰁⰉ ⰍⰐⰅⰆⰅ ⰍⰪⰂAⰞⰖ Ⰹ ⰂⰔⰅⰏⰠ ⰃⰪAⰌAⰐⰑⰏⰠ ⰄⰖⰁⰪⰑⰂⰠⰐⰉⰜⰉⰏⰠ.',
    latinText: 'U ime oca i sina i svetoga duha. Ja, ban bosanski Kulin, prisežam tebi, kneže Krvašu, i svim građanima dubrovačkim pravim prijateljem biti ih odsele i do vijeka...',
    lines: [
      {
        textBosančica: 'Ⱆ ⰉⰏⰅ ⰑⰪA Ⰹ ⰔⰉⰐA Ⰹ ⰔⰂⰅⰕⰑⰃA ⰄⰖⰘA.',
        textLatinica: 'U ime oca i sina i svetoga duha.',
        top: 15,
        height: 12
      },
      {
        textBosančica: 'Ⱑ ⰁAⰐⰠ ⰁⰑⰔⰐⰠⰔⰍⰉ ⰍⰖ Jews ⰉⰐⰠ',
        textLatinica: 'Ja, ban bosanski Kulin,',
        top: 32,
        height: 14
      },
      {
        textBosančica: 'ⰒⰪⰉⰔⰅⰆ0 ⰕⰅⰁⰉ ⰍⰐⰅⰆⰅ ⰍⰪⰂAⰞⰖ',
        textLatinica: 'prisežam tebi, kneže Krvašu,',
        top: 50,
        height: 12
      },
      {
        textBosančica: 'Ⰹ ⰂⰔⰅⰏⰠ ⰃⰪAⰌAⰐⰑⰏⰠ ⰄⰖⰁⰪⰑⰂⰠⰐⰉⰜⰉⰏⰠ.',
        textLatinica: 'i svim građanima dubrovačkim.',
        top: 68,
        height: 16
      }
    ]
  },
  {
    id: 'doc-2',
    title: 'Natpis sa Stećka Radoja',
    year: 'XIV vijek',
    origin: 'Nekropola Radimlja (Stolac)',
    imageUrl: 'https://images.unsplash.com/photo-1604014237800-1c9102c219da?auto=format&fit=crop&w=800&q=80', // Grey stone texture
    rawBosančicaText: 'A ⰔⰅ ⰎⰅⰆⰉ ⰄⰑⰁⰪⰉ ⰡⰖⰐAⰍ ⰪAⰄⰑⰡⰅ, ⰔⰉⰐ ⰁAⰐA ⰔⰕⰒⰍA ⰐA ⰔⰂⰑⰡⰑⰡ ⰁAⰞⰕⰉⰐⰉ.',
    latinText: 'A se leži dobri junak Radoje, sin bana Stpka, na svojoj baštini, na plemenitoj zemlji bosanskoj. Kamen piše sin Dragoje.',
    lines: [
      {
        textBosančica: 'A ⰔⰅ ⰎⰅⰆⰉ ⰄⰑⰁⰪⰉ ⰡⰖⰐAⰍ',
        textLatinica: 'A se leži dobri junak',
        top: 20,
        height: 18
      },
      {
        textBosančica: 'ⰪAⰄⰑⰡⰅ, ⰔⰉⰐ ⰁAⰐA',
        textLatinica: 'Radoje, sin bana',
        top: 45,
        height: 18
      },
      {
        textBosančica: 'ⰔⰕⰒⰍA ⰐA ⰔⰂⰑⰡⰑⰡ ⰁAⰞⰕⰉⰐⰉ.',
        textLatinica: 'Stpka, na svojoj baštini.',
        top: 70,
        height: 20
      }
    ]
  },
  {
    id: 'doc-3',
    title: 'Povelja Kralja Tvrtka I Kotromanića',
    year: '1380.',
    origin: 'Prijestolno mjesto Mile (Visoko)',
    imageUrl: 'https://images.unsplash.com/photo-1510070112810-d4e9a46d9e91?auto=format&fit=crop&w=800&q=80', // Gold-amber antique document style
    rawBosančicaText: 'ⰏⰉ, ⰔⰕⰅⰗAⰐ ⰕⰂⰪⰕⰍⰑ, ⰒⰑ ⰏⰉⰎⰑⰔⰕⰉ ⰁⰑⰆⰉⰡⰑⰡ ⰍⰪAⰎⰠ ⰔⰪⰁⰎⰡⰅⰏⰠ Ⰹ ⰁⰑⰔⰐⰉ Ⰹ ⰒⰪⰉⰏⰑⰪⰡⰖ.',
    latinText: 'Mi, Stefan Tvrtko, po milosti božijoj kralj Srbljem i Bosni i Primorju i Zapadnim Stranama, dajemo na znanje svemu narodu...',
    lines: [
      {
        textBosančica: 'ⰏⰉ, ⰔⰕⰅⰗAⰐ ⰕⰂⰪⰕⰍⰑ, ⰒⰑ ⰏⰉⰎⰑⰔⰕⰉ ⰁⰑⰆⰉⰡⰑⰡ',
        textLatinica: 'Mi, Stefan Tvrtko, po milosti božijoj',
        top: 20,
        height: 15
      },
      {
        textBosančica: 'ⰍⰪAⰎⰠ ⰔⰪⰁⰎⰡⰅⰏⰠ Ⰹ ⰁⰑⰔⰐⰉ Ⰹ ⰒⰪⰉⰏⰑⰪⰡⰖ.',
        textLatinica: 'kralj Srbljem i Bosni i Primorju.',
        top: 55,
        height: 20
      }
    ]
  }
];

export const MOCK_HISTORY: ScanItem[] = [
  {
    id: 'hist-1',
    date: 'Danas, 11:42',
    fileName: 'povelja_bana_kulina_detalj.jpg',
    title: 'Povelja bana Kulina',
    rawBosančicaText: 'Ⱆ ⰉⰏⰅ ⰑⰪA Ⰹ ⰔⰉⰐA',
    latinText: 'U ime oca i sina i svetoga duha',
    accuracy: 98.4,
    durationMs: 760
  },
  {
    id: 'hist-2',
    date: 'Jučer, 16:15',
    fileName: 'humacka_ploca_sken.png',
    title: 'Humačka Ploča',
    rawBosančicaText: 'Ⱆ ⰉⰏⰅ ⰑⰪA Ⰹ ⰔⰉⰐA Ⰹ ⰔⰂⰅⰕⰑⰃA',
    latinText: 'U ime oca i sina i svetoga duha',
    accuracy: 94.1,
    durationMs: 1450
  },
  {
    id: 'hist-3',
    date: '10. Jun, 09:30',
    fileName: 'stecak_radimlja_02.jpg',
    title: 'Natpis sa Stećka Radoja',
    rawBosančicaText: 'A ⰔⰅ ⰎⰅⰆⰉ ⰄⰑⰁⰪⰉ ⰡⰖⰐAⰍ',
    latinText: 'A se leži dobri junak',
    accuracy: 96.8,
    durationMs: 910
  }
];

export const MOCK_VALIDATION_SAMPLES = [
  {
    id: 'val-1',
    letterId: '1',
    letterName: 'Az (A)',
    drawnPath: 'M 35,75 C 38,55 45,35 50,20 C 53,35 58,55 62,75 M 40,55 L 58,55 M 48,22 L 48,78',
    timestamp: 'prije 5 minuta',
    status: 'pending' as const
  },
  {
    id: 'val-2',
    letterId: '5',
    letterName: 'Dobro (D)',
    drawnPath: 'M 25,70 L 40,70 L 40,25 L 60,25 L 60,70 L 75,70 M 20,80 L 80,80',
    timestamp: 'prije 12 minuta',
    status: 'pending' as const
  },
  {
    id: 'val-3',
    letterId: '7',
    letterName: 'Živjeti (Ž)',
    drawnPath: 'M 30,30 L 70,70 M 70,30 L 30,70 M 50,20 L 50,80 M 35,50 L 65,50',
    timestamp: 'prije 24 minute',
    status: 'pending' as const
  }
];
