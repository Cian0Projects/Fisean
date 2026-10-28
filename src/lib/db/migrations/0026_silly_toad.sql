CREATE TABLE `match_gps` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`team_id` text NOT NULL,
	`name` text NOT NULL,
	`total_distance` real NOT NULL,
	`hmld` real,
	`hsr` real,
	`max_speed` real,
	`percent_speed` real,
	`accels` integer,
	`decels` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `match_gps_match` ON `match_gps` (`match_id`);