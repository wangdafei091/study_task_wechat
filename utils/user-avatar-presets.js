const DEFAULT_CHILD_AVATAR_PRESET_ID = 'cat';

const USER_AVATAR_PRESETS = [
  { presetId: 'cat', emoji: '🐱', label: '小猫', accentColor: '#F5A623' },
  { presetId: 'dog', emoji: '🐶', label: '小狗', accentColor: '#D98E5F' },
  { presetId: 'rabbit', emoji: '🐰', label: '小兔', accentColor: '#F8A5C2' },
  { presetId: 'bear', emoji: '🐻', label: '小熊', accentColor: '#C58B5C' },
  { presetId: 'fox', emoji: '🦊', label: '小狐狸', accentColor: '#F2994A' },
  { presetId: 'panda', emoji: '🐼', label: '熊猫', accentColor: '#90A4AE' },
  { presetId: 'koala', emoji: '🐨', label: '考拉', accentColor: '#A0AEC0' },
  { presetId: 'chick', emoji: '🐥', label: '小鸡', accentColor: '#F6C945' }
];

const PRESET_MAP = USER_AVATAR_PRESETS.reduce((result, item) => {
  result[item.presetId] = item;
  return result;
}, Object.create(null));

function normalizePresetId(presetId) {
  return String(presetId || '').trim();
}

function getAvatarPresetById(presetId) {
  const normalizedPresetId = normalizePresetId(presetId);
  return PRESET_MAP[normalizedPresetId] || null;
}

function isAvatarPresetValue(value) {
  return /^preset:[a-z0-9_-]+$/i.test(String(value || '').trim());
}

function parseAvatarPresetId(value) {
  const normalizedValue = String(value || '').trim();
  if (!isAvatarPresetValue(normalizedValue)) {
    return '';
  }

  return normalizedValue.slice('preset:'.length);
}

function buildAvatarPresetValue(presetId) {
  const normalizedPresetId = normalizePresetId(presetId);
  if (!getAvatarPresetById(normalizedPresetId)) {
    return '';
  }

  return `preset:${normalizedPresetId}`;
}

function listAvatarPresets() {
  return USER_AVATAR_PRESETS.map((item) => ({ ...item }));
}

function parseHexColor(color) {
  const normalized = String(color || '').trim().replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }

  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16)
  };
}

function mixChannel(base, target, ratio) {
  return Math.round(base + (target - base) * ratio);
}

function toHexChannel(value) {
  return Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');
}

function rgbToHex(rgb) {
  if (!rgb) {
    return '';
  }

  return `#${toHexChannel(rgb.r)}${toHexChannel(rgb.g)}${toHexChannel(rgb.b)}`;
}

function mixHexColor(color, targetColor, ratio) {
  const source = parseHexColor(color);
  const target = parseHexColor(targetColor);
  if (!source || !target) {
    return '';
  }

  return rgbToHex({
    r: mixChannel(source.r, target.r, ratio),
    g: mixChannel(source.g, target.g, ratio),
    b: mixChannel(source.b, target.b, ratio)
  });
}

function buildAvatarPresetPalette(accentColor) {
  const normalizedAccentColor = String(accentColor || '').trim();
  if (!parseHexColor(normalizedAccentColor)) {
    return {
      startColor: '#fff7d6',
      endColor: '#ffe9a8',
      textColor: '#7c5a00'
    };
  }

  return {
    startColor: mixHexColor(normalizedAccentColor, '#ffffff', 0.78),
    endColor: mixHexColor(normalizedAccentColor, '#ffffff', 0.58),
    textColor: mixHexColor(normalizedAccentColor, '#1f2937', 0.18) || normalizedAccentColor
  };
}

module.exports = {
  DEFAULT_CHILD_AVATAR_PRESET_ID,
  USER_AVATAR_PRESETS,
  buildAvatarPresetPalette,
  buildAvatarPresetValue,
  getAvatarPresetById,
  isAvatarPresetValue,
  listAvatarPresets,
  parseAvatarPresetId
};
