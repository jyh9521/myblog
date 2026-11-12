
const entities = { amp: '&', apos: "'", quot: '"', lt: '<', gt: '>', nbsp: ' ', ndash: '–', mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', hellip: '…', trade: '™', reg: '®', copy: '©' };

export const charCount = text => [...text].length;

export function plainReference(value, limit = 6500) {
  if (typeof value !== 'string') return '';
  const text = value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (original, name) => {
    const key = name.toLowerCase();
    if (!key.startsWith('#')) return Object.hasOwn(entities, key) ? entities[key] : original;
    const code = key.startsWith('#x') ? parseInt(key.slice(2), 16) : Number(key.slice(1));
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : ' ';
  }).replace(/<!--[\s\S]*?-->|<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<(https?:\/\/[^<>\s]+)>/gi, '$1')
    .replace(/<\/?(?:br|p|li|div|h[1-6])\b[^>]*>/gi, '\n')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/\r\n?/g, '\n').replace(/[^\S\n]+/g, ' ')
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, '')
    .replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (charCount(text) <= limit) return text;
  const head = [...text].slice(0, limit).join('');
  const last = Math.max(...['。', '！', '？', '\n', '. ', '! ', '? '].map(end => head.lastIndexOf(end)));
  return (last > head.length * .6 ? head.slice(0, last + 1) : head).trim();
}

// Use unmistakable script characters plus regional expressions. Shared Han
// does not prove Simplified. Ignore Latin proper names in predominantly Han text.
const simplified = new Set('游戏过这为与发门关难乐术击敌战势变择进开场现险体历见边绝让对将给结继续线级旧梦声认达时点线机动协组画觉还吗么网势灵龙传飞数队岛经备发带厂业来页测赛购图库总专实创恶夺终灵剑卫剧称环剑奖尽脑枪牺阵课寻谁隐残职灭节扩刘陈张风云后'.replace(/[来后寻残]/g, ''));
const traditional = new Set('遊戲過這為與發門關難樂術擊敵戰勢變擇進開場現險體歷見邊絕讓對將給結繼續線級舊夢聲認達時點機動協組畫覺還嗎麼網靈龍傳飛數隊島經備帶廠業來頁測賽購圖庫總專實創惡奪終劍衛劇稱環獎盡腦槍犧陣課尋誰隱殘職滅節擴劉陳張風雲臺裏裡訊軟導從幫無種萬參製盜擁處搖節狀劇齊鄉層樓營寫遠記錄運壓錢覺職釋導養餘餓貓盤啟亞廢訂標觸壞燈鬥獸賣僅憶確偵體敵');
traditional.delete('來'); // Avoid counting rare isolated name variants as strong evidence.
for (const character of '软导从帮无种万参制盗拥处摇状齐乡层楼营写远记录运压钱释养余饿猫盘启亚废订标触坏灯斗兽卖仅忆确侦') simplified.add(character);
const regionalHant = /透過|藉由|藉著|支援|畫質|連線|主機|軟體|資料片|頭目|網路|存檔點|隨機|臺灣|角色扮演遊戲|遊玩時數/g;
const regionalHans = /通过|支持联机|画质|联机|主机|软件|资料片|首领|网络|存档点|随机|关卡|这款游戏|游玩时长/g;
const englishWords = /\b(?:a|an|the|and|or|you|your|to|for|from|of|with|in|as|is|are|their|into|across|through|will|this|can)\b/gi;

export function detectSynopsisLanguage(text) {
  const han = text.match(/\p{Script=Han}/gu) || [];
  const kana = text.match(/[\p{Script=Hiragana}\p{Script=Katakana}]/gu) || [];
  const latin = text.match(/\p{Script=Latin}+/gu) || [];
  if (kana.length >= 4 || (kana.length >= 2 && kana.length / (han.length + kana.length) > .12)
    || /\p{Script=Hangul}|\p{Script=Cyrillic}|\p{Script=Thai}|\p{Script=Arabic}/u.test(text)) return 'other';
  if (han.length >= 6 && han.length >= latin.length * 1.5) {
    const score = (characters, words) => [...new Set(han)].filter(character => characters.has(character)).length
      + (text.match(words) || []).length * 2;
    const hans = score(simplified, regionalHans), hant = score(traditional, regionalHant);
    if (hant >= 2 && hans >= 2 && Math.max(hant, hans) < Math.min(hant, hans) * 3) return 'zh-mixed';
    if (hant > hans) return 'zh-Hant';
    if (hans > hant) return 'zh-Hans';
    return 'zh-und';
  }
  const indicators = text.match(englishWords) || [];
  return latin.length >= 4 && indicators.length >= 2 && indicators.length / latin.length >= .14 ? 'en' : 'other';
}

export function synopsisMaterial(raw, kind, title = '') {
  const text = plainReference(raw, Infinity);
  if (!text) return null;
  const language = detectSynopsisLanguage(text);
  const mode = ['zh-Hans', 'zh-und'].includes(language) ? 'manual' : 'translate';
  return { text, kind, language, mode, title };
}
