export type TabletConnectorPreset = {
  id: string;
  seed: number;
  curveRandomOffset: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
};

// These slots mirror the ten supplied tablet selections captured at 834 x 1112.
// Normalized centers keep the layouts responsive while the seed and offset replay
// the selected curve geometry independently of the labels used by each route.
export const TABLET_CONNECTOR_PRESETS: readonly TabletConnectorPreset[] = [
  {
    id: 'T042',
    seed: 1591473750,
    curveRandomOffset: 13,
    start: { x: 0.1994765920325676, y: 0.3710619918699187 },
    end: { x: 0.8054667054376272, y: 0.6854357215447154 },
  },
  {
    id: 'T016',
    seed: 115959628,
    curveRandomOffset: 45,
    start: { x: 0.36748639554687823, y: 0.5997522865853658 },
    end: { x: 0.8571220869854194, y: 0.33995490345528456 },
  },
  {
    id: 'T032',
    seed: 3966224421,
    curveRandomOffset: 5,
    start: { x: 0.15563078968138577, y: 0.21936928353658536 },
    end: { x: 0.7040460266688822, y: 0.45426829268292684 },
  },
  {
    id: 'T017',
    seed: 1256022406,
    curveRandomOffset: 5,
    start: { x: 0.35647821210484776, y: 0.3233771595528455 },
    end: { x: 0.7895359946828397, y: 0.6431656504065041 },
  },
  {
    id: 'T029',
    seed: 2130944456,
    curveRandomOffset: 5,
    start: { x: 0.18182195821044322, y: 0.3298875762195122 },
    end: { x: 0.7593154156108504, y: 0.614233993902439 },
  },
  {
    id: 'T019',
    seed: 1949080167,
    curveRandomOffset: 9,
    start: { x: 0.17050222240684584, y: 0.7347560975609756 },
    end: { x: 0.6562331242470818, y: 0.5480341717479674 },
  },
  {
    id: 'T027',
    seed: 4082943986,
    curveRandomOffset: 17,
    start: { x: 0.15428072944792923, y: 0.26662538109756095 },
    end: { x: 0.6869314169401404, y: 0.5843178353658537 },
  },
  {
    id: 'T021',
    seed: 3498346267,
    curveRandomOffset: 13,
    start: { x: 0.17336850413326133, y: 0.27647040142276424 },
    end: { x: 0.8540273335271882, y: 0.528248856707317 },
  },
  {
    id: 'T009',
    seed: 4185446322,
    curveRandomOffset: 33,
    start: { x: 0.2095708885473352, y: 0.48400978150406504 },
    end: { x: 0.8598222074523325, y: 0.25811420223577236 },
  },
  {
    id: 'T039',
    seed: 3019193400,
    curveRandomOffset: 5,
    start: { x: 0.19343247621816972, y: 0.607421875 },
    end: { x: 0.7182735845137707, y: 0.30656122967479676 },
  },
];

export const chooseTabletConnectorPreset = (
  random: () => number = Math.random,
): TabletConnectorPreset => {
  const index = Math.min(
    Math.floor(random() * TABLET_CONNECTOR_PRESETS.length),
    TABLET_CONNECTOR_PRESETS.length - 1,
  );

  return TABLET_CONNECTOR_PRESETS[Math.max(index, 0)];
};

export const createTabletConnectorCurveRandom = (
  preset: TabletConnectorPreset,
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
