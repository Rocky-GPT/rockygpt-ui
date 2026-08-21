/**
 * @module api/health/route
 * Process liveness only: this endpoint answers when the process can serve
 * HTTP, and deliberately checks no dependency. Whether the instance can
 * actually serve chat (database, active dataset, rate limiter) is
 * /api/readiness — pointing a load balancer's readiness probe here would
 * keep unready instances in rotation (PROB-016).
 */
export async function GET() {
  try {
    // You can add more health checks here (database ping, etc.)
    return Response.json({ 
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      uptime: process.uptime()
    });
  } catch {
    return Response.json({ 
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    }, { status: 503 });
  }
}
