require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 8080;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. See .env.example.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
});

app.use(cors());
app.use(express.json({ limit: '20mb' })); // generous limit to allow base64 image/doc uploads
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

/* ---------------------------------------------------------------------- */
/* 1. Cherry Internal Resources                                          */
/* ---------------------------------------------------------------------- */

app.get('/api/resources/internal', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, title, link, description FROM internal_resources ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) { next(err); }
});

app.post('/api/resources/internal', async (req, res, next) => {
  try {
    const { title, link, description } = req.body;
    if (!title || !link) return res.status(400).json({ error: 'title and link are required' });
    const { rows } = await pool.query(
      `INSERT INTO internal_resources (title, link, description)
       VALUES ($1, $2, $3) RETURNING id, title, link, description`,
      [title, link, description || '']
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

app.put('/api/resources/internal/:id', async (req, res, next) => {
  try {
    const { title, link, description } = req.body;
    const { rows } = await pool.query(
      `UPDATE internal_resources
       SET title = $1, link = $2, description = $3, updated_at = now()
       WHERE id = $4
       RETURNING id, title, link, description`,
      [title, link, description || '', req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

app.delete('/api/resources/internal/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM internal_resources WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

/* ---------------------------------------------------------------------- */
/* 2 & 3. Knowledge cards (Audiology Industry Knowledge / Product)       */
/* ---------------------------------------------------------------------- */

function toISODate(val) {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().slice(0, 10);
  return String(val).slice(0, 10);
}

function knowledgeRow(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    media: row.media || [],
    dateCreated: toISODate(row.date_created),
    dateValidated: toISODate(row.date_validated)
  };
}

function knowledgeSection(req, res, next) {
  const section = req.params.section;
  if (section !== 'industry' && section !== 'product') {
    return res.status(404).json({ error: 'unknown section' });
  }
  req.knowledgeSection = section;
  next();
}

app.get('/api/resources/:section(industry|product)', knowledgeSection, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM knowledge_cards WHERE section = $1 ORDER BY created_at DESC',
      [req.knowledgeSection]
    );
    res.json(rows.map(knowledgeRow));
  } catch (err) { next(err); }
});

app.post('/api/resources/:section(industry|product)', knowledgeSection, async (req, res, next) => {
  try {
    const { title, description, media } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const { rows } = await pool.query(
      `INSERT INTO knowledge_cards (section, title, description, media)
       VALUES ($1, $2, $3, $4::jsonb) RETURNING *`,
      [req.knowledgeSection, title, description || '', JSON.stringify(media || [])]
    );
    res.status(201).json(knowledgeRow(rows[0]));
  } catch (err) { next(err); }
});

app.put('/api/resources/:section(industry|product)/:id', knowledgeSection, async (req, res, next) => {
  try {
    const { title, description, media } = req.body;
    const { rows } = await pool.query(
      `UPDATE knowledge_cards
       SET title = $1, description = $2, media = $3::jsonb, updated_at = now()
       WHERE id = $4 AND section = $5
       RETURNING *`,
      [title, description || '', JSON.stringify(media || []), req.params.id, req.knowledgeSection]
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(knowledgeRow(rows[0]));
  } catch (err) { next(err); }
});

app.post('/api/resources/:section(industry|product)/:id/validate', knowledgeSection, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE knowledge_cards
       SET date_validated = CURRENT_DATE, updated_at = now()
       WHERE id = $1 AND section = $2
       RETURNING *`,
      [req.params.id, req.knowledgeSection]
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(knowledgeRow(rows[0]));
  } catch (err) { next(err); }
});

app.delete('/api/resources/:section(industry|product)/:id', knowledgeSection, async (req, res, next) => {
  try {
    await pool.query('DELETE FROM knowledge_cards WHERE id = $1 AND section = $2', [req.params.id, req.knowledgeSection]);
    res.status(204).end();
  } catch (err) { next(err); }
});

/* ---------------------------------------------------------------------- */
/* 4. Talk Track Examples                                                */
/* ---------------------------------------------------------------------- */

function talktrackRow(row) {
  return { id: row.id, title: row.title, description: row.description, gongLink: row.gong_link };
}

app.get('/api/resources/talktrack', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM talk_tracks ORDER BY created_at DESC');
    res.json(rows.map(talktrackRow));
  } catch (err) { next(err); }
});

app.post('/api/resources/talktrack', async (req, res, next) => {
  try {
    const { title, description, gongLink } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const { rows } = await pool.query(
      `INSERT INTO talk_tracks (title, description, gong_link) VALUES ($1, $2, $3) RETURNING *`,
      [title, description || '', gongLink || '']
    );
    res.status(201).json(talktrackRow(rows[0]));
  } catch (err) { next(err); }
});

app.put('/api/resources/talktrack/:id', async (req, res, next) => {
  try {
    const { title, description, gongLink } = req.body;
    const { rows } = await pool.query(
      `UPDATE talk_tracks SET title = $1, description = $2, gong_link = $3, updated_at = now()
       WHERE id = $4 RETURNING *`,
      [title, description || '', gongLink || '', req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(talktrackRow(rows[0]));
  } catch (err) { next(err); }
});

app.delete('/api/resources/talktrack/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM talk_tracks WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

/* ---------------------------------------------------------------------- */
/* 5. Web Provider Contacts                                               */
/* ---------------------------------------------------------------------- */

function contactRow(row) {
  return { id: row.id, company: row.company, email: row.email, secondaryEmail: row.secondary_email };
}

app.get('/api/resources/contacts', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM provider_contacts ORDER BY created_at DESC');
    res.json(rows.map(contactRow));
  } catch (err) { next(err); }
});

app.post('/api/resources/contacts', async (req, res, next) => {
  try {
    const { company, email, secondaryEmail } = req.body;
    if (!company) return res.status(400).json({ error: 'company is required' });
    const { rows } = await pool.query(
      `INSERT INTO provider_contacts (company, email, secondary_email) VALUES ($1, $2, $3) RETURNING *`,
      [company, email || '', secondaryEmail || '']
    );
    res.status(201).json(contactRow(rows[0]));
  } catch (err) { next(err); }
});

app.put('/api/resources/contacts/:id', async (req, res, next) => {
  try {
    const { company, email, secondaryEmail } = req.body;
    const { rows } = await pool.query(
      `UPDATE provider_contacts SET company = $1, email = $2, secondary_email = $3, updated_at = now()
       WHERE id = $4 RETURNING *`,
      [company, email || '', secondaryEmail || '', req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(contactRow(rows[0]));
  } catch (err) { next(err); }
});

app.delete('/api/resources/contacts/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM provider_contacts WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

/* ---------------------------------------------------------------------- */
/* 6. Example Implementations                                            */
/* ---------------------------------------------------------------------- */

function exampleRow(row) {
  return { id: row.id, title: row.title, description: row.description, media: row.media || [] };
}

app.get('/api/resources/examples', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM implementation_examples ORDER BY created_at DESC');
    res.json(rows.map(exampleRow));
  } catch (err) { next(err); }
});

app.post('/api/resources/examples', async (req, res, next) => {
  try {
    const { title, description, media } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const { rows } = await pool.query(
      `INSERT INTO implementation_examples (title, description, media) VALUES ($1, $2, $3::jsonb) RETURNING *`,
      [title, description || '', JSON.stringify(media || [])]
    );
    res.status(201).json(exampleRow(rows[0]));
  } catch (err) { next(err); }
});

app.put('/api/resources/examples/:id', async (req, res, next) => {
  try {
    const { title, description, media } = req.body;
    const { rows } = await pool.query(
      `UPDATE implementation_examples SET title = $1, description = $2, media = $3::jsonb, updated_at = now()
       WHERE id = $4 RETURNING *`,
      [title, description || '', JSON.stringify(media || []), req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(exampleRow(rows[0]));
  } catch (err) { next(err); }
});

app.delete('/api/resources/examples/:id', async (req, res, next) => {
  try {
    await pool.query('DELETE FROM implementation_examples WHERE id = $1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

/* ---------------------------------------------------------------------- */

// Fallback: serve the SPA shell for any non-API route
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'internal server error' });
});

app.listen(PORT, () => {
  console.log(`Audiology Onboarding Resources listening on port ${PORT}`);
});
