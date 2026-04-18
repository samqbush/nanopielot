import { App, LogLevel } from '@slack/bolt';

import { ASSISTANT_NAME, TRIGGER_PATTERN } from '../config.js';
import { readEnvFile } from '../env.js';
import { logger } from '../logger.js';
import { registerChannel, ChannelOpts } from './registry.js';
import { Channel, NewMessage } from '../types.js';

const MAX_MESSAGE_LENGTH = 4000;

export class SlackChannel implements Channel {
  name = 'slack';

  private app: App | null = null;
  private opts: ChannelOpts;
  private botToken: string;
  private appToken: string;
  private botUserId: string | undefined;

  constructor(botToken: string, appToken: string, opts: ChannelOpts) {
    this.botToken = botToken;
    this.appToken = appToken;
    this.opts = opts;
  }

  async connect(): Promise<void> {
    this.app = new App({
      token: this.botToken,
      appToken: this.appToken,
      socketMode: true,
      logLevel: LogLevel.WARN,
    });

    // Identify the bot's own user ID so we can ignore our own messages
    try {
      const authResult = await this.app.client.auth.test({ token: this.botToken });
      this.botUserId = authResult.user_id as string;
      logger.info({ botUserId: this.botUserId }, 'Slack bot identified');
    } catch (err) {
      logger.error({ err }, 'Failed to identify Slack bot user');
    }

    // Handle all messages
    this.app.message(async ({ message, say }) => {
      // Only handle regular user messages (not bot messages, not subtypes like edits/deletes)
      if (message.subtype) return;
      if (!('text' in message) || !message.text) return;
      if (!('user' in message)) return;

      // Skip our own messages
      if (message.user === this.botUserId) return;

      const chatJid = `slack:${message.channel}`;
      let content = message.text;
      const timestamp = message.ts
        ? new Date(parseFloat(message.ts) * 1000).toISOString()
        : new Date().toISOString();
      const msgId = message.ts || Date.now().toString();
      const threadId = ('thread_ts' in message) ? message.thread_ts : undefined;

      // Resolve sender name
      let senderName = message.user;
      try {
        const userInfo = await this.app!.client.users.info({
          token: this.botToken,
          user: message.user,
        });
        senderName =
          userInfo.user?.real_name ||
          userInfo.user?.profile?.display_name ||
          userInfo.user?.name ||
          message.user;
      } catch {
        // Fall back to user ID
      }

      // Translate <@BOT_ID> mentions to trigger format
      if (this.botUserId && content.includes(`<@${this.botUserId}>`)) {
        content = content.replace(new RegExp(`<@${this.botUserId}>`, 'g'), '').trim();
        if (!TRIGGER_PATTERN.test(content)) {
          content = `@${ASSISTANT_NAME} ${content}`;
        }
      }

      // Resolve channel name for metadata
      let chatName = chatJid;
      try {
        const convInfo = await this.app!.client.conversations.info({
          token: this.botToken,
          channel: message.channel,
        });
        chatName = convInfo.channel?.name || chatJid;
      } catch {
        // Fall back to JID
      }

      const isGroup = true; // Slack channels are group-like by default

      this.opts.onChatMetadata(chatJid, timestamp, chatName, 'slack', isGroup);

      // Only deliver messages for registered groups
      const group = this.opts.registeredGroups()[chatJid];
      if (!group) {
        logger.debug({ chatJid, chatName }, 'Message from unregistered Slack channel');
        return;
      }

      const newMessage: NewMessage = {
        id: msgId,
        chat_jid: chatJid,
        sender: message.user,
        sender_name: senderName,
        content,
        timestamp,
        is_from_me: false,
        thread_id: threadId,
      };

      this.opts.onMessage(chatJid, newMessage);
      logger.info({ chatJid, chatName, sender: senderName }, 'Slack message stored');
    });

    await this.app.start();
    logger.info('Slack bot connected via Socket Mode');
    console.log(`\n  Slack bot connected (Socket Mode)`);
    console.log(`  Add the bot to a channel, then register with JID: slack:<channel-id>\n`);
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    if (!this.app) {
      logger.warn('Slack app not initialized');
      return;
    }

    try {
      const channel = jid.replace(/^slack:/, '');

      if (text.length <= MAX_MESSAGE_LENGTH) {
        await this.app.client.chat.postMessage({
          token: this.botToken,
          channel,
          text,
        });
      } else {
        // Split long messages
        for (let i = 0; i < text.length; i += MAX_MESSAGE_LENGTH) {
          await this.app.client.chat.postMessage({
            token: this.botToken,
            channel,
            text: text.slice(i, i + MAX_MESSAGE_LENGTH),
          });
        }
      }
      logger.info({ jid, length: text.length }, 'Slack message sent');
    } catch (err) {
      logger.error({ jid, err }, 'Failed to send Slack message');
    }
  }

  isConnected(): boolean {
    return this.app !== null;
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('slack:');
  }

  async disconnect(): Promise<void> {
    if (this.app) {
      await this.app.stop();
      this.app = null;
      logger.info('Slack bot stopped');
    }
  }

  async setTyping(_jid: string, _isTyping: boolean): Promise<void> {
    // Slack Bot API does not expose a typing indicator endpoint — no-op
  }
}

registerChannel('slack', (opts: ChannelOpts) => {
  const envVars = readEnvFile(['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN']);
  const botToken = process.env.SLACK_BOT_TOKEN || envVars.SLACK_BOT_TOKEN || '';
  const appToken = process.env.SLACK_APP_TOKEN || envVars.SLACK_APP_TOKEN || '';
  if (!botToken || !appToken) {
    logger.warn('Slack: SLACK_BOT_TOKEN and/or SLACK_APP_TOKEN not set');
    return null;
  }
  return new SlackChannel(botToken, appToken, opts);
});
