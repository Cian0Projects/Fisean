-- Custom SQL migration file, put your code below! --
-- Every team from before clubs becomes a club of one, under its own id and name.
INSERT INTO `clubs` (`id`, `name`, `created_at`) SELECT `id`, `name`, `created_at` FROM `teams` WHERE `club_id` IS NULL;--> statement-breakpoint
UPDATE `teams` SET `club_id` = `id` WHERE `club_id` IS NULL;
