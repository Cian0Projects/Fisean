CREATE TABLE `clip_shares` (
	`clip_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`clip_id`, `user_id`),
	FOREIGN KEY (`clip_id`) REFERENCES `clips`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `clip_shares_user` ON `clip_shares` (`user_id`);--> statement-breakpoint
ALTER TABLE `clips` ADD `share_roles` text;--> statement-breakpoint
ALTER TABLE `playlists` ADD `share_roles` text;