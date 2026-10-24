PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_teams` (
	`id` text PRIMARY KEY NOT NULL,
	`club_id` text NOT NULL,
	`name` text NOT NULL,
	`join_code` text NOT NULL,
	`code` text DEFAULT 'hurling' NOT NULL,
	`half_length_min` integer DEFAULT 30 NOT NULL,
	`badge` blob,
	`badge_updated_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`club_id`) REFERENCES `clubs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_teams`("id", "club_id", "name", "join_code", "code", "half_length_min", "badge", "badge_updated_at", "created_at") SELECT "id", "club_id", "name", "join_code", "code", "half_length_min", "badge", "badge_updated_at", "created_at" FROM `teams`;--> statement-breakpoint
DROP TABLE `teams`;--> statement-breakpoint
ALTER TABLE `__new_teams` RENAME TO `teams`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `teams_join_code` ON `teams` (`join_code`);--> statement-breakpoint
CREATE INDEX `teams_club` ON `teams` (`club_id`);