-- Every drawing now belongs to a comment. Carry the old standalone ones
-- across as comments with no words, on the same moment, by the same person,
-- so playback still stops on them. The annotations table is left in place
-- until this is confirmed in production.
INSERT INTO `comments` (`id`, `clip_id`, `user_id`, `parent_id`, `body`, `at_ms`, `shapes`, `created_at`)
SELECT `id`, `clip_id`, `user_id`, NULL, '', `at_ms`, `shapes`, `created_at`
FROM `annotations`
WHERE `id` NOT IN (SELECT `id` FROM `comments`);
