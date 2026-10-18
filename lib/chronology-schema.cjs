// Shared by the build loader and content validation. Bad spoiler metadata
// fails the build instead of silently exposing future revelations.
const slug = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
function validateChronology(data) {
  const errors = [];
  const text = value => typeof value === 'string' && !!value.trim();
  if (!data || typeof data !== 'object') return ['年表必须为对象'];
  if (!slug.test(data.id || '')) errors.push('年表 ID 无效');
  for (const field of ['title', 'description', 'calendarNote']) if (!text(data[field])) errors.push(`${field} 不能为空`);
  const ids = {};
  for (const field of ['works', 'eras', 'sources', 'events']) {
    ids[field] = new Set();
    if (!Array.isArray(data[field]) || !data[field].length) { errors.push(`${field} 必须为非空列表`); continue; }
    for (const entry of data[field]) {
      if (!entry || typeof entry !== 'object') { errors.push(`${field} 条目必须为对象`); continue; }
      if (!slug.test(entry.id || '') || ids[field].has(entry.id)) errors.push(`${field} ID 无效或重复：${entry.id}`);
      ids[field].add(entry.id);
      if (!text(entry.title)) errors.push(`${field}.${entry.id} 标题不能为空`);
    }
  }
  for (const era of Array.isArray(data.eras) ? data.eras : []) if (!text(era?.calendar)) errors.push('时代必须指定纪年');
  if (data.terms !== undefined) {
    const termIds = new Set();
    if (!Array.isArray(data.terms)) errors.push('中文译名对照必须为列表');
    else for (const term of data.terms) {
      if (!term || !slug.test(term.id || '') || termIds.has(term.id) || !text(term.title) || !text(term.kind) || !text(term.note)) errors.push('中文译名对照条目无效');
      termIds.add(term?.id);
      if (term?.aliases !== undefined && (!Array.isArray(term.aliases) || term.aliases.some(value => !text(value)))) errors.push('中文译名别名必须为文本列表');
    }
  }
  for (const source of Array.isArray(data.sources) ? data.sources : []) {
    for (const field of ['kind', 'family', 'scope']) if (source[field] !== undefined && !text(source[field])) errors.push(`${source.id}.${field} 必须为非空文本`);
    try { const url = new URL(source.url); if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw Error(); }
    catch { errors.push(`来源链接无效：${source?.id}`); }
  }
  for (const event of Array.isArray(data.events) ? data.events : []) {
    if (!event || typeof event !== 'object') continue;
    if (!ids.eras.has(event.era)) errors.push(`${event.id} 引用不存在的时代`);
    if (!text(event.year) || !text(event.summary) || !Number.isFinite(event.yearOrder) || !Number.isFinite(event.order)) errors.push(`${event.id} 年份、摘要或排序无效`);
    if (!['compiled', 'game', 'manual', 'inferred', 'disputed'].includes(event.evidence)) errors.push(`${event.id} 依据类型无效`);
    for (const [field, target, nonempty] of [['works', 'works', true], ['spoilerWorks', 'works', false], ['sources', 'sources', true], ['related', 'events', false]]) {
      const values = event[field];
      if (field === 'related' && values === undefined) continue;
      if (!Array.isArray(values) || (nonempty && !values.length)) { errors.push(`${event.id}.${field} 必须明确填写列表`); continue; }
      if (new Set(values).size !== values.length || values.some(id => !ids[target].has(id) || (field === 'related' && id === event.id))) errors.push(`${event.id}.${field} 引用无效或重复`);
    }
    if (event.keywords !== undefined && (!Array.isArray(event.keywords) || event.keywords.some(value => !text(value)))) errors.push(`${event.id} 检索词无效`);
    if (event.sourceLines !== undefined && (!Array.isArray(event.sourceLines) || new Set(event.sourceLines).size !== event.sourceLines.length || event.sourceLines.some(value => !Number.isInteger(value) || value < 1))) errors.push(`${event.id} 底本行号无效`);
    for (const field of ['day', 'detail', 'note']) if (event[field] !== undefined && typeof event[field] !== 'string') errors.push(`${event.id}.${field} 必须为文本`);
    if (event.citations !== undefined) {
      if (!Array.isArray(event.citations) || !event.citations.length) errors.push(`${event.id} 引证不能为空`);
      else for (const citation of event.citations) {
        if (!citation || !ids.sources.has(citation.source) || !event.sources?.includes(citation.source) || !text(citation.locator) || !['event', 'date', 'context', 'variant'].includes(citation.supports)) errors.push(`${event.id} 引证来源、定位或用途无效`);
      }
    }
    for (const citation of event.citations || []) if (citation?.medium !== undefined && !['game-capture', 'game-transcript', 'manual-scan', 'firsthand-guide', 'secondary'].includes(citation.medium)) errors.push(`${event.id} 原典载体类型无效`);
    if (event.verification === 'corrected' && !event.citations?.some(citation => ['game-capture', 'game-transcript', 'manual-scan'].includes(citation.medium))) errors.push(`${event.id} 原作订正须有原典引证`);
    if (event.verification && !['crosschecked', 'single-source', 'conflict', 'corrected'].includes(event.verification)) errors.push(`${event.id} 核对状态无效`);
    if (event.dateStatus && !['crosschecked', 'single-source', 'conflict', 'undated'].includes(event.dateStatus)) errors.push(`${event.id} 日期状态无效`);
  }
  return errors;
}
module.exports = { validateChronology };
