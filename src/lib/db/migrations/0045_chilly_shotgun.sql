CREATE TABLE `stat_targets` (
	`team_id` text NOT NULL,
	`stat_key` text NOT NULL,
	`custom_stat_id` text,
	`measure` text NOT NULL,
	`direction` text NOT NULL,
	`target` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`team_id`, `stat_key`),
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`custom_stat_id`) REFERENCES `custom_stats`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `summary_picks` (
	`match_id` text NOT NULL,
	`team_id` text NOT NULL,
	`stage` text NOT NULL,
	`picks` text NOT NULL,
	`chosen_by` text,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`match_id`, `stage`),
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `summary_pins` (
	`team_id` text PRIMARY KEY NOT NULL,
	`first` text NOT NULL,
	`second` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
