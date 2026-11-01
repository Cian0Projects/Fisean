CREATE TABLE `oppositions` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`key` text NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `oppositions_team_key` ON `oppositions` (`team_id`,`key`);--> statement-breakpoint
ALTER TABLE `clips` ADD `about_side` text DEFAULT 'us' NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `kind` text DEFAULT 'ours' NOT NULL;--> statement-breakpoint
ALTER TABLE `matches` ADD `opposition_id` text;--> statement-breakpoint
ALTER TABLE `matches` ADD `vs_opposition_id` text;--> statement-breakpoint
CREATE INDEX `matches_opposition` ON `matches` (`opposition_id`);--> statement-breakpoint
CREATE INDEX `matches_vs_opposition` ON `matches` (`vs_opposition_id`);