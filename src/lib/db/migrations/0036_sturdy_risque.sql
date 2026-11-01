CREATE TABLE `storage_orphans` (
	`key` text PRIMARY KEY NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`last_seen_day` text NOT NULL,
	`nights` integer DEFAULT 1 NOT NULL
);
