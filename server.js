const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const sharp = require('sharp');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(cors());
app.use(express.static(__dirname));

const ai = new GoogleGenAI({});

/* ─────────────────────────────────────────────
   Helper: strip the data:image/...;base64, prefix
   and return a Buffer
───────────────────────────────────────────── */
function base64ToBuffer(dataUrl) {
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    return Buffer.from(base64, 'base64');
}

/* ─────────────────────────────────────────────
   POST /process-image
   Body: { image_url, overlay_footer, overlay_batch }
   - image_url      : base64 webcam capture
   - overlay_footer : base64 of Footer_Ai.png
   - overlay_batch  : base64 of Batch.png
───────────────────────────────────────────── */
app.post('/process-image', async (req, res) => {
    try {
        const { image_url, overlay_footer, overlay_batch } = req.body;

        // ── 1. Generate AI image via Gemini ──────────────────────────────
        const selectedPrompt = `Transform the person in the image into a futuristic AI photobooth portrait. 
Keep the original face identity unchanged, centered and looking directly at the camera.

Make the person wear a clean, plain white pharmacist lab coat over a subtle green shirt. The white lab coat must be completely blank with NO patches, NO logos, NO text, and NO embroidery anywhere on the fabric. Leave the chest area completely empty.

Add a soft neon green glow around the body and face, with floating digital particles and light dots surrounding the head.

Use cinematic lighting with a dark background, soft spotlight from above, and green rim light accents. 
Style the image as ultra-realistic, high detail, sharp focus, studio quality.

Add a subtle futuristic interface feel (like a scanning system), with soft green UI elements or light effects, but keep it minimal and clean.

Ensure the skin tones look natural, with enhanced clarity and slight beauty retouching. 
The final image should feel like a high-end AI booth portrait, modern, elegant, and slightly futuristic.

--ar 2:3 --style cinematic --ultra realistic --high detail`;

        const base64Data = image_url.replace(/^data:image\/\w+;base64,/, '');

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-image-preview',
            contents: [
                { text: selectedPrompt },
                { inlineData: { mimeType: 'image/jpeg', data: base64Data } }
            ]
        });

        const generatedParts = response.candidates?.[0]?.content?.parts || [];
        const imagePart = generatedParts.find(part => part.inlineData);

        if (!imagePart?.inlineData) {
            throw new Error('No image data returned from Gemini.');
        }

        // ── 2. AI image → Sharp pipeline ─────────────────────────────────
        const aiBuffer = Buffer.from(imagePart.inlineData.data, 'base64');

        // Normalise AI image to exactly 1080×1920
        const AI_W = 1080;
        const AI_H = 1920;

        let composite = sharp(aiBuffer).resize(AI_W, AI_H, { fit: 'cover' });

        // ── 3. Build overlay list ─────────────────────────────────────────
        const overlays = [];

        // Footer_Ai.png  — full width, pinned to bottom
        if (overlay_footer) {
            const footerBuf = base64ToBuffer(overlay_footer);
            // Resize footer to full 1080px wide, keep its natural aspect ratio
            const footerMeta = await sharp(footerBuf).metadata();
            const footerH    = Math.round((footerMeta.height / footerMeta.width) * AI_W);

            const footerResized = await sharp(footerBuf)
                .resize(AI_W, footerH, { fit: 'fill' })
                .png()
                .toBuffer();

            overlays.push({
                input:  footerResized,
                left:   0,
                top:    AI_H - footerH   // pin to bottom
            });
        }

        // Batch.png  — badge placed on the chest
        if (overlay_batch) {
            const batchBuf  = base64ToBuffer(overlay_batch);
            const batchMeta = await sharp(batchBuf).metadata();

            const BADGE_W = Math.round(AI_W * 0.22);          // Width of the badge
            const BADGE_H = Math.round((batchMeta.height / batchMeta.width) * BADGE_W);
            
            // Move it to the viewer's right side (person's left chest)
            const chestLeft = Math.round(AI_W * 0.68); // 68% across the image
            const chestTop  = Math.round(AI_H * 0.62); // 62% down the image

            const batchResized = await sharp(batchBuf)
                .resize(BADGE_W, BADGE_H, { fit: 'fill' })
                .png()
                .toBuffer();

            overlays.push({
                input: batchResized,
                left:  chestLeft,
                top:   chestTop
            });
        }

        // ── 4. Composite and return ───────────────────────────────────────
        const finalBuffer = await composite
            .composite(overlays)
            .jpeg({ quality: 95 })
            .toBuffer();

        const finalImageUrl = `data:image/jpeg;base64,${finalBuffer.toString('base64')}`;
        res.json({ images: [{ url: finalImageUrl }] });

    } catch (error) {
        console.error('Generation Error:', error);
        res.status(500).send('AI Processing Failed');
    }
});

/* ─────────────────────────────────────────────
   POST /upload-to-drive
───────────────────────────────────────────── */
app.post('/upload-to-drive', async (req, res) => {
    try {
        const { image_url, userName } = req.body;
        const base64Data = image_url.replace(/^data:image\/\w+;base64,/, '');
        const scriptUrl  = process.env.APPS_SCRIPT_URL;

        const response = await fetch(scriptUrl, {
            method:  'POST',
            body:    JSON.stringify({ image: base64Data, name: userName }),
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.status === 'success') {
            res.json({ link: data.link });
        } else {
            throw new Error(data.message);
        }
    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).send('Upload Failed');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));