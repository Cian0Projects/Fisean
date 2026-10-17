CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`user_id` text NOT NULL,
	`kind` text NOT NULL,
	`subject_id` text NOT NULL,
	`actor_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`sent_at` integer,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notifications_once` ON `notifications` (`user_id`,`kind`,`subject_id`);--> statement-breakpoint
CREATE INDEX `notifications_pending` ON `notifications` (`sent_at`,`user_id`);--> statement-breakpoint
CREATE TABLE `sign_in_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`purpose` text NOT NULL,
	`payload` text,
	`next` text,
	`code_hash` text NOT NULL,
	`link_hash` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`ip` text,
	`expires_at` integer NOT NULL,
	`used_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sign_in_requests_email` ON `sign_in_requests` (`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `sign_in_requests_ip` ON `sign_in_requests` (`ip`,`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`username` text,
	`display_name` text NOT NULL,
	`password_hash` text,
	`role` text DEFAULT 'player' NOT NULL,
	`position` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "team_id", "username", "display_name", "password_hash", "role", "position", "created_at", "last_seen_at") SELECT "id", "team_id", "username", "display_name", "password_hash", "role", "position", "created_at", "last_seen_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_username` ON `users` (`username`);