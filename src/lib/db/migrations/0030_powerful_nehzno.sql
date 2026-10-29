CREATE TABLE `stat_clocks` (
	`match_id` text NOT NULL,
	`user_id` text NOT NULL,
	`team_id` text NOT NULL,
	`throw_in_at` integer,
	`half_time_at` integer,
	`second_half_at` integer,
	`full_time_at` integer,
	`submitted_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`match_id`, `user_id`),
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `match_stats` ADD `half_ms` integer;--> statement-breakpoint
ALTER TABLE `match_stats` ADD `draft` integer DEFAULT false NOT NULL;