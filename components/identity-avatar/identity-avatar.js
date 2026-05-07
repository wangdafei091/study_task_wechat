const { buildAvatarPresetPalette } = require('../../utils/user-avatar-presets');

function buildResolvedStyle({ avatarMode, avatarAccentColor, customStyle }) {
  const styleParts = [];

  if (avatarMode === 'preset') {
    const palette = buildAvatarPresetPalette(avatarAccentColor);
    styleParts.push(
      `background: linear-gradient(135deg, ${palette.startColor}, ${palette.endColor});`,
      `color: ${palette.textColor};`
    );
  }

  const normalizedCustomStyle = String(customStyle || '').trim();
  if (normalizedCustomStyle) {
    styleParts.push(normalizedCustomStyle.endsWith(';') ? normalizedCustomStyle : `${normalizedCustomStyle};`);
  }

  return styleParts.join(' ');
}

Component({
  properties: {
    size: {
      type: String,
      value: 'card'
    },
    avatarMode: {
      type: String,
      value: 'placeholder'
    },
    avatarUrl: {
      type: String,
      value: ''
    },
    avatarEmoji: {
      type: String,
      value: ''
    },
    avatarAccentColor: {
      type: String,
      value: ''
    },
    avatarText: {
      type: String,
      value: ''
    },
    customClass: {
      type: String,
      value: ''
    },
    customStyle: {
      type: String,
      value: ''
    }
  },

  data: {
    resolvedStyle: ''
  },

  observers: {
    'avatarMode, avatarAccentColor, customStyle': function(avatarMode, avatarAccentColor, customStyle) {
      this.setData({
        resolvedStyle: buildResolvedStyle({
          avatarMode,
          avatarAccentColor,
          customStyle
        })
      });
    }
  }
});
