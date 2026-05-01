import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';

const http = httpRouter();

// Only the ingest-bridge calls this. Shared secret rotated quarterly.
http.route({
  path: '/ingest/checkpoint',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    if (req.headers.get('x-ingest-secret') !== process.env.INGEST_SHARED_SECRET) {
      return new Response('unauthorized', { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response('invalid json', { status: 400 });
    }

    const result = await ctx.runMutation(
      internal.ingest.recordCheckpoint.recordCheckpoint,
      body as Parameters<typeof internal.ingest.recordCheckpoint.recordCheckpoint>[0]
    );

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }),
});

export default http;
