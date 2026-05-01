import { httpRouter } from 'convex/server';
import { httpAction } from './_generated/server';
import { internal } from './_generated/api';

/**
 * HTTP entry points.
 *
 * The ingest-bridge is the only client of /ingest/checkpoint. Authentication
 * is via a shared secret rotated quarterly; the bridge is the only service
 * that holds it.
 *
 * Schema validation happens inside the recordCheckpoint mutation — Convex
 * argument validators reject malformed payloads before any work runs.
 */

const http = httpRouter();

http.route({
  path: '/ingest/checkpoint',
  method: 'POST',
  handler: httpAction(async (ctx, req) => {
    const auth = req.headers.get('x-ingest-secret');
    if (auth !== process.env.INGEST_SHARED_SECRET) {
      return new Response('unauthorized', { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response('invalid json', { status: 400 });
    }

    // The mutation validators enforce shape. Cast is intentional and bounded.
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
