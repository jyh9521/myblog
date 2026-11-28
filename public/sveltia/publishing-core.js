(function (root) {
  'use strict';
  // Compatibility boundary: pinned Sveltia 0.256.1 draft-backups only.
  const DATABASE = 'github:jyh9521/myblog', STORE = 'draft-backups';
  const MAX_BYTES = 64 * 1024 * 1024, MAX_TEXT = 96 * 1024 * 1024;
  const FIELDS = new Set(['timestamp', 'cmsConfigVersion', 'collectionName', 'slug', 'currentLocales', 'currentSlugs', 'currentPath', 'currentValues', 'files', 'pendingEntries', 'baseEntry']);
  const TYPED = { Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array, BigInt64Array, BigUint64Array, DataView };
  const plain = value => value !== null && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value));
  const fail = message => { throw Error(message || '草稿文件格式无效。'); };
  const safeKey = key => typeof key === 'string' && !['__proto__', 'constructor', 'prototype'].includes(key);
  function validateRecords(records) {
    if (!Array.isArray(records) || records.length > 1000) fail();
    const keys = new Set();
    for (const record of records) {
      if (!plain(record) || Object.keys(record).some(key => !FIELDS.has(key))) fail('草稿包含未知字段，未导出或写入。');
      if (typeof record.collectionName !== 'string' || !/^[\w-]{1,200}$/.test(record.collectionName) || typeof record.slug !== 'string' || record.slug.length > 4096 || /[\0-\x1f]/.test(record.slug)) fail();
      if (!(record.timestamp instanceof Date) || !Number.isFinite(record.timestamp.getTime()) || typeof record.cmsConfigVersion !== 'string' || !record.cmsConfigVersion || record.cmsConfigVersion.length > 256) fail();
      for (const key of ['currentLocales', 'currentSlugs', 'currentValues', 'files']) if (!plain(record[key])) fail();
      for (const values of Object.values(record.currentValues)) if (!plain(values)) fail();
      if (record.pendingEntries !== undefined && !Array.isArray(record.pendingEntries)) fail();
      if (record.currentPath !== undefined && typeof record.currentPath !== 'string') fail();
      if (record.baseEntry !== undefined && !plain(record.baseEntry)) fail();
      for (const asset of Object.values(record.files)) if (!plain(asset) || !(asset.file instanceof Blob)) fail('待上传文件的字节不完整。');
      const key = JSON.stringify([record.collectionName, record.slug]);
      if (keys.has(key)) fail('草稿键重复。');
      keys.add(key);
    }
    return records;
  }
  const budget = () => ({ nodes: 0, bytes: 0, seen: new WeakSet() });
  function count(context, depth, bytes = 0) {
    context.bytes += bytes;
    if (++context.nodes > 200000 || depth > 100 || context.bytes > MAX_BYTES) fail('草稿超过导入导出大小限制。');
  }
  function base64(bytes) {
    let value = '';
    for (let i = 0; i < bytes.length; i += 16384) value += String.fromCharCode(...bytes.subarray(i, i + 16384));
    return btoa(value);
  }
  function unbase64(value, context) {
    if (typeof value !== 'string' || value.length % 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) fail();
    count(context, 0, value.length * 3 / 4);
    return Uint8Array.from(atob(value), char => char.charCodeAt(0));
  }
  async function encode(value, context, depth = 0) {
    count(context, depth);
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return ['value', value];
    if (typeof value === 'undefined') return ['undefined'];
    if (typeof value === 'number') return ['number', Object.is(value, -0) ? '-0' : String(value)];
    if (typeof value === 'bigint') return ['bigint', String(value)];
    if (typeof value !== 'object' || context.seen.has(value)) fail('草稿含不支持的类型或循环引用。');
    context.seen.add(value);
    try {
      if (value instanceof Date) { if (!Number.isFinite(value.getTime())) fail(); return ['date', value.toISOString()]; }
      if (value instanceof Blob) {
        count(context, depth, value.size);
        return typeof File !== 'undefined' && value instanceof File
          ? ['file', base64(new Uint8Array(await value.arrayBuffer())), value.type, value.name, value.lastModified]
          : ['blob', base64(new Uint8Array(await value.arrayBuffer())), value.type];
      }
      if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) {
        const bytes = value instanceof ArrayBuffer ? new Uint8Array(value) : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        count(context, depth, bytes.byteLength);
        return ['bytes', value instanceof ArrayBuffer ? 'ArrayBuffer' : value.constructor.name, base64(bytes)];
      }
      if (value instanceof Map) {
        const pairs = [];
        for (const [key, item] of value) pairs.push([await encode(key, context, depth + 1), await encode(item, context, depth + 1)]);
        return ['map', pairs];
      }
      if (value instanceof Set || Array.isArray(value)) {
        const items = [];
        for (const item of value) items.push(await encode(item, context, depth + 1));
        return [value instanceof Set ? 'set' : 'array', items];
      }
      if (!plain(value)) fail();
      const entries = [];
      for (const key of Object.keys(value)) { if (!safeKey(key)) fail(); entries.push([key, await encode(value[key], context, depth + 1)]); }
      return ['object', entries];
    } finally { context.seen.delete(value); }
  }
  function decode(node, context, depth = 0) {
    count(context, depth);
    if (!Array.isArray(node) || typeof node[0] !== 'string') fail();
    const [tag, value] = node;
    const length = n => { if (node.length !== n) fail(); };
    if (tag === 'undefined') { length(1); return undefined; }
    if (tag === 'value') { length(2); if (value !== null && !['string', 'boolean'].includes(typeof value)) fail(); return value; }
    if (tag === 'number') { length(2); if (typeof value !== 'string' || !['NaN', 'Infinity', '-Infinity', '-0'].includes(value) && String(Number(value)) !== value) fail(); return Number(value); }
    if (tag === 'bigint') { length(2); if (typeof value !== 'string' || !/^-?\d{1,1000}$/.test(value)) fail(); return BigInt(value); }
    if (tag === 'date') { length(2); const date = new Date(value); if (typeof value !== 'string' || !Number.isFinite(date.getTime()) || date.toISOString() !== value) fail(); return date; }
    if (tag === 'blob' || tag === 'file') {
      length(tag === 'file' ? 5 : 3);
      if (typeof node[2] !== 'string' || node[2].length > 256) fail();
      const bytes = unbase64(value, context);
      if (tag === 'blob') return new Blob([bytes], { type: node[2] });
      if (typeof node[3] !== 'string' || node[3].length > 4096 || !Number.isSafeInteger(node[4])) fail();
      return new File([bytes], node[3], { type: node[2], lastModified: node[4] });
    }
    if (tag === 'bytes') {
      length(3); const buffer = unbase64(node[2], context).buffer;
      if (value === 'ArrayBuffer') return buffer;
      if (!Object.hasOwn(TYPED, value)) fail();
      return new TYPED[value](buffer);
    }
    length(2);
    if (!Array.isArray(value)) fail();
    if (tag === 'array' || tag === 'set') { const items = value.map(item => decode(item, context, depth + 1)); return tag === 'set' ? new Set(items) : items; }
    if (tag === 'map') {
      const result = new Map();
      for (const pair of value) { if (!Array.isArray(pair) || pair.length !== 2) fail(); const key = decode(pair[0], context, depth + 1); if (result.has(key)) fail(); result.set(key, decode(pair[1], context, depth + 1)); }
      return result;
    }
    if (tag !== 'object') fail();
    const result = {};
    for (const pair of value) {
      if (!Array.isArray(pair) || pair.length !== 2 || !safeKey(pair[0]) || Object.hasOwn(result, pair[0])) fail();
      Object.defineProperty(result, pair[0], { value: decode(pair[1], context, depth + 1), enumerable: true, writable: true, configurable: true });
    }
    return result;
  }
  async function exportDrafts(records, configSHA256) {
    validateRecords(records);
    if (!/^[a-f0-9]{64}$/.test(configSHA256)) fail('后台配置校验失败。');
    const context = budget(), encoded = [];
    for (const record of records) encoded.push(await encode(record, context));
    const text = JSON.stringify({ format: 'blog-sveltia-drafts', version: 1, database: DATABASE, cmsVersion: '0.256.1', configSHA256, exportedAt: new Date().toISOString(), records: encoded });
    if (text.length > MAX_TEXT) fail('草稿超过导入导出大小限制。');
    return text;
  }
  async function parseDrafts(text, configSHA256) {
    if (typeof text !== 'string' || text.length > MAX_TEXT) fail();
    const data = JSON.parse(text);
    if (!plain(data) || data.format !== 'blog-sveltia-drafts' || data.version !== 1 || data.database !== DATABASE || data.cmsVersion !== '0.256.1' || !Array.isArray(data.records) || data.records.length > 1000) fail();
    if (!/^[a-f0-9]{64}$/.test(configSHA256) || data.configSHA256 !== configSHA256) fail('后台配置已变化，请在原配置版本恢复草稿后再迁移。');
    const context = budget();
    return validateRecords(data.records.map(record => decode(record, context)));
  }
  function openDatabase(factory) {
    return new Promise((resolve, reject) => {
      let absent = false;
      const request = factory.open(DATABASE);
      request.onupgradeneeded = () => {
        // Only the CMS owns schema creation/upgrades. An aborted initial open
        // leaves no new database behind.
        absent = true; request.transaction.abort();
      };
      request.onerror = () => absent ? resolve(null) : reject(Error('本地草稿数据库读取失败。'));
      request.onblocked = () => reject(Error('请先关闭其他后台标签页，再重试。'));
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) { db.close(); reject(Error('当前数据库尚未建立草稿备份，请先在 CMS 中编辑一次。')); return; }
        const keyPath = db.transaction(STORE).objectStore(STORE).keyPath;
        if (!Array.isArray(keyPath) || keyPath.length !== 2 || keyPath[0] !== 'collectionName' || keyPath[1] !== 'slug') { db.close(); reject(Error('草稿数据库结构与当前 CMS 版本不匹配。')); return; }
        db.onversionchange = () => db.close(); resolve(db);
      };
    });
  }
  async function readDrafts(factory = root.indexedDB) {
    const db = await openDatabase(factory);
    if (!db) return [];
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly'), request = tx.objectStore(STORE).getAll();
        tx.oncomplete = () => resolve(request.result);
        tx.onabort = tx.onerror = () => reject(Error('本地草稿读取失败。'));
      });
    } finally { db.close(); }
  }
  async function importDrafts(text, configSHA256, factory = root.indexedDB) {
    // Decode the entire document before opening a write transaction. add() never
    // overwrites a newer local backup, even if another tab writes concurrently.
    const records = await parseDrafts(text, configSHA256);
    if (!records.length) return 0;
    const db = await openDatabase(factory);
    if (!db) fail('草稿数据库尚未初始化，请先在 CMS 中编辑并返回列表，再导入。');
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite'), store = tx.objectStore(STORE);
        tx.oncomplete = () => resolve(records.length);
        tx.onerror = () => {};
        tx.onabort = () => reject(Error(tx.error?.name === 'ConstraintError' ? '已有同名本地草稿，整批导入已撤销；现有草稿保持不变。' : '导入事务已撤销；现有草稿保持不变。'));
        try { for (const record of records) store.add(record); } catch { tx.abort(); }
      });
    } finally { db.close(); }
  }
  function canImportAt(hash) { return /^#\/collections(?:\/[^/?#]+)?\/?(?:\?[^#]*)?$/.test(hash); }
  function publishedEntryPath(hash, files) {
    const match = /^#\/collections\/(post|games|chronologies)\/entries\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\?[^#]*)?$/.exec(hash);
    if (!match || !Array.isArray(files)) return null;
    const prefix = { post: 'posts', games: 'games', chronologies: 'chronicles' }[match[1]], path = `${prefix}/${match[2]}/index.html`;
    return files.some(file => file?.path === path) ? `/${prefix}/${match[2]}/` : null;
  }
  function deploymentState({ sha, live, run, jobs = [] }) {
    const valid = /^[a-f0-9]{40}$/.test(sha || '');
    const repository = valid ? { kind: 'success', label: `仓库 main：${sha.slice(0, 7)}（不是上线证明）` } : { kind: 'unknown', label: '仓库 main：查询未确认' };
    let primary = { kind: 'unknown', label: '主站：实时版本未确认' }, fallback = { kind: 'unknown', label: 'Pages 回退：当前提交的任务未确认' };
    const matching = valid && run?.head_sha === sha;
    if (matching) {
      const build = jobs.find(job => job.name === 'build'), deploy = jobs.find(job => job.name === 'deploy');
      const verify = build?.steps?.find(step => step.name === 'Verify primary release');
      if (verify?.conclusion === 'success') primary = { kind: 'verified', label: '主站：此提交的流水线核验通过，实时回读待确认' };
      else if (verify?.conclusion === 'failure' || build?.conclusion === 'failure') primary = { kind: 'error', label: '主站：构建或发布核验失败' };
      else if (run.status !== 'completed') primary = { kind: 'pending', label: '主站：构建或发布进行中' };
      if (deploy?.status === 'completed') fallback = deploy.conclusion === 'success'
        ? { kind: 'success', label: 'Pages 回退：此提交部署任务成功（非主站回读）' }
        : { kind: 'error', label: `Pages 回退：此提交${deploy.conclusion === 'skipped' ? '未执行' : deploy.conclusion === 'cancelled' ? '已取消' : '失败'}；不代表主站失败` };
      else if (deploy || run.status !== 'completed') fallback = { kind: 'pending', label: 'Pages 回退：等待或部署中' };
    }
    if (valid && live?.hosting === 'workers-static-assets' && /^[a-f0-9]{40}$/.test(live.release || '')) primary = live.release === sha
      ? { kind: 'success', label: `主站：已回读当前 main ${sha.slice(0, 7)}` }
      : { kind: 'pending', label: `主站：仍为 ${live.release.slice(0, 7)}，与当前 main 不同` };
    return { repository, primary, fallback };
  }
  const api = { DATABASE, STORE, MAX_TEXT, exportDrafts, parseDrafts, readDrafts, importDrafts, canImportAt, publishedEntryPath, deploymentState };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BlogPublishingCore = Object.freeze(api);
})(typeof window !== 'undefined' ? window : globalThis);
