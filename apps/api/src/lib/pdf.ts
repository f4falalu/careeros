// Resume HTML → PDF via Playwright + system Chromium.
// Called only from the /resume-versions/:id/pdf route.

import { chromium } from 'playwright'

interface ResumeBullet {
  text: string
  source_achievement_id?: string | null
}

interface ResumeContent {
  label?: string
  summary?: string
  sections?: Record<string, ResumeBullet[]>
  keywords_targeted?: string[]
  ats_score?: number
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderHtml(content: ResumeContent, label: string): string {
  const summary = content.summary ?? ''
  const sections = content.sections ?? {}
  const keywords = content.keywords_targeted ?? []

  const sectionHtml = Object.entries(sections)
    .map(([title, bullets]) => {
      const items = bullets
        .map((b) => `<li>${escapeHtml(b.text)}</li>`)
        .join('\n')
      return `
        <div class="section">
          <h2>${escapeHtml(title)}</h2>
          <ul>${items}</ul>
        </div>`
    })
    .join('\n')

  const keywordsHtml =
    keywords.length > 0
      ? `<div class="keywords"><strong>Keywords:</strong> ${keywords.map(escapeHtml).join(' · ')}</div>`
      : ''

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    font-size: 11px;
    line-height: 1.45;
    color: #1a1a1a;
    padding: 28px 36px;
    max-width: 760px;
    margin: 0 auto;
  }
  h1 { font-size: 18px; font-weight: 700; letter-spacing: -0.3px; margin-bottom: 4px; }
  .label { font-size: 9px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 12px; }
  .summary { font-size: 11px; color: #333; margin-bottom: 16px; padding-bottom: 12px; border-bottom: 1px solid #e0e0e0; }
  h2 {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: #111;
    margin-bottom: 6px;
    padding-bottom: 3px;
    border-bottom: 1px solid #ddd;
  }
  .section { margin-bottom: 14px; }
  ul { padding-left: 16px; }
  li { margin-bottom: 3px; color: #222; }
  .keywords { font-size: 9px; color: #555; margin-top: 16px; padding-top: 10px; border-top: 1px solid #e8e8e8; }
  @page { margin: 0; size: A4; }
</style>
</head>
<body>
  <h1>${escapeHtml(label)}</h1>
  <div class="label">Tailored resume</div>
  ${summary ? `<div class="summary">${escapeHtml(summary)}</div>` : ''}
  ${sectionHtml}
  ${keywordsHtml}
</body>
</html>`
}

export async function renderResumePdf(
  content: ResumeContent,
  label: string,
): Promise<Buffer> {
  // Use system Chromium if PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH is set,
  // otherwise fall back to the Playwright-managed binary.
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? undefined

  const browser = await chromium.launch({
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  })

  try {
    const page = await browser.newPage()
    await page.setContent(renderHtml(content, label), { waitUntil: 'domcontentloaded' })
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0', right: '0', bottom: '0', left: '0' },
    })
    return Buffer.from(pdf)
  } finally {
    await browser.close()
  }
}
