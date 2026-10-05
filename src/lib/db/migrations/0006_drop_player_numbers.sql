PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_match_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`team_id` text NOT NULL,
	`created_by` text,
	`stat_type` text NOT NULL,
	`outcome` text,
	`player_number` integer,
	`target_number` integer,
	`origin_x` real,
	`origin_y` real,
	`dest_x` real,
	`dest_y` real,
	`half` integer,
	`side` text,
	`shot_result` text,
	`shot_kind` text,
	`attempt_source` text,
	`led_to_score` integer,
	`possession` text,
	`front_eight` integer,
	`scorable` integer,
	`puckout_taken_by` text,
	`puckout_length` text,
	`past_sixty_five` integer,
	`clip_id` text,
	`video_id` text,
	`at_ms` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_match_stats`("id", "match_id", "team_id", "created_by", "stat_type", "outcome", "player_number", "target_number", "origin_x", "origin_y", "dest_x", "dest_y", "half", "side", "shot_result", "shot_kind", "attempt_source", "led_to_score", "possession", "front_eight", "scorable", "puckout_taken_by", "puckout_length", "past_sixty_five", "clip_id", "video_id", "at_ms", "created_at", "updated_at") SELECT "id", "match_id", "team_id", "created_by", "stat_type", "outcome", "player_number", "target_number", "origin_x", "origin_y", "dest_x", "dest_y", "half", "side", "shot_result", "shot_kind", "attempt_source", "led_to_score", "possession", "front_eight", "scorable", "puckout_taken_by", "puckout_length", "past_sixty_five", "clip_id", "video_id", "at_ms", "created_at", "updated_at" FROM `match_stats`;--> statement-breakpoint
DROP TABLE `match_stats`;--> statement-breakpoint
ALTER TABLE `__new_match_stats` RENAME TO `match_stats`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `match_stats_match` ON `match_stats` (`match_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `match_stats_team` ON `match_stats` (`team_id`);--> statement-breakpoint
CREATE INDEX `match_stats_video` ON `match_stats` (`video_id`,`at_ms`);--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `jersey_number`;