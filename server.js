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
        const { image_url, mode } = req.body;
        
        // Simplified prompts focused strictly on the environment and quality
        const modePrompts = {
            beach: `Put the person in the attached image relaxing on a beautiful tropical beach. Sunny, realistic, high detail, 4k.`,
            birthday: `Put the person in the attached image at a joyous birthday celebration. Surrounded by balloons, highly detailed, 4k.`,
            party: `Put the person in the attached image at a crazy neon club party. Dancing, laser lights, 4k.`,
            trip: `Turn the person in the attached image into an adventurous traveler hiking a mountain peak. Beautiful scenery, 4k.`
        };

        const selectedPrompt = modePrompts[mode] || modePrompts['beach'];
        const base64Data = image_url.replace(/^data:image\/\w+;base64,/, "");

        // Updated to the new, faster 3.1 model
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