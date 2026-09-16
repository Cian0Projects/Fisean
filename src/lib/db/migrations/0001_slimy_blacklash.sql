CREATE TABLE `match_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`team_id` text NOT NULL,
	`created_by` text,
	`stat_type` text NOT NULL,
	`outcome` text,
	`player_id` text,
	`origin_x` real,
	`origin_y` real,
	`dest_x` real,
	`dest_y` real,
	`shot_result` text,
	`led_to_score` integer,
	`puckout_taken_by` text,
	`clip_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`player_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `match_stats_match` ON `match_stats` (`match_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `match_stats_team` ON `match_stats` (`team_id`);--> statement-breakpoint
CREATE INDEX `match_stats_player` ON `match_stats` (`player_id`);