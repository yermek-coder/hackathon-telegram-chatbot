require("dotenv").config();
require("./magic");

const fs = require("fs");
const chatgpt = bl("chatgpt");

function chunkText(text, maxLength = 4000) {
    // Split on paragraphs first
    const paragraphs = text.split(/\n\n+/);
    const chunks = [];
    let currentChunk = '';

    for (const paragraph of paragraphs) {
        // If adding this paragraph would exceed maxLength, save current chunk and start new one
        if ((currentChunk + paragraph).length > maxLength && currentChunk) {
            chunks.push(currentChunk.trim());
            currentChunk = '';
        }

        // If a single paragraph is too long, split it into sentences
        if (paragraph.length > maxLength) {
            const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph];
            for (const sentence of sentences) {
                if (currentChunk.length + sentence.length > maxLength) {
                    if (currentChunk) chunks.push(currentChunk.trim());
                    currentChunk = sentence;
                } else {
                    currentChunk += ' ' + sentence;
                }
            }
        } else {
            currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        }
    }

    if (currentChunk) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
}

async function addDocumentsFromFiles(directory) {
    const files = fs.readdirSync(directory)
        .filter(file => file.endsWith('.txt') || file.endsWith('.md'));

    if (files.length === 0) {
        console.warn("No suitable files found in directory");
        return;
    }

    let allDocuments = [];

    for (const file of files) {
        const filePath = `${directory}/${file}`;
        console.log('Processing file:', file);

        const content = fs.readFileSync(filePath, 'utf-8');
        const chunks = chunkText(content);

        console.log(`File ${file} split into ${chunks.length} chunks`);

        const documents = chunks.map((chunk, index) => ({
            content: chunk,
            source: `${file}#chunk${index + 1}`
        }));

        allDocuments.push(...documents);
    }

    console.log(`Processing total of ${allDocuments.length} document chunks`);

    // Process chunks in batches to avoid rate limits
    const batchSize = 5;
    for (let i = 0; i < allDocuments.length; i += batchSize) {
        const batch = allDocuments.slice(i, i + batchSize);
        try {
            await chatgpt.addDocuments(batch);
            console.log(`Successfully added batch ${i / batchSize + 1} of ${Math.ceil(allDocuments.length / batchSize)}`);
            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            console.error(`Error adding batch ${i / batchSize + 1}:`, error);
            throw error;
        }
    }
}

addDocumentsFromFiles("documents")
    .then(() => {
        console.log("Migration completed successfully");
        process.exit(0);
    })
    .catch((error) => {
        console.error("Migration failed:", error);
        process.exit(1);
    });