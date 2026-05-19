const RELEASE_AUDIENCES = ['all', 'parent', 'child', 'viewer', 'manager'];
const RELEASE_HIGHLIGHT_KINDS = ['new', 'improved', 'fixed'];

function normalizeString(value) {
  return String(value || '').trim();
}

function normalizeAudienceList(audiences = []) {
  const normalized = Array.isArray(audiences) ? audiences : [];
  const items = normalized
    .map((item) => normalizeString(item))
    .filter(Boolean);

  if (items.length === 0) {
    return ['all'];
  }

  return [...new Set(items)];
}

function normalizeHighlight(input = {}) {
  return {
    id: normalizeString(input.id),
    kind: normalizeString(input.kind || 'improved'),
    title: normalizeString(input.title),
    summary: normalizeString(input.summary),
    actionLabel: normalizeString(input.actionLabel),
    actionPath: normalizeString(input.actionPath)
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

class ReleaseNote {
  constructor(data = {}) {
    this.version = normalizeString(data.version);
    this.publishedAt = normalizeString(data.publishedAt);
    this.title = normalizeString(data.title);
    this.summary = normalizeString(data.summary);
    this.audiences = normalizeAudienceList(data.audiences);
    this.highlights = Array.isArray(data.highlights)
      ? data.highlights.map((item) => normalizeHighlight(item))
      : [];
  }

  validate() {
    const errors = [];

    if (!this.version) {
      errors.push('版本号不能为空');
    }

    if (!this.publishedAt) {
      errors.push('发布日期不能为空');
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(this.publishedAt)) {
      errors.push('发布日期格式无效');
    }

    if (!this.title) {
      errors.push('标题不能为空');
    }

    if (!this.summary) {
      errors.push('摘要不能为空');
    }

    if (!Array.isArray(this.audiences) || this.audiences.length === 0) {
      errors.push('受众不能为空');
    }

    this.audiences.forEach((audience) => {
      if (!RELEASE_AUDIENCES.includes(audience)) {
        errors.push(`受众类型无效: ${audience}`);
      }
    });

    if (!Array.isArray(this.highlights) || this.highlights.length === 0) {
      errors.push('至少需要 1 条高亮');
    }

    if (this.highlights.length > 3) {
      errors.push('高亮条目不能超过 3 条');
    }

    this.highlights.forEach((highlight, index) => {
      if (!highlight.id) {
        errors.push(`高亮${index + 1}缺少 id`);
      }
      if (!RELEASE_HIGHLIGHT_KINDS.includes(highlight.kind)) {
        errors.push(`高亮${index + 1}类型无效`);
      }
      if (!highlight.title) {
        errors.push(`高亮${index + 1}标题不能为空`);
      }
      if (!highlight.summary) {
        errors.push(`高亮${index + 1}摘要不能为空`);
      }
      if (highlight.actionPath && !highlight.actionPath.startsWith('/')) {
        errors.push(`高亮${index + 1}跳转路径无效`);
      }
    });

    return [...new Set(errors)];
  }

  matchesAudience(context = {}) {
    if (this.audiences.includes('all')) {
      return true;
    }

    const tags = new Set();
    const currentUser = context.currentUser || null;
    const loginUser = context.loginUser || null;
    const currentRole = normalizeString(currentUser && currentUser.role);
    const isParentView = currentRole === 'parent';
    const familyPermissionRole = isParentView
      ? normalizeString(
        (currentUser && currentUser.familyPermissionRole) ||
        (loginUser && loginUser.familyPermissionRole)
      )
      : '';

    if (currentRole) {
      tags.add(currentRole);
    }

    if (familyPermissionRole) {
      tags.add(familyPermissionRole);
    }

    return this.audiences.some((audience) => tags.has(audience));
  }

  toJSON() {
    return cloneJson({
      version: this.version,
      publishedAt: this.publishedAt,
      title: this.title,
      summary: this.summary,
      audiences: this.audiences,
      highlights: this.highlights
    });
  }
}

module.exports = ReleaseNote;
module.exports.RELEASE_AUDIENCES = RELEASE_AUDIENCES;
module.exports.RELEASE_HIGHLIGHT_KINDS = RELEASE_HIGHLIGHT_KINDS;
