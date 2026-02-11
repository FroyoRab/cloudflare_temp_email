import { Context } from "hono";
import { handleListQuery } from "../common";
import UserBindAddressModule from "./bind_address";

const SELECT_MAILS_WITH_MERGED_RAW =
    `SELECT rm.*, COALESCE((`
    + `SELECT GROUP_CONCAT(raw, '') FROM (`
    + `SELECT s.raw FROM raw_mails s`
    + ` WHERE s.address = rm.address`
    + ` AND ((rm.message_id IS NOT NULL AND s.message_id = rm.message_id)`
    + ` OR (rm.message_id IS NULL AND s.id = rm.id))`
    + ` ORDER BY s.shard_index ASC, s.id ASC`
    + `)`
    + `), rm.raw) AS raw FROM raw_mails rm`;

export default {
    getMails: async (c: Context<HonoCustomType>) => {
        const { user_id } = c.get("userPayload");
        const { address, limit, offset } = c.req.query();
        const bindedAddressList = await UserBindAddressModule.getBindedAddressListById(c, user_id);
        const addressList = address ? bindedAddressList.filter((item) => item == address) : bindedAddressList;
        const addressQuery = `rm.address IN (${addressList.map(() => "?").join(",")})`;
        const addressParams = addressList;

        // user must have at least one binded address to query mails
        if (addressList.length <= 0) {
            return c.json({ results: [], count: 0 });
        }

        const filterQuerys = [addressQuery].filter((item) => item).join(" and ");
        const finalQuery = filterQuerys.length > 0 ? `where ${filterQuerys}` : "";
        const filterParams = [...addressParams]
        return await handleListQuery(c,
            `${SELECT_MAILS_WITH_MERGED_RAW} ${finalQuery}`
            + ` and rm.shard_index = 0`,
            `SELECT count(*) as count FROM raw_mails ${finalQuery.replaceAll("rm.", "")}`
            + ` and shard_index = 0`,
            filterParams, limit, offset
        );
    },
    deleteMail: async (c: Context<HonoCustomType>) => {
        const { id } = c.req.param();
        const { user_id } = c.get("userPayload");
        const bindedAddressList = await UserBindAddressModule.getBindedAddressListById(c, user_id);
        const mailRecord = await c.env.DB.prepare(
            `SELECT address, message_id FROM raw_mails WHERE id = ?`
            + ` and address IN (${bindedAddressList.map(() => "?").join(",")})`
        ).bind(id, ...bindedAddressList).first<{ address: string | null, message_id: string | null }>();
        const { success } = await c.env.DB.prepare(
            mailRecord?.message_id
                ? `DELETE FROM raw_mails WHERE address = ? and message_id = ?`
                : `DELETE FROM raw_mails WHERE id = ?`
                + ` and address IN (${bindedAddressList.map(() => "?").join(",")})`
        ).bind(
            ...(mailRecord?.message_id && mailRecord?.address
                ? [mailRecord.address, mailRecord.message_id]
                : [id, ...bindedAddressList])
        ).run();
        return c.json({
            success: success
        })
    }
}
