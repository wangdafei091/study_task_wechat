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

function buildAvatarPresetValue(presetId) {
  const normalizedPresetId = normalizePresetId(presetId);
  if (!getAvatarPresetById(normalizedPresetId)) {
    return '';
  }

  return `preset:${normalizedPresetId}`;
}

module.exports = {
  DEFAULT_CHILD_AVATAR_PRESET_ID,
  USER_AVATAR_PRESETS,
  buildAvatarPresetValue,
  getAvatarPresetById
};
