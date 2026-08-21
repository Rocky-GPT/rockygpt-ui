import { NextRequest, NextResponse } from 'next/server';
import { loadDataExplorer } from '../../../../data-explorer/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const datasetKey = searchParams.get('dataset') || undefined;
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : undefined;
    const search = searchParams.get('search') || undefined;
    const sort = searchParams.get('sort') || undefined;
    const direction = searchParams.get('direction') || undefined;
    const status = searchParams.get('status') || undefined;
    const topic = searchParams.get('topic') || undefined;
    const route = searchParams.get('route') || undefined;
    const dateFrom = searchParams.get('dateFrom') || undefined;
    const dateTo = searchParams.get('dateTo') || undefined;
    const origins = searchParams.get('origins') || undefined;

    const payload = await loadDataExplorer({
      datasetKey,
      page,
      search,
      sort,
      direction,
      status,
      topic,
      route,
      dateFrom,
      dateTo,
      origins,
    });

    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load data explorer records.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
