CREATE TABLE `drill_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `drill_groups_team` ON `drill_groups` (`team_id`);--> statement-breakpoint
ALTER TABLE `drills` ADD `group_id` text REFERENCES drill_groups(id);