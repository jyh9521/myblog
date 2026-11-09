import assert from 'node:assert/strict';

// Use real rendered geometry; a row can have its own box while its labels
// spill into the neighbouring row. Check hidden (scrollable) rows too.
export async function measureCandidateLayout(list) {
  return list.evaluate(element => {
    const buttons = [...element.querySelectorAll(':scope > button.dossier-candidate')];
    const rect = node => node.getBoundingClientRect();
    const epsilon = 1;
    const rows = buttons.map(button => {
      const box = rect(button);
      const labels = [...button.querySelectorAll(':scope > span:first-child > *, :scope > .dossier-badge')].map(rect);
      return { box, labels, overflow: labels.some(label => label.top < box.top - epsilon ||
        label.bottom > box.bottom + epsilon || label.left < box.left - epsilon || label.right > box.right + epsilon) };
    });
    const overlap = rows.slice(1).filter((row, index) => {
      const previousBottom = Math.max(...rows[index].labels.map(label => label.bottom));
      const currentTop = Math.min(...row.labels.map(label => label.top));
      return previousBottom > currentTop + epsilon;
    }).length;
    const before = element.scrollTop;
    // The CMS can enable smooth scrolling globally. Read the final geometry
    // synchronously instead of measuring while that animation is in flight.
    element.scrollTo({ top: element.scrollHeight, behavior: 'instant' });
    const end = buttons.at(-1)?.getBoundingClientRect();
    const endVisible = Boolean(end && end.bottom <= rect(element).top + element.clientHeight + epsilon);
    element.scrollTo({ top: before, behavior: 'instant' });
    return {
      cards: rows.length, overflow: rows.filter(row => row.overflow).length, overlap,
      horizontalOverflow: element.scrollWidth - element.clientWidth,
      scroll: element.scrollHeight > element.clientHeight, endVisible,
      minRowHeight: Math.round(Math.min(...rows.map(row => row.box.height))),
    };
  });
}

export function assertCandidateLayout(metrics, expectedCount, label) {
  assert.equal(metrics.cards, expectedCount, label + ': candidate count');
  assert.equal(metrics.overflow, 0, label + ': content spills out of candidate cards');
  assert.equal(metrics.overlap, 0, label + ': adjacent rows overlap');
  assert.ok(metrics.horizontalOverflow <= 1, label + ': unexpected horizontal scroll');
  assert.ok(metrics.scroll && metrics.endVisible, label + ': the last candidate is reachable');
}
