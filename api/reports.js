/ Vercel serverless function — Finance Baron FX Reports
// Proxies Notion API to avoid CORS issues client-side.
 
const { Client } = require('@notionhq/client');
 
const NOTION_TOKEN       = process.env.NOTION_TOKEN;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID || '36b89e70ddad80638ba6d8bd56ce1426';
 
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
        property: 'Statut',
        select: { equals: '✅ Finalisé' },
      },
      sorts: [
        { property: 'Date', direction: 'descending' },
      ],
      page_size: 100,
    });
 
    const reports = response.results.map(page => {
      const props = page.properties;
 
      // PDF : cherche dans "Fichiers et médias" puis "Fichiers perso"
      const mediaFiles  = props['Fichiers et médias']?.files || [];
      const persoFiles  = props['Fichiers perso']?.files || [];
      const allFiles    = [...mediaFiles, ...persoFiles];
      const pdfUrl      = allFiles[0]?.file?.url || allFiles[0]?.external?.url || '';
 
      // Type : "📅 Daily" → "Daily", "📆 Weekly" → "Weekly"
      const rawType = props.Type?.select?.name || '';
      const type    = rawType.replace(/^[^\s]+\s/, ''); // retire l'emoji
 
      return {
        id:        page.id,
        notionUrl: page.url,
        title:     plain(props.Nom?.title),
        date:      props.Date?.date?.start || '',
        type,
        semaine:   props.Semaine?.rich_text ? plain(props.Semaine.rich_text) : '',
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
