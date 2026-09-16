ALTER TABLE `match_stats` ADD `video_id` text REFERENCES videos(id);--> statement-breakpoint
ALTER TABLE `match_stats` ADD `at_ms` integer;--> statement-breakpoint
CREATE INDEX `match_stats_video` ON `match_stats` (`video_id`,`at_ms`);