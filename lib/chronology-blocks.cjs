"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chronologyPattern = void 0;
exports.dossierBlocks = dossierBlocks;
exports.chronologyPattern = /^\[chronology\]([a-z0-9]+(?:-[a-z0-9]+)*)(?:\|([a-z0-9]+(?:-[a-z0-9]+)*))?\[\/chronology\]$/;
// Expand standalone blocks only, never literal examples in fenced/indented code.
function dossierBlocks(body) {
    const blocks = [];
    let pending = [], fence = '', fenceLength = 0;
    const flush = () => { if (pending.join('\n').trim())
        blocks.push({ type: 'markdown', body: pending.join('\n') }); pending = []; };
    for (const line of body.split(/\r?\n/)) {
        const marker = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if (marker) {
            if (!fence) {
                fence = marker[1][0];
                fenceLength = marker[1].length;
            }
            else if (marker[1][0] === fence && marker[1].length >= fenceLength && !marker[2].trim())
                fence = '';
            pending.push(line);
            continue;
        }
        const match = !fence && line.match(exports.chronologyPattern);
        if (match) {
            flush();
            blocks.push({ type: 'chronology', timeline: match[1], work: match[2] || '' });
        }
        else
            pending.push(line);
    }
    flush();
    return blocks;
}
