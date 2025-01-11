const { OpenAI } = require('openai');
const { createClient } = require('@supabase/supabase-js');
const { Document } = require('langchain/document');
const { OpenAIEmbeddings } = require('@langchain/openai');
const { SupabaseVectorStore } = require('@langchain/community/vectorstores/supabase');
const config = bl('config');
const fs = require('node:fs');

class OpenAIService {
    constructor() {
        this.openai = new OpenAI({ apiKey: config.openaiApiKey });
        this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
        this.embeddings = new OpenAIEmbeddings({
            openAIApiKey: config.openaiApiKey,
            modelName: 'text-embedding-ada-002',
            batchSize: 512,
            stripNewLines: true
        });
        this.instructions = "Ты AI бот. Ты помогаешь узнавать пользователям детали работы в Латокен и процессе интервью. Будь вежлив и услужлив. Отвечай всегда на языке собеседника";
        this.initializeAssistant();
    }

    async initializeAssistant() {
        const list = await this.openai.beta.assistants.list();
        if (list.data.length) {
            this.assistantId = list.data[0].id;
        } else {
            const assistant = await this.openai.beta.assistants.create({
                name: "Telegram Helper",
                instructions: this.instructions,
                model: "gpt-40",
                tools: [{ type: "retrieval" }]
            });
            this.assistantId = assistant.id;
        }
    }

    async initVectorStore() {
        try {
            return await SupabaseVectorStore.fromExistingIndex(
                this.embeddings,
                {
                    client: this.supabase,
                    tableName: 'documents',
                    queryName: 'match_documents'
                }
            );
        } catch (error) {
            console.error('Error initializing vector store:', error);
            throw error;
        }
    }

    async addDocuments(documents) {
        try {
            console.log('Raw documents received:', JSON.stringify(documents, null, 2));

            // Validate documents structure
            if (!Array.isArray(documents)) {
                throw new Error('Documents must be an array');
            }

            // Check each document's structure and content
            documents.forEach((doc, index) => {
                if (!doc.content) {
                    console.error(`Document at index ${index} has no content:`, doc);
                    throw new Error(`Document at index ${index} is missing content`);
                }
            });

            const docs = documents.map(doc => {
                const pageContent = String(doc.content).trim();
                console.log('Processing document with content:', pageContent);

                return new Document({
                    pageContent,
                    metadata: {
                        source: doc.source || 'unknown',
                        created_at: new Date().toISOString()
                    }
                });
            });

            console.log('Processed Document objects:', docs);

            const vectorStore = await this.initVectorStore();
            await vectorStore.addDocuments(docs);

            console.log('Documents successfully added to vector store');
        } catch (error) {
            console.error('Error in addDocuments:', error);
            throw new Error(`Failed to add documents: ${error.message}`);
        }
    }

    async retrieveContext(query, k = 3) {
        try {
            console.log('Retrieving context for query:', query);

            const vectorStore = await this.initVectorStore();
            console.log('Vector store initialized');

            const results = await vectorStore.similaritySearch(query, k);
            console.log('Search results:', results);

            if (!results || results.length === 0) {
                console.log('No matching documents found');
                return '';
            }

            const context = results.map(doc => doc.pageContent).join('\n\n');
            console.log('Final context:', context);

            return context;
        } catch (error) {
            console.error('Error retrieving context:', error);
            return ''; // Return empty context in case of error
        }
    }

    async createThread(initialMessage = null) {
        let messages = [];
        if (initialMessage) {
            const context = await this.retrieveContext(initialMessage);
            if (context) {
                messages.push({
                    role: "user",
                    content: `Context: ${context}\n\nQuery: ${initialMessage}`
                });
            } else {
                messages.push({
                    role: "user",
                    content: initialMessage
                });
            }
        }
        return await this.openai.beta.threads.create({ messages });
    }

    async sendMessage(threadId, message) {
        const context = await this.retrieveContext(message);
        const messageContent = context
            ? `Context: ${context}\n\nQuery: ${message}`
            : message;

        console.log('messageContent', messageContent);

        await this.openai.beta.threads.messages.create(
            threadId,
            { role: "user", content: messageContent }
        );

        const run = await this.openai.beta.threads.runs.create(
            threadId,
            { assistant_id: this.assistantId }
        );

        return await this.waitForResponse(threadId, run.id);
    }

    async waitForResponse(threadId, runId) {
        while (true) {
            const run = await this.openai.beta.threads.runs.retrieve(threadId, runId);

            if (run.status === 'completed') {
                const messages = await this.openai.beta.threads.messages.list(threadId);
                return messages.data[0].content[0].text.value;
            }

            if (run.status === 'failed') {
                throw new Error('Assistant failed to respond');
            }

            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    async audioToText(path) {
        const transcription = await this.openai.audio.transcriptions.create({
            file: fs.createReadStream(path),
            model: "whisper-1",
        });
        return transcription.text;
    }

    async query(message) {
        const thread = await this.createThread(message);
        return await this.sendMessage(thread.id, message);
    }
}

module.exports = new OpenAIService();