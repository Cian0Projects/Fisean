CREATE TABLE `match_lineups` (
	`match_id` text NOT NULL,
	`number` integer NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`match_id`, `number`),
	FOREIGN KEY (`match_id`) REFERENCES `matches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `match_lineups_player` ON `match_lineups` (`match_id`,`user_id`);--> statement-breakpoint
ALTER TABLE `match_stats` ADD `player_number` integer;--> statement-breakpoint
ALTER TABLE `match_stats` ADD `target_number` integer;