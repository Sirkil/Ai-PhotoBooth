const express = require('express');
const { GoogleGenAI } = require('@google/genai');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '10mb' })); 
app.use(cors()); 
app.use(express.static(__dirname));

const ai = new GoogleGenAI({});

app.post('/process-image', async (req, res) => {
    try {
        const { image_url } = req.body;
        
        // Hardcoded custom AI prompt
        const selectedPrompt = `Transform the person in the image into a futuristic AI photobooth portrait. Keep the original face identity unchanged, centered and looking directly at the camera. Make the person wear a clean white pharmacist lab coat over a subtle green shirt. Add a soft neon green glow around the body and face, with floating digital particles and light dots surrounding the head. Use cinematic lighting with a dark background, soft spotlight from above, and green rim light accents. Style the image as ultra-realistic, high detail, sharp focus, studio quality. Add a subtle futuristic interface feel (like a scanning system), with soft green UI elements or light effects, but keep it minimal and clean. Ensure the skin tones look natural, with enhanced clarity and slight beauty retouching. The final image should feel like a high-end AI booth portrait, modern, elegant, and slightly futuristic. --ar 2:3 --style cinematic --ultra realistic --high detail`;

        const base64Data = image_url.replace(/^data:image\/\w+;base64,/, "");

        const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-image-preview",
            contents: [
                { text: selectedPrompt },
                { inlineData: { mimeType: "image/jpeg", data: base64Data } }
            ]
        });

        const generatedParts = response.candidates?.[0]?.content?.parts || [];
        const imagePart = generatedParts.find(part => part.inlineData);

        if (imagePart && imagePart.inlineData) {
             const finalImageUrl = `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
             res.json({ images: [{ url: finalImageUrl }] });
        } else {
             throw new Error("No image data returned.");
        }
    } catch (error) {
        console.error("Generation Error:", error);
        res.status(500).send("AI Processing Failed");
    }
});

app.post('/upload-to-drive', async (req, res) => {
    try {
        const { image_url, userName } = req.body;
        const base64Data = image_url.replace(/^data:image\/\w+;base64,/, "");
        const scriptUrl = process.env.APPS_SCRIPT_URL;

        const response = await fetch(scriptUrl, {
            method: 'POST',
            body: JSON.stringify({ image: base64Data, name: userName }),
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.status === 'success') {
            res.json({ link: data.link });
        } else {
            throw new Error(data.message);
        }

    } catch (error) {
        console.error("Upload Error:", error);
        res.status(500).send("Upload Failed");
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));