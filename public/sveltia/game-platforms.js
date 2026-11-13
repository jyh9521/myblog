// One catalog shared by CMS, static rendering and both metadata providers.
// Unknown names are preserved; distinct operating systems and hardware stay distinct.
(function (root) {
  const aliases = new Map();
  const families = new Map();
  const key = value => String(value ?? '').trim().normalize('NFKC').toLowerCase().replace(/[\s_().:-]+/g, '');
  const add = (name, family, names = []) => {
    families.set(name, family);
    for (const alias of [name, ...names]) aliases.set(key(alias), name);
  };
  add('PC', 'pc', ['PC Windows', 'Windows', 'Windows PC', 'Microsoft Windows', 'PC (Microsoft Windows)', 'Steam']);
  add('macOS', 'pc', ['Mac', 'Mac OS', 'Mac OS X', 'OS X', 'Apple Macintosh', 'Macintosh']);
  add('Linux', 'pc');
  add('DOS', 'pc', ['MS-DOS', 'PC DOS']);
  add('PC-98', 'pc', ['PC98', 'NEC PC-9801', 'PC-9801']);
  add('PlayStation', 'playstation', ['PS', 'PS1', 'PSX', 'Sony PlayStation']);
  for (const n of [2, 3, 4, 5]) add(`PlayStation ${n}`, 'playstation', [`PS${n}`, `Sony PlayStation ${n}`]);
  add('PSP', 'playstation', ['PlayStation Portable', 'Sony PSP']);
  add('PS Vita', 'playstation', ['PlayStation Vita', 'Sony PS Vita', 'PSVita']);
  add('Xbox', 'xbox', ['Microsoft Xbox']);
  add('Xbox 360', 'xbox', ['Microsoft Xbox 360', 'X360']);
  add('Xbox One', 'xbox', ['Microsoft Xbox One']);
  add('Xbox Series X|S', 'xbox', ['Xbox Series X/S', 'Xbox Series S/X', 'Xbox Series S|X', 'Xbox Series X', 'Xbox Series S', 'Xbox Series', 'Microsoft Xbox Series X|S', 'Microsoft Xbox Series X/S', 'Microsoft Xbox Series S/X', 'Microsoft Xbox Series S|X', 'Microsoft Xbox Series X', 'Microsoft Xbox Series S']);
  add('NES', 'nintendo', ['Nintendo Entertainment System', 'Nintendo NES', 'Famicom', 'Nintendo Famicom']);
  add('SNES', 'nintendo', ['Super Nintendo', 'Super Nintendo Entertainment System', 'Super Famicom', 'Nintendo SNES']);
  add('SNES MSU-1', 'nintendo', ['Super Nintendo MSU-1', 'Super Famicom MSU-1']);
  add('Nintendo 64', 'nintendo', ['N64']);
  add('GameCube', 'nintendo', ['Nintendo GameCube', 'NGC']);
  add('Wii', 'nintendo', ['Nintendo Wii']);
  add('Wii U', 'nintendo', ['Nintendo Wii U']);
  add('Nintendo Switch', 'nintendo', ['Switch']);
  add('Nintendo Switch 2', 'nintendo', ['Switch 2']);
  add('Game Boy', 'nintendo', ['Nintendo Game Boy', 'Gameboy', 'GB']);
  add('Game Boy Color', 'nintendo', ['Nintendo Game Boy Color', 'GBC']);
  add('Game Boy Advance', 'nintendo', ['Nintendo Game Boy Advance', 'GBA']);
  add('Nintendo DS', 'nintendo', ['DS', 'NDS']);
  add('Nintendo DSi', 'nintendo', ['DSi']);
  add('Nintendo 3DS', 'nintendo', ['3DS']);

  /** @param {unknown} value */
  const normalizePlatform = value => aliases.get(key(value)) || String(value ?? '').trim();
  /** @param {unknown} values */
  const normalizePlatformList = values => [...new Set((Array.isArray(values) ? values : values ? [values] : []).map(normalizePlatform).filter(Boolean))];
  /** @param {unknown} value */
  const platformFamily = value => families.get(normalizePlatform(value)) || '';
  const catalog = Object.freeze({ normalizePlatform, normalizePlatformList, platformFamily });
  if (typeof module !== 'undefined' && module.exports) module.exports = catalog;
  else root.GamePlatforms = catalog;
})(typeof globalThis !== 'undefined' ? globalThis : this);
