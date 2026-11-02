CREATE TABLE `custom_stat_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`stat_id` text NOT NULL,
	`match_id` text NOT NULL,
	`team_id` text NOT NULL,
	`created_by` text,
	`side` text DEFAULT 'us' NOT NULL,
	`player_number` integer,
	`opposition_number` integer,
	`outcome` text,
	`led_to_score` integer,
	`score` text,
	`origin_x` real,
	`origin_y` real,
	`dest_x` real,
	`dest_y` real,
	`half` integer,
	`half_ms` integer,
	`video_id` text,
	`at_ms` integer,
	`draft` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`stat_id`) REFERENCES `custom_stats`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `custom_stat_entries_match` ON `custom_stat_entries` (`match_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `custom_stat_entries_stat` ON `custom_stat_entries` (`stat_id`);--> statement-breakpoint
CREATE TABLE `custom_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`created_by` text,
	`name` text NOT NULL,
	`side_mode` text DEFAULT 'us' NOT NULL,
	`ask_player` integer DEFAULT true NOT NULL,
	`ask_opposition` integer DEFAULT false NOT NULL,
	`ask_outcome` integer DEFAULT false NOT NULL,
	`score_mode` text DEFAULT 'none' NOT NULL,
	`points` integer DEFAULT 0 NOT NULL,
	`archived_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `custom_stats_team` ON `custom_stats` (`team_id`,`created_at`);