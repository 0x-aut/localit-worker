import Groq from 'groq-sdk';
import { AIAnalysisResult } from './types';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function analyzeDiffWithAI(
  baselineBuffer: Buffer,
  currentBuffer: Buffer,
  diffBuffer: Buffer,
  locale: string
): Promise<AIAnalysisResult | null> {
  const toBase64 = (buf: Buffer) => buf.toString('base64');

  console.log('Trying to use AI to analyze diff for conclusive result')
  try {
    const response = await groq.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 512,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are a visual QA tool for i18n regression testing. You will be given three screenshots of a web app:
1. Baseline (English reference)
2. Current build for locale: "${locale}"
3. Pixel diff image (red = changed pixels)

Analyze what visually changed between baseline and current. Focus on:
- Untranslated strings (raw i18n keys like "home.title" still showing)
- Text still in English when it should be in ${locale}
- Layout shifts or overflow caused by longer/shorter translated text
- Missing UI elements

Respond ONLY with valid JSON in exactly this format, no markdown, no backticks, no extra text:
{"message": ["reason1", "reason2"]}

If nothing meaningful changed, respond with:
{"message": ["No significant visual differences detected."]}`,
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${toBase64(baselineBuffer)}` },
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${toBase64(currentBuffer)}` },
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${toBase64(diffBuffer)}` },
            },
          ],
        },
      ],
    });

    console.log('Done analyzing with AI')
    
    const raw = response.choices[0].message.content ?? '';

    // Strip markdown fences if the model ignores the instruction
    const cleaned = raw.replace(/```json|```/g, '').trim();

    const parsed = JSON.parse(cleaned) as AIAnalysisResult;

    // Validate shape before returning
    if (!Array.isArray(parsed.message)) {
      throw new Error('Unexpected response shape from AI');
    }

    return parsed;
  } catch (err) {
    console.warn(`AI analysis failed for ${locale}: ${(err as Error).message}`);
    return null;
  }
}