import { createFileRoute } from '@tanstack/react-router'

// TEMPORARY: internal data export helper used during the Supabase migration.
// Guarded by a token; delete after migration.
export const Route = createFileRoute('/api/public/tmpexport')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        if (url.searchParams.get('token') !== process.env['APP_USER_CONNECTION_KEY_SECRET']) {
          return new Response('no', { status: 401 })
        }
        const table = url.searchParams.get('table')
        const offset = Number(url.searchParams.get('offset') ?? '0')
        const limit = Number(url.searchParams.get('limit') ?? '500')
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')
        if (!table) return new Response('missing table', { status: 400 })
        const { data, error, count } = await supabaseAdmin
          .from(table as never)
          .select('*', { count: 'exact' })
          .range(offset, offset + limit - 1)
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 })
        return new Response(JSON.stringify({ count, rows: data }), {
          headers: { 'content-type': 'application/json' },
        })
      },
    },
  },
})
