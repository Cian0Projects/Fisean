CREATE TABLE `gps_names` (
	`team_id` text NOT NULL,
	`name_key` text NOT NULL,
	`name` text NOT NULL,
	`user_id` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`team_id`, `name_key`),
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
