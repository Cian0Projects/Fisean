CREATE TABLE `footage_imports` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`video_id` text NOT NULL,
	`source_url` text NOT NULL,
	`source` text DEFAULT 'other' NOT NULL,
	`ranges` integer DEFAULT true NOT NULL,
	`received_bytes` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`video_id`) REFERENCES `videos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `footage_imports_team` ON `footage_imports` (`team_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `footage_imports_video` ON `footage_imports` (`video_id`);--> statement-breakpoint
ALTER TABLE `teams` ADD `code` text DEFAULT 'hurling' NOT NULL;