const TelegramBot = require('node-telegram-bot-api');
const config = bl("config");
const chatgpt = bl('chatgpt')

class TelegramService {
    constructor(chatgpt) {
        this.bot = new TelegramBot(config.telegramToken, { polling: true });
        this.chatgpt = chatgpt;
        this.conversations = new Map();
        this.setupHandlers();
    }

    setupHandlers() {
        this.bot.on('message', async (msg) => {
            try {
                let threadId = this.conversations.get(msg.chat.id);

                if (!threadId) {
                    const thread = await this.chatgpt.createThread(msg.text);
                    threadId = thread.id;
                    this.conversations.set(msg.chat.id, threadId);
                }

                // Handle the /start command
                if (text === '/start') {
                    await this.bot.sendMessage(
                        msg.chat.id,
                        'Вас приветствует чат-бот команды Латокен! Чем могу вам помочь?'
                    );
                    return;
                }

                const response = await this.chatgpt.sendMessage(threadId, msg.text);
                await this.sendMessage(msg.chat.id, response);
            } catch (error) {
                console.error('Error:', error);
                await this.bot.sendMessage(msg.chat.id, 'Извините, у нас техническая ошибка!');
            }
        });
    }

    async sendMessage(chatId, message) {
        try {
            // Split long messages if they exceed Telegram's limit
            const MAX_MESSAGE_LENGTH = 4096;
            if (message.length <= MAX_MESSAGE_LENGTH) {
                return await this.bot.sendMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                });
            }

            // Split long messages into chunks
            const chunks = message.match(new RegExp(`.{1,${MAX_MESSAGE_LENGTH}}`, 'g')) || [];
            for (const chunk of chunks) {
                await this.bot.sendMessage(chatId, chunk, {
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                });
                // Small delay between messages to maintain order
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } catch (error) {
            console.error('Error sending message:', error);
            // Fallback to plain text if Markdown parsing fails
            return await this.bot.sendMessage(chatId, message, {
                parse_mode: 'None',
                disable_web_page_preview: true
            });
        }
    }
}

module.exports = new TelegramService(chatgpt)