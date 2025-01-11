class Message {
    constructor(chatId, text) {
        this.chatId = chatId;
        this.text = text;
    }
}

class Conversation {
    constructor(threadId, chatId) {
        this.threadId = threadId;
        this.chatId = chatId;
    }
}

module.exports = { Message, Conversation }