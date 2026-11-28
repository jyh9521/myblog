import { getChronologies } from '../../lib/chronologies';
import { buildEventIndex } from '../../lib/chronology-search';
export const dynamic = 'force-static';
export function GET() { return Response.json(buildEventIndex(getChronologies())); }
