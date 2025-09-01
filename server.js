import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fetch from 'node-fetch';

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = 3001;

app.use(cors());
app.use(express.json());

const REPLICATE_API_TOKEN = process.env.REPLICATE_API_TOKEN;
const API_HOST = 'https://api.replicate.com';

// A simple helper function to sleep for a given time
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Centralized error handler
const handleError = (res, message, statusCode = 500) => {
    console.error(message);
    res.status(statusCode).json({ error: message });
};

// Endpoint to generate an image
app.post('/api/generate-image', async (req, res) => {
    if (!REPLICATE_API_TOKEN) {
        return handleError(res, 'REPLICATE_API_TOKEN is not set.', 500);
    }

    const { prompt } = req.body;
    if (!prompt) {
        return handleError(res, 'Prompt is required.', 400);
    }

    try {
        const startResponse = await fetch(`${API_HOST}/v1/predictions`, {
            method: 'POST',
            headers: {
                'Authorization': `Token ${REPLICATE_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                version: '39ed52f2a78e934b3ba6e2a89f5b1c712de7dfea535525255b1aa35c5565e08b', // SDXL-Lightning
                input: { prompt: prompt },
            }),
        });

        const jsonStartResponse = await startResponse.json();
        if (startResponse.status !== 201) {
            return handleError(res, `API error: ${jsonStartResponse.detail}`, startResponse.status);
        }

        let prediction = jsonStartResponse;
        while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
            await sleep(1000);
            const pollResponse = await fetch(prediction.urls.get, {
                headers: {
                    'Authorization': `Token ${REPLICATE_API_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            });
            prediction = await pollResponse.json();
            if (pollResponse.status !== 200) {
                 return handleError(res, `Polling failed: ${prediction.detail}`, pollResponse.status);
            }
        }

        if (prediction.status === 'failed') {
            return handleError(res, `Image generation failed: ${prediction.error}`, 500);
        }

        const imageUrl = prediction.output[0];
        res.json({ imageUrl });

    } catch (error) {
        handleError(res, `An internal server error occurred: ${error.message}`);
    }
});

// Endpoint to generate a caption
app.post('/api/generate-caption', async (req, res) => {
     if (!REPLICATE_API_TOKEN) {
        return handleError(res, 'REPLICATE_API_TOKEN is not set.', 500);
    }
    const { imageUrl } = req.body;
     if (!imageUrl) {
        return handleError(res, 'imageUrl is required.', 400);
    }
     try {
        const startResponse = await fetch(`${API_HOST}/v1/predictions`, {
            method: 'POST',
            headers: {
                'Authorization': `Token ${REPLICATE_API_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                version: '2e1dddc8621f72155f24cf2e0adbde548458d3cab9f00c0139eea840d0ac4746', // Llava-13b for captioning
                input: {
                    image: imageUrl,
                    prompt: "Write a short, exciting, one-sentence caption for this image."
                },
            }),
        });

         const jsonStartResponse = await startResponse.json();
         if (startResponse.status !== 201) {
             return handleError(res, `API error: ${jsonStartResponse.detail}`, startResponse.status);
         }

        let prediction = jsonStartResponse;
        while (prediction.status !== 'succeeded' && prediction.status !== 'failed') {
            await sleep(1000);
            const pollResponse = await fetch(prediction.urls.get, {
                headers: { 'Authorization': `Token ${REPLICATE_API_TOKEN}` }
            });
            prediction = await pollResponse.json();
             if (pollResponse.status !== 200) {
                 return handleError(res, `Polling failed: ${prediction.detail}`, pollResponse.status);
            }
        }
        if (prediction.status === 'failed') {
            return handleError(res, `Caption generation failed: ${prediction.error}`, 500);
        }

        // --- FIX STARTS HERE ---
        // Handle cases where the output might be an array or a single string
        const output = prediction.output;
        const caption = Array.isArray(output) ? output.join('').trim() : String(output).trim();
        // --- FIX ENDS HERE ---

        res.json({ caption });

     } catch (error) {
         handleError(res, `An internal server error occurred: ${error.message}`);
     }
});

// Endpoint to proxy image requests to avoid canvas taint issues
app.get('/api/image-proxy', async (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) {
        return res.status(400).send('Image URL is required');
    }
    try {
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const imageBuffer = Buffer.from(arrayBuffer);
        const contentType = response.headers.get('content-type');
        res.setHeader('Content-Type', contentType);
        res.send(imageBuffer);
    } catch (error) {
        console.error('Image proxy error:', error);
        res.status(500).send('Failed to fetch image');
    }
});


app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
    // *** THIS IS THE NEW DIAGNOSTIC LINE ***
    console.log(`Server is attempting to use this API Token: ${REPLICATE_API_TOKEN}`);
});


