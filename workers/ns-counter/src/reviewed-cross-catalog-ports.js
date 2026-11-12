// Sparse cross-catalog ports: data backed by a publisher announcement, not a
// fuzzy title exception. Add a new record only after verifying both provider
// records, the edition and the exact platform against the cited source.
export const reviewedCrossCatalogPorts = [
  {
    title: 'Ys IX: Monstrum Nox',
    anchor: { id: '76875', platform: 'PlayStation 4', releaseDate: '2021-02-02' },
    port: {
      provider: 'screenscraper', id: '479669', systemId: '284', platform: 'PlayStation 5',
      releaseDates: ['2023-05-09', '2023-05-12', '2023-05-19'],
      displayRelease: { releaseDate: '2023-05-09', region: 'US' },
      developers: ['Falcom', 'Nihon Falcom'],
      publishers: ['NIS America', 'Falcom', 'Nihon Falcom'],
    },
    evidence: 'https://nisamerica.com/ys-ix/',
  },
];
