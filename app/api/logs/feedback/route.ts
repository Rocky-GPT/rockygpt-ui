import { NextResponse } from 'next/server';
import { getRuntimePool } from '@rockygpt/data/db/runtime-pool';

export async function POST(req: Request) {
  try {
    const { logId, feedback } = await req.json();

    if (!logId) {
      return NextResponse.json({ error: 'Missing logId' }, { status: 400 });
    }

    const pool = getRuntimePool();
    if (!pool) {
      return NextResponse.json({ error: 'Database unavailable' }, { status: 503 });
    }

    await pool.query(
      `UPDATE rockygpt_v2.chat_logs SET feedback = $1 WHERE id = $2`,
      [feedback || null, logId]
    );

    return NextResponse.json({ success: true, logId, feedback });
  } catch (error) {
    console.error('Failed to update log feedback:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
