ALTER TABLE raw_mails ADD COLUMN shard_index INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_raw_mails_address_message_id_shard
    ON raw_mails(address, message_id, shard_index);
