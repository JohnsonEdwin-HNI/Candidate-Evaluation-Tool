const express = require('express');
const multer = require('multer');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, BorderStyle, WidthType
} = require('docx');

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() === '.pdf') {
      cb(null, true);
    } else {
      cb(new Error(`"${file.originalname}" is not a PDF. Please convert to PDF and try again.`));
    }
  }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── HEALTH CHECK ─────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'ok' }));

// ── MAIN EVALUATION ENDPOINT ─────────────────────────────
app.post('/api/evaluate', upload.fields([
  { name: 'resume', maxCount: 1 },
  { name: 'jobDescription', maxCount: 1 }
]), async (req, res) => {

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY environment variable is not set.' });
    }

    const { candidateName, positionTitle, qComm, qTech, qExp, qLogistics, qConcerns } = req.body;
    const resumeFile = req.files['resume']?.[0];
    const jdFile = req.files['jobDescription']?.[0];

    if (!resumeFile || !jdFile) {
      return res.status(400).json({ error: 'Both resume and job description files are required.' });
    }

    const name = (candidateName || 'Candidate').trim();
    const role = (positionTitle || 'this position').trim();

    // Determine media types
    const getMediaType = (file) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.pdf') return 'application/pdf';
    throw new Error(`"${file.originalname}" is not a PDF. Please convert your file to PDF and upload again.`);
    };

    const resumeB64 = resumeFile.buffer.toString('base64');
    const jdB64 = jdFile.buffer.toString('base64');
    const resumeMediaType = getMediaType(resumeFile);
    const jdMediaType = getMediaType(jdFile);

    const SYSTEM = `You are a recruiting professional producing structured candidate evaluations.
Tone and style rules — follow strictly:
- Maintain a neutral, objective tone throughout
- Never reference the resume or job description as documents (no "the resume shows", "according to the job description", etc.)
- Speak in absolute terms about the candidate
- Do not editorialize or insert subjective judgments about the candidate as a person
- Keep writing concise — avoid unnecessary detail
- Write in third person`;

    const prompt = `Using the attached resume and job description, produce a structured candidate evaluation for ${name} applying for ${role}.

Output exactly three sections separated by the marker ==SECTION_BREAK== on its own line. Within each section, separate paragraphs with a blank line. Output only the paragraphs and section break markers — no section titles, no labels, no numbering, no other text.

SECTION 1 (four paragraphs in this order):

Paragraph 1 — Work History Overview: Concise narrative of the candidate's job titles, approximate years of experience, and general scope of responsibilities. High-level executive summary — broader strokes preferred over granular detail. Three to five sentences.

Paragraph 2 — Skills and Experience Match: Concise narrative of skills and experience from the candidate's background that align strongly to the requirements of the role. Draw only from what is stated or clearly implied in the candidate's background.

Paragraph 3 — Technical Skills Anecdote: Rewrite the following recruiter note into a neutral, objective, third-person narrative paragraph. Preserve all factual substance.
Recruiter note: "${(qTech || 'The interviewer did not provide a technical anecdote.').trim()}"

Paragraph 4 — Relevant Experience Anecdote: Rewrite the following recruiter note into a neutral, objective, third-person narrative paragraph. Preserve all factual substance.
Recruiter note: "${(qExp || 'The interviewer did not provide a relevant experience anecdote.').trim()}"

==SECTION_BREAK==

SECTION 2 (three paragraphs in this order):

Paragraph 1 — Communication Style: Rewrite the following recruiter note into a neutral, objective, third-person narrative paragraph describing the candidate's communication style.
Recruiter note: "${(qComm || 'The interviewer did not provide notes on communication style.').trim()}"

Paragraph 2 — Gaps and Missing Qualifications: Concise narrative of missing or unknown skills, qualifications, or experience that the role identifies as required or preferred but that are absent or unclear from the candidate's background.

Paragraph 3 — Overall Concerns: Rewrite the following recruiter note into a neutral, objective, third-person narrative paragraph. If no concerns were noted, write one sentence reflecting that.
Recruiter note: "${(qConcerns || 'The interviewer did not note specific concerns.').trim()}"

==SECTION_BREAK==

SECTION 3 (two paragraphs in this order):

Paragraph 1 — Qualifications Summary: Concise closing paragraph summarizing how well the candidate's skills and experience match the role. Qualifications only — no location, compensation, commute, or logistical factors. Objective and brief.

Paragraph 2 — Logistics: Rewrite the following recruiter note into a neutral, objective, third-person narrative paragraph covering salary expectations, onsite availability, and sponsorship. Preserve all factual substance.
Recruiter note: "${(qLogistics || 'The interviewer did not provide logistics information.').trim()}"`;

    const response = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1600,
        system: SYSTEM,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: resumeMediaType, data: resumeB64 }, title: 'Resume' },
            { type: 'document', source: { type: 'base64', media_type: jdMediaType, data: jdB64 }, title: 'Job Description' },
            { type: 'text', text: prompt }
          ]
        }]
      },
      {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        timeout: 60000
      }
    );

    const raw = response.data.content.map(b => b.type === 'text' ? b.text : '').join('');
    const sections = raw.split(/==SECTION_BREAK==/).map(s =>
      s.trim().split(/\n\n+/).map(p => p.trim()).filter(Boolean)
    );

    res.json({ success: true, candidateName: name, positionTitle: role, sections });

  } catch (err) {
    console.error('Evaluation error:', err.response?.data || err.message);
    const msg = err.response?.data?.error?.message || err.message || 'Unknown error';
    res.status(500).json({ error: msg });
  }
});

// ── DOCX GENERATION ENDPOINT ─────────────────────────────
app.post('/api/generate-docx', express.json(), async (req, res) => {
  try {
    const { candidateName, positionTitle, sections } = req.body;
    if (!sections || !Array.isArray(sections)) {
      return res.status(400).json({ error: 'Invalid sections data.' });
    }

    const name = candidateName || 'Candidate';
    const role = positionTitle || 'Position';
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const sectionTitles = ['Section 1', 'Section 2', 'Section 3'];
    const children = [];

    // Header: candidate name
    children.push(new Paragraph({
      children: [new TextRun({ text: name, bold: true, size: 36, font: 'Arial' })],
      spacing: { after: 80 }
    }));

    // Role title
    children.push(new Paragraph({
      children: [new TextRun({ text: role, size: 24, color: '4A4A6A', font: 'Arial' })],
      spacing: { after: 80 }
    }));

    // Date
    children.push(new Paragraph({
      children: [new TextRun({ text: dateStr, size: 20, color: '888888', font: 'Arial' })],
      spacing: { after: 320 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '1A1A2E', space: 8 } }
    }));

    // Sections
    sections.forEach((paras, sIdx) => {
      // Section heading
      children.push(new Paragraph({
        children: [new TextRun({
          text: sectionTitles[sIdx] || `Section ${sIdx + 1}`,
          bold: true, size: 22, color: 'C8440A', font: 'Arial',
          allCaps: true
        })],
        spacing: { before: 320, after: 120 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: 'E2DDD6', space: 4 } }
      }));

      // Paragraphs
      paras.forEach(p => {
        children.push(new Paragraph({
          children: [new TextRun({ text: p, size: 22, font: 'Arial' })],
          spacing: { before: 160, after: 160 },
          alignment: AlignmentType.LEFT
        }));
      });
    });

    const doc = new Document({
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
          }
        },
        children
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    const filename = `${name.replace(/\s+/g, '_')}_Evaluation.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);

  } catch (err) {
    console.error('Docx error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Candidate Evaluation Tool running on port ${PORT}`));
