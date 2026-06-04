// Vercel serverless function — Finance Baron FX Reports
// Proxies Notion API to avoid CORS issues client-side.

const { Client } = require('@notionhq/client');

const NOTION_TOKEN       = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID || 'a64ad1ce41cd4a61acaa445f51b10d34';

function plain(richText) {
  if (!richText || !richText.length) return '';
  return richText.map(t => t.plain_text || '').join('');
}

module.exports = async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  if (!NOTION_TOKEN) {
    return res.status(500).json({ error: 'NOTION_TOKEN non configuré dans les variables Vercel.' });
  }

  try {
    const notion = new Client({ auth: NOTION_TOKEN });

    const response = await notion.databases.query({
      database_id: NOTION_DATABASE_ID,
      filter: {
        property: 'Publié',
        checkbox: { equals: true },
      },
      sorts: [
        { property: 'Date', direction: 'descending' },
      ],
      page_size: 50,
    });

    const reports = response.results.map(page => {
      const props = page.properties;
      const pdfFiles = props.PDF?.files || [];
      const pdfUrl = pdfFiles[0]?.file?.url || pdfFiles[0]?.external?.url || '';

      return {
        id:         page.id,
        notionUrl:  page.url,
        title:      plain(props.Titre?.title),
        date:       props.Date?.date?.start || '',
        type:       props.Type?.select?.name || '',
        vix:        plain(props.VIX?.rich_text),
        topDevise:  plain(props['Top devise']?.rich_text),
        resume:     plain(props.Résumé?.rich_text),
        semaineISO: plain(props['Semaine ISO']?.rich_text),
        pdfUrl,
      };
    });

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate'); // 5 min cache
    return res.status(200).json(reports);

  } catch (err) {
    console.error('Notion API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
