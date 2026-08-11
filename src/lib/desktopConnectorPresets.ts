export type DesktopConnectorPreset = {
  id: string;
  seed: number;
  curveRandomOffset: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
};

// These slots mirror the 16 supplied desktop selections. D040 was supplied twice,
// so it intentionally occupies two slots in the random choice.
export const DESKTOP_CONNECTOR_PRESETS: readonly DesktopConnectorPreset[] = [
  {
    id: 'D028',
    seed: 2932811476,
    curveRandomOffset: 5,
    start: { x: 0.14040161775771257, y: 0.7365254103535354 },
    end: { x: 0.7582651429646351, y: 0.2218671085858586 },
  },
  {
    id: 'D025',
    seed: 1291755235,
    curveRandomOffset: 5,
    start: { x: 0.11182044770504139, y: 0.4776870265151515 },
    end: { x: 0.6871825620767494, y: 0.6491477272727273 },
  },
  {
    id: 'D040',
    seed: 691868972,
    curveRandomOffset: 5,
    start: { x: 0.2811206734386757, y: 0.2719381313131313 },
    end: { x: 0.8700620767494357, y: 0.7858664772727273 },
  },
  {
    id: 'D040',
    seed: 691868972,
    curveRandomOffset: 5,
    start: { x: 0.2811206734386757, y: 0.2719381313131313 },
    end: { x: 0.8700620767494357, y: 0.7858664772727273 },
  },
  {
    id: 'D037',
    seed: 3217759937,
    curveRandomOffset: 5,
    start: { x: 0.2630502257336343, y: 0.8136245265151515 },
    end: { x: 0.8761286681715575, y: 0.24846117424242425 },
  },
  {
    id: 'D051',
    seed: 1477055058,
    curveRandomOffset: 5,
    start: { x: 0.25819460120391274, y: 0.5776120580808081 },
    end: { x: 0.8483117005267118, y: 0.21581044823232323 },
  },
  {
    id: 'D041',
    seed: 2902640495,
    curveRandomOffset: 5,
    start: { x: 0.12072046651617757, y: 0.7120225694444444 },
    end: { x: 0.6948481000752446, y: 0.3490175189393939 },
  },
  {
    id: 'D074',
    seed: 383098666,
    curveRandomOffset: 5,
    start: { x: 0.10126269751693003, y: 0.5983862058080808 },
    end: { x: 0.7999082957110609, y: 0.21243686868686867 },
  },
  {
    id: 'D077',
    seed: 4289359229,
    curveRandomOffset: 5,
    start: { x: 0.2902911023325809, y: 0.6399739583333334 },
    end: { x: 0.862890331075997, y: 0.18361347853535354 },
  },
  {
    id: 'D071',
    seed: 3272254694,
    curveRandomOffset: 5,
    start: { x: 0.2929952031602709, y: 0.42136205808080807 },
    end: { x: 0.824668453724605, y: 0.797427398989899 },
  },
  {
    id: 'D090',
    seed: 628406669,
    curveRandomOffset: 5,
    start: { x: 0.11150300978179083, y: 0.348465119949495 },
    end: { x: 0.7564663280662152, y: 0.7943102904040404 },
  },
  {
    id: 'D050',
    seed: 186598086,
    curveRandomOffset: 5,
    start: { x: 0.1747201843491347, y: 0.31180950126262624 },
    end: { x: 0.6620109104589917, y: 0.519827178030303 },
  },
  {
    id: 'D079',
    seed: 2878080481,
    curveRandomOffset: 13,
    start: { x: 0.19702313769751692, y: 0.4952651515151515 },
    end: { x: 0.8132642024078255, y: 0.14867424242424243 },
  },
  {
    id: 'D087',
    seed: 1718720233,
    curveRandomOffset: 5,
    start: { x: 0.2291196388261851, y: 0.362472380050505 },
    end: { x: 0.7989207110609481, y: 0.8484453914141414 },
  },
  {
    id: 'D095',
    seed: 1236194811,
    curveRandomOffset: 5,
    start: { x: 0.25679552294958613, y: 0.41051136363636365 },
    end: { x: 0.8650771256583898, y: 0.7458964646464646 },
  },
  {
    id: 'D093',
    seed: 2809593736,
    curveRandomOffset: 5,
    start: { x: 0.1134076373212942, y: 0.4633246527777778 },
    end: { x: 0.6634099887133182, y: 0.24402225378787878 },
  },
];

export const chooseDesktopConnectorPreset = (
  random: () => number = Math.random,
): DesktopConnectorPreset => {
  const index = Math.min(
    Math.floor(random() * DESKTOP_CONNECTOR_PRESETS.length),
    DESKTOP_CONNECTOR_PRESETS.length - 1,
  );

  return DESKTOP_CONNECTOR_PRESETS[Math.max(index, 0)];
};

export const createDesktopConnectorCurveRandom = (
  preset: DesktopConnectorPreset,
): (() => number) => {
  let state = preset.seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };

  for (let index = 0; index < preset.curveRandomOffset; index += 1) {
    random();
  }

  return random;
};
