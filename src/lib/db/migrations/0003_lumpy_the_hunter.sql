ALTER TABLE `match_stats` ADD `target_id` text REFERENCES users(id);--> statement-breakpoint
ALTER TABLE `match_stats` ADD `half` integer;--> statement-breakpoint
ALTER TABLE `match_stats` ADD `side` text;--> statement-breakpoint
ALTER TABLE `match_stats` ADD `shot_kind` text;--> statement-breakpoint
ALTER TABLE `match_stats` ADD `attempt_source` text;--> statement-breakpoint
ALTER TABLE `match_stats` ADD `possession` text;--> statement-breakpoint
ALTER TABLE `match_stats` ADD `front_eight` integer;--> statement-breakpoint
ALTER TABLE `match_stats` ADD `scorable` integer;--> statement-breakpoint
ALTER TABLE `match_stats` ADD `puckout_length` text;--> statement-breakpoint
ALTER TABLE `match_stats` ADD `past_sixty_five` integer;