import { getChronologies } from '../../lib/chronologies';
export const dynamic = 'force-static';
// CMS metadata, not an independent public reading page.
export function GET() { return Response.json(getChronologies().map(({ id, title, works }) => ({ id, title, works }))); }
