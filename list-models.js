const dotenv = require("dotenv");
dotenv.config({ path: ".env.local" });

const API_KEY = process.env.GEMINI_API_KEY;

async function listModels() {
    if (!API_KEY) {
        console.error("GEMINI_API_KEY is not defined in .env.local");
        return;
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;

    try {
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error("API Error:", data.error);
            return;
        }

        console.log("Available models:");
        data.models.forEach((m) => {
            console.log(`- ${m.name} (DisplayName: ${m.displayName})`);
        });
    } catch (error) {
        console.error("Fetch Error:", error);
    }
}

listModels();
