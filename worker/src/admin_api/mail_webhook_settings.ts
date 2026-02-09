import { Context } from "hono";
import { CONSTANTS } from "../constants";
import { WebhookSettings } from "../models";
import { commonParseMail, getMergedRawMail, sendWebhook } from "../common";

async function getWebhookSettings(c: Context<HonoCustomType>): Promise<Response> {
    const settings = await c.env.KV.get<WebhookSettings>(
        CONSTANTS.WEBHOOK_KV_ADMIN_MAIL_SETTINGS_KEY, "json"
    ) || new WebhookSettings();
    return c.json(settings);
}

async function saveWebhookSettings(c: Context<HonoCustomType>): Promise<Response> {
    const settings = await c.req.json<WebhookSettings>();
    await c.env.KV.put(
        CONSTANTS.WEBHOOK_KV_ADMIN_MAIL_SETTINGS_KEY,
        JSON.stringify(settings));
    return c.json({ success: true })
}

async function testWebhookSettings(c: Context<HonoCustomType>): Promise<Response> {
    const settings = await c.req.json<WebhookSettings>();
    // random raw email
    const { id: mailId, raw, address, message_id } = await c.env.DB.prepare(
        `SELECT id, raw, address, message_id FROM raw_mails`
        + ` WHERE shard_index = 0`
        + ` ORDER BY RANDOM() LIMIT 1`
    ).first<{ id: string, raw: string, address: string, message_id: string | null }>() || {};
    const mergedRaw = address ? await getMergedRawMail(c, address, message_id, raw) : raw;
    const parsedEmailContext: ParsedEmailContext = { rawEmail: mergedRaw || "" };
    const parsedEmail = await commonParseMail(parsedEmailContext);
    const res = await sendWebhook(settings, {
        id: mailId || "0",
        url: c.env.FRONTEND_URL ? `${c.env.FRONTEND_URL}?mail_id=${mailId}` : "",
        from: parsedEmail?.sender || "test@test.com",
        to: "admin@test.com",
        subject: parsedEmail?.subject || "test subject",
        raw: mergedRaw || "test raw email",
        parsedText: parsedEmail?.text || "test parsed text",
        parsedHtml: parsedEmail?.html || "test parsed html"
    });
    if (!res.success) {
        return c.text(res.message || "send webhook error", 400);
    }
    return c.json({ success: true });
}

export default {
    getWebhookSettings,
    saveWebhookSettings,
    testWebhookSettings,
}
