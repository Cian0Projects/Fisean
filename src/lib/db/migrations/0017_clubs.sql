CREATE TABLE `clubs` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
ALTER TABLE `teams` ADD `club_id` text REFERENCES clubs(id);--> statement-breakpoint
CREATE INDEX `teams_club` ON `teams` (`club_id`);