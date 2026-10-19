ALTER TABLE `match_stats` ADD `seen_at` integer;--> statement-breakpoint
ALTER TABLE `matches` ADD `throw_in_at` integer;--> statement-breakpoint
ALTER TABLE `matches` ADD `half_time_at` integer;--> statement-breakpoint
ALTER TABLE `matches` ADD `second_half_at` integer;--> statement-breakpoint
ALTER TABLE `matches` ADD `full_time_at` integer;